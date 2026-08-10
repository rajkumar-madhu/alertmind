import json
import logging
import os
import re
import requests
from datetime import datetime
from django.utils import timezone
from django.conf import settings
from django.db import connection
from celery import shared_task
from api.models import Ticket
from api.llm import generate

logger = logging.getLogger(__name__)

# Prompts
ITSM_PROMPT = """You are an expert ITSM engineer for AlertMind platform.
Answer ONLY using the retrieved context. Never hallucinate steps or commands.

RETRIEVED CONTEXT FROM KNOWLEDGE BASE:
{context}

INCIDENT QUERY:
{question}

Respond in this EXACT format:

🔴 ROOT CAUSE:
[2-3 sentence precise root cause based only on retrieved context]

🔧 RESOLUTION STEPS:
1. [Concrete actionable step with exact command if available]
2. [Step 2]
3. [Step 3]
4. [Step 4]
5. [Verification step to confirm resolution]

📋 SIMILAR INCIDENTS:
[Reference relevant past incidents from context with ticket IDs, or "No similar incidents found in KB"]

🛡️ PREVENTION:
[2-3 specific prevention measures from context]

📊 CONFIDENCE: HIGH

CRITICAL: If context is insufficient, respond exactly:
"No matching runbook found. Escalate to L2 support."
"""

P1_PROMPT = """⚠️ CRITICAL P1 INCIDENT — SLA: 15 MINUTES — BE FAST AND PRECISE

Context from KB: {context}
Incident: {question}

⚡ IMMEDIATE ACTION: [The single most important step to take RIGHT NOW]

🔧 RESOLUTION STEPS:
1. [Step with exact command]
2. [Step 2]
3. [Step 3]
4. [Verify resolution]

📞 ESCALATE TO: [Team or person from runbook, or "L2 Platform Team"]

📊 CONFIDENCE: HIGH
"""

def generate_embedding(text):
    """Generate 768-dim embedding via Ollama API"""
    url = f"{settings.OLLAMA_BASE_URL}/api/embeddings"
    payload = {
        "model": settings.EMBED_MODEL,
        "prompt": text
    }
    try:
        response = requests.post(url, json=payload, timeout=5)
        response.raise_for_status()
        return response.json().get("embedding")
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return None

def query_vector_store(query_text, collection="all", limit=5):
    """Perform similarity vector search on Postgres pgvector using match_documents function"""
    embedding = generate_embedding(query_text)
    if not embedding:
        return []

    try:
        # Format the embedding array for PostgreSQL vector type
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"
        
        # Build filter JSONB
        filt = {}
        if collection != "all":
            filt = {"collection": collection}

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, content, metadata, 1 - (embedding <=> %s::vector) AS similarity FROM alertmind_documents WHERE metadata @> %s::jsonb ORDER BY embedding <=> %s::vector LIMIT %s",
                [embedding_str, json.dumps(filt), embedding_str, limit]
            )
            rows = cursor.fetchall()
            
        results = []
        for r in rows:
            results.append({
                "id": str(r[0]),
                "content": r[1],
                "metadata": r[2] if isinstance(r[2], dict) else json.loads(r[2] or "{}"),
                "similarity": float(r[3])
            })
        return results
    except Exception as e:
        logger.error(f"Postgres vector query failed: {e}")
        return []

def parse_llm_response(text, is_p1=False):
    """Extract sections from the structured LLM output"""
    def extract_section(section_name, next_markers):
        import re
        # Build dynamic regex pattern to find content between markers
        markers_pattern = "|".join(re.escape(m) for m in next_markers)
        pattern = rf"{re.escape(section_name)}[:\s]+([\s\S]*?)(?=\n(?:{markers_pattern})|$)"
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1).strip() if match else ""

    if is_p1:
        immediate_action = extract_section("⚡ IMMEDIATE ACTION", ["🔧 RESOLUTION STEPS", "📞 ESCALATE TO", "📊 CONFIDENCE"])
        steps_text = extract_section("🔧 RESOLUTION STEPS", ["📞 ESCALATE TO", "📊 CONFIDENCE"])
        escalate = extract_section("📞 ESCALATE TO", ["📊 CONFIDENCE"])
        
        # Parse numerical steps (prefix stripping happens in the loop below)
        steps = [
            line.strip()
            for line in steps_text.split("\n")
            if line.strip() and (line.strip()[0].isdigit() or line.strip().startswith("-"))
        ]
        # Clean up step prefixes
        cleaned_steps = []
        for s in steps:
            s_clean = re.sub(r'^\d+[\.\-\)]\s*', '', s).strip()
            if s_clean:
                cleaned_steps.append(s_clean)

        return {
            "root_cause": immediate_action or "Critical P1 incident detected.",
            "steps": cleaned_steps or ["Verify server status.", "Check load and logs.", "Escalate if unresolved."],
            "similar": "P1 critical escalation",
            "prevention": "Review architecture and alert policies.",
            "escalate": True
        }
    else:
        root_cause = extract_section("🔴 ROOT CAUSE", ["🔧 RESOLUTION STEPS", "📋 SIMILAR INCIDENTS", "🛡️ PREVENTION", "📊 CONFIDENCE"])
        steps_text = extract_section("🔧 RESOLUTION STEPS", ["📋 SIMILAR INCIDENTS", "🛡️ PREVENTION", "📊 CONFIDENCE"])
        similar = extract_section("📋 SIMILAR INCIDENTS", ["🛡️ PREVENTION", "📊 CONFIDENCE"])
        prevention = extract_section("🛡️ PREVENTION", ["📊 CONFIDENCE"])

        # Parse numerical steps
        steps = []
        for line in steps_text.split("\n"):
            line_stripped = line.strip()
            if line_stripped:
                # If matches starting with number e.g. "1. Step"
                match = re.match(r'^\d+[\.\-\)]\s*(.*)', line_stripped)
                if match:
                    steps.append(match.group(1).strip())
                elif line_stripped.startswith("-") or line_stripped.startswith("*"):
                    steps.append(line_stripped[1:].strip())

        return {
            "root_cause": root_cause or "Analysis complete.",
            "steps": steps or ["Diagnose issue manually.", "Escalate to L2 support if required."],
            "similar": similar or "No similar incidents found in KB.",
            "prevention": prevention or "Verify system configurations and monitoring rules.",
            "escalate": "escalate to l2" in text.lower() or not steps
        }

@shared_task
def analyze_ticket_task(ticket_id):
    """Celery background task to perform RAG and analyze an incident"""
    try:
        ticket = Ticket.objects.get(id=ticket_id)
    except Ticket.DoesNotExist:
        logger.error(f"Ticket {ticket_id} not found for analysis.")
        return

    logger.info(f"Starting Celery RAG analysis for Ticket {ticket.id} [{ticket.severity}]")

    # 1. Build Query
    query = f"ITSM Incident: {ticket.title}\nDescription: {ticket.description}\nCategory: {ticket.category}"
    
    # 2. Query Vector Store for relevant context
    results = query_vector_store(query, collection="all", limit=5)
    
    # Combine results to context string
    context_parts = []
    for doc in results:
        meta = doc.get("metadata", {})
        source = meta.get("ticket_id") or meta.get("source_file") or "KB"
        context_parts.append(f"Source: {source}\nContent: {doc['content']}")
    
    context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant runbooks found in KB."
    
    # 3. Call LLM (Ollama)
    is_p1 = ticket.severity == "P1"
    prompt_template = P1_PROMPT if is_p1 else ITSM_PROMPT
    
    # Inject variables into template
    prompt = prompt_template.format(context=context, question=query)
    
    try:
        llm_text = generate(prompt, temperature=0.2, timeout=45)
        
        # 4. Parse results
        parsed = parse_llm_response(llm_text, is_p1=is_p1)
        
        # Calculate confidence based on search similarity scores
        if results:
            avg_score = sum(d["similarity"] for d in results) / len(results)
            confidence = min(98, max(10, int(avg_score * 100)))
        else:
            confidence = 15
            
        # 5. Update Ticket
        ticket.ai_resolution = parsed["root_cause"]
        ticket.ai_steps = parsed["steps"]
        ticket.ai_confidence = confidence
        ticket.ai_analyzed = True
        ticket.ai_analyzed_at = timezone.now()
        ticket.save()
        
        logger.info(f"Celery analysis complete for Ticket {ticket.id}. Confidence: {confidence}%")
        
    except Exception as llm_err:
        logger.error(f"LLM generation failed for Ticket {ticket.id}: {llm_err}")
        # Mark analyzed as True with error fallback to not hang
        ticket.ai_resolution = "AI Analysis failed to contact LLM backend. Please escalate to L2 support."
        ticket.ai_steps = ["Manually review system dashboards.", "Escalate to L2 support."]
        ticket.ai_confidence = 0
        ticket.ai_analyzed = True
        ticket.ai_analyzed_at = timezone.now()
        ticket.save()

@shared_task
def check_sla_breaches_task():
    """Periodic task to scan open/in-progress tickets and mark them if they exceed their due date"""
    now = timezone.now()
    # Find active tickets that are past due and not marked as breached
    breached_tickets = Ticket.objects.filter(
        status__in=["open", "in-progress"],
        sla_due_at__lt=now,
        sla_breached=False
    )
    
    count = breached_tickets.count()
    if count > 0:
        logger.warning(f"Detected {count} SLA-breached tickets!")
        for ticket in breached_tickets:
            ticket.sla_breached = True
            ticket.save()
            
            # Send notifications (e.g. to Slack)
            slack_webhook = os.environ.get("SLACK_WEBHOOK_URL")
            if slack_webhook and "YOUR/SLACK/WEBHOOK" not in slack_webhook:
                try:
                    msg = {
                        "text": f"🚨 *SLA BREACH ALERT* 🚨\nTicket ID: `{ticket.id}`\nTitle: *{ticket.title}*\nSeverity: `{ticket.severity}`\nCategory: `{ticket.category}`\nAssignee: `{ticket.assignee.name if ticket.assignee else 'Unassigned'}`\nDue: {ticket.sla_due_at.strftime('%Y-%m-%d %H:%M:%S UTC')}"
                    }
                    requests.post(slack_webhook, json=msg, timeout=5)
                except Exception as slack_err:
                    logger.error(f"Failed to post SLA breach alert to Slack: {slack_err}")
                    
        return f"Successfully processed {count} SLA breaches."
    return "No new SLA breaches detected."
