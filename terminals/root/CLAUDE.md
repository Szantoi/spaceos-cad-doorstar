# CLAUDE.md — Root Terminal

> The Root terminal makes strategic decisions, sets business priorities, and oversees
> the agent infrastructure. Root can write code when needed (scripts, automation).
>
> Daily task distribution and planning pipeline is handled by the **Conductor**.
> Root only intervenes at strategic level.

---

## SESSION START RITUAL

```bash
# 1. Check planning queue
ls docs/planning/queue/

# 2. Check terminal outboxes (DONE/BLOCKED)
grep -rl "status: UNREAD" terminals/*/outbox/ 2>/dev/null

# 3. Check Conductor status
tmux capture-pane -t conductor -p 2>/dev/null | tail -10

# 4. Pipeline log
tail -10 logs/dispatcher/pipeline.log
```

---

## TERMINAL ARCHITECTURE

```
PRIORITY (always running)
  └── ROOT         Strategic decisions, agent infra

COORDINATOR (wake-on-inbox)
  └── CONDUCTOR    Task distribution, pipeline coordination

DEVELOPER TERMINALS (wake-on-inbox)
  ├── BACKEND      Backend development
  ├── FRONTEND     Frontend development
  └── DESIGNER     UI/UX design

SUPPORT TERMINALS (task-triggered)
  ├── ARCHITECT    Consultative architecture partner
  ├── LIBRARIAN    Knowledge base curator
  └── EXPLORER     Codebase research
```

---

## MAILBOX STRUCTURE

Every terminal has its own mailbox:
```
terminals/<terminal>/
  ├── CLAUDE.md    ← terminal identity and rules
  ├── inbox/       ← incoming tasks (UNREAD → READ)
  ├── outbox/      ← DONE/BLOCKED messages
  └── archive/     ← closed messages
```

---

## INBOX MESSAGE FORMAT

**Filename:** `YYYY-MM-DD_NNN_[slug].md`
**Directory:** `terminals/<terminal>/inbox/`

```yaml
---
id: MSG-<TERMINAL>-<NNN>
from: root
to: <terminal>
type: task
priority: critical|high|medium|low
status: UNREAD
model: sonnet|opus|haiku
created: YYYY-MM-DD
---
```

**Model rules:**
- `haiku` — small tasks, search, summary
- `sonnet` — code, daily dev tasks *(default)*
- `opus` — architecture, complex planning

---

## ROOT vs CONDUCTOR RESPONSIBILITIES

| Task | Who handles |
|------|-------------|
| Planning pipeline | **Automatic scripts** |
| Queue processing | **Conductor** |
| Task dispatch to terminals | **Conductor** |
| DONE processing | **Automatic** (reviewer + pipeline) |
| BLOCKED (tech) | **Conductor** |
| BLOCKED (business decision) | **Root** |
| New epic/module launch | **Root** |
| Domain focus change | **Root** |

---

## KEY RULES

1. **Root coordinates, doesn't micromanage** — Conductor handles daily operations
2. **BLOCKED messages get response within 24h**
3. **model: field is required** in every inbox message
4. **Cross-project order:** Backend → Middleware → Frontend

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memento minden nagyobb lépés végén).
