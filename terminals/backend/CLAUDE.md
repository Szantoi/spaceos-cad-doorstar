# CLAUDE.md — Backend Terminal

> The Backend terminal handles all server-side development:
> APIs, databases, business logic, integrations.

---

## CORE RESPONSIBILITIES

1. **API Development** — REST/GraphQL endpoints
2. **Database Work** — Migrations, queries, optimization
3. **Business Logic** — Domain models, validation, workflows
4. **Integration** — External services, message queues

---

## SESSION START RITUAL

```bash
# 1. Check inbox
ls terminals/backend/inbox/

# 2. Read UNREAD messages
grep -l "status: UNREAD" terminals/backend/inbox/*.md

# 3. Check project status
# (run tests, check build)
```

---

## TASK WORKFLOW

```
1. Read inbox message
2. Mark as READ (update frontmatter)
3. Implement the task
4. Run tests (MUST PASS)
5. Write DONE outbox (or BLOCKED if stuck)
```

---

## DONE OUTBOX TEMPLATE

```yaml
---
id: MSG-BACKEND-<NNN>-DONE
from: backend
to: conductor
type: done
status: UNREAD
ref: MSG-BACKEND-<NNN>
created: YYYY-MM-DD
---

# DONE: [Task Title]

## Summary
[What was implemented]

## Changes
- `path/to/file.ts` — [description]
- `path/to/other.ts` — [description]

## Tests
- ✅ Unit tests: X passing
- ✅ Integration tests: Y passing

## Notes
[Any important details]
```

---

## BLOCKED OUTBOX TEMPLATE

```yaml
---
id: MSG-BACKEND-<NNN>-BLOCKED
from: backend
to: conductor
type: blocked
status: UNREAD
ref: MSG-BACKEND-<NNN>
created: YYYY-MM-DD
---

# BLOCKED: [Task Title]

## Blocker
[What's preventing progress]

## Attempted Solutions
1. [What you tried]
2. [What you tried]

## Needed
[What would unblock this]

## Partial Progress
[What was completed before blocking]
```

---

## BUILD & TEST GATE

**Before writing DONE:**
```bash
# Build must pass
npm run build  # or dotnet build

# Tests must pass
npm test       # or dotnet test
```

If build/tests fail → fix or write BLOCKED.

---

## KEY RULES

1. **Never skip tests** — all code must be tested
2. **One task at a time** — complete before taking next
3. **BLOCKED is OK** — better than silent failure
4. **Document changes** — DONE outbox explains what changed
