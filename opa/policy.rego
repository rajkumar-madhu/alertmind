package alertmind.authz

import rego.v1

default allow := false

# Admins can do anything
allow if {
    input.user.roles[_] == "admin"
}

# Engineers can read any resource
allow if {
    input.user.roles[_] == "engineer"
    input.action == "read"
}

# Engineers can create tickets and comments
allow if {
    input.user.roles[_] == "engineer"
    input.action == "create"
    valid_engineer_create_resource
}

# Engineers can update tickets if they are the creator or assignee
allow if {
    input.user.roles[_] == "engineer"
    input.action == "update"
    input.resource == "ticket"
    is_owner_or_assignee
}

# Engineers can update comments if they are the creator
allow if {
    input.user.roles[_] == "engineer"
    input.action == "update"
    input.resource == "comment"
    is_comment_owner
}

# Engineers can update shared operational resources (runbooks, CMDB items).
# These are shared libraries, not user-owned, so no ownership check applies.
# Delete is intentionally NOT granted here — destructive removal of shared
# infra/runbooks stays admin-only.
allow if {
    input.user.roles[_] == "engineer"
    input.action == "update"
    input.resource in {"runbook", "cmdb"}
}

# Viewers can read any resource
allow if {
    input.user.roles[_] == "viewer"
    input.action == "read"
}

valid_engineer_create_resource if {
    input.resource == "ticket"
}

valid_engineer_create_resource if {
    input.resource == "comment"
}

# Engineers (and admins) can ingest documents into the knowledge base.
# `/api/ingest/` maps to the "document" resource in the middleware.
valid_engineer_create_resource if {
    input.resource == "document"
}

# Engineers can author runbooks and register CMDB items — the frontend
# exposes "+ Add Runbook"/"+ Add CI" to all users and RunbookViewSet stamps
# the engineer as `created_by`, so these creates must reach non-admins.
valid_engineer_create_resource if {
    input.resource == "runbook"
}

valid_engineer_create_resource if {
    input.resource == "cmdb"
}

is_owner_or_assignee if {
    input.resource_owner == input.user.email
}

is_owner_or_assignee if {
    input.resource_assignee == input.user.email
}

is_comment_owner if {
    input.resource_owner == input.user.email
}
