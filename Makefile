# AlertMind ITSM — Makefile
.PHONY: up down logs build pull seed restart clean status shell-api shell-db

## Start all services
up:
	docker compose up -d
	@echo "✅ AlertMind running"
	@echo "   Frontend  → http://173.249.2.23"
	@echo "   API       → http://173.249.2.23/api/health"
	@echo "   Flowise   → http://173.249.2.23/flowise"
	@echo "   n8n       → http://173.249.2.23/webhook"

## Stop all services
down:
	docker compose down

## View logs (all services or specific: make logs s=api)
logs:
	docker compose logs -f $(s)

## Build images
build:
	docker compose build --no-cache

## Pull Ollama models (~30min first time)
pull:
	@echo "Pulling Ollama models (this takes 20-40 min)..."
	ollama pull llama3.3:70b-instruct-q4_K_M
	ollama pull nomic-embed-text
	ollama pull deepseek-r1:14b
	@echo "✅ Models ready"

## Init database (re-applies schema + seed; idempotent via IF NOT EXISTS / ON CONFLICT)
db-init:
	docker compose exec db psql -U alertmind -d alertmind -f /docker-entrypoint-initdb.d/init.sql

## Seed sample data (admin user + runbooks live in init.sql; safe to re-run)
seed: db-init

## Restart a service: make restart s=api
restart:
	docker compose restart $(s)

## Show status
status:
	docker compose ps
	@echo ""
	@echo "Ollama status:"
	@curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | head -5

## Shell into api container
shell-api:
	docker compose exec api sh

## Shell into db container
shell-db:
	docker compose exec db psql -U alertmind -d alertmind

## Clean volumes (DESTRUCTIVE)
clean:
	docker compose down -v
	@echo "⚠️  All volumes deleted"

## View DB tables
db-tables:
	docker compose exec db psql -U alertmind -d alertmind -c "\dt"

## Backup database
backup:
	docker compose exec db pg_dump -U alertmind alertmind > backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup saved"
