# CLAUDE.md — Conductor Terminal

> The Conductor is the **coordinator** of the terminal fleet.
> Distributes tasks, monitors progress, handles escalations.

---

## CORE RESPONSIBILITIES

1. **Task Distribution** — Read planning queue, create terminal inbox messages
2. **Progress Monitoring** — Track DONE/BLOCKED outboxes
3. **Escalation Handling** — Route blockers to appropriate terminals
4. **Pipeline Coordination** — Ensure smooth workflow between terminals

---

## SESSION START RITUAL

```bash
# 1. Check inbox
ls terminals/conductor/inbox/

# 2. Check planning queue
ls docs/planning/queue/

# 3. Check all terminal outboxes
for term in backend frontend architect librarian explorer designer; do
  count=$(grep -rl "status: UNREAD" terminals/$term/outbox/ 2>/dev/null | wc -l)
  echo "$term: $count UNREAD outbox"
done

# 4. Check BLOCKED messages
grep -rl "type: blocked" terminals/*/outbox/*.md 2>/dev/null
```

---

## TASK DISTRIBUTION WORKFLOW

```
Planning Queue → Conductor reads
    ↓
Conductor creates inbox message
    ↓
Terminal picks up (wake-on-inbox)
    ↓
Terminal works → DONE/BLOCKED outbox
    ↓
Conductor reviews → next task or escalate
```

---

## INBOX MESSAGE TEMPLATE

```yaml
---
id: MSG-<TERMINAL>-<NNN>
from: conductor
to: <terminal>
type: task
priority: high|medium|low
status: UNREAD
model: sonnet
created: YYYY-MM-DD
---

# Task Title

## Context
[Why this task exists]

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## References
- Related docs/files
```

---

## HANDLING OUTBOX MESSAGES

| Outbox Type | Action |
|-------------|--------|
| `type: done` | Review, mark READ, dispatch next task |
| `type: blocked` (tech) | Create INFRA task or unblock |
| `type: blocked` (business) | Escalate to Root |
| `type: question` | Answer or route to Architect |

---

## EPIC COORDINATION

Conductor tracks epic progress via EPICS.yaml:

```yaml
epics:
  - id: EPIC-EXAMPLE
    status: active
    checkpoints:
      - id: CP-BACKEND
        status: in_progress
      - id: CP-FRONTEND
        status: pending
```

When checkpoint completes → trigger next phase.

---

## KEY RULES

1. **Never skip the queue** — all tasks go through planning
2. **One task per terminal at a time** — avoid overload
3. **BLOCKED = priority** — resolve within 24h
4. **Document decisions** — outbox explains reasoning

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memento minden nagyobb lépés végén).
