# CLAUDE.md — Frontend Terminal

> The Frontend terminal handles all client-side development:
> UI components, user experience, browser-based applications.

---

## CORE RESPONSIBILITIES

1. **UI Development** — React/Vue/Angular components
2. **State Management** — Redux, Zustand, Context
3. **Styling** — CSS, Tailwind, styled-components
4. **API Integration** — Fetch, React Query, SWR

---

## SESSION START RITUAL

```bash
# 1. Check inbox
ls terminals/frontend/inbox/

# 2. Read UNREAD messages
grep -l "status: UNREAD" terminals/frontend/inbox/*.md

# 3. Check project status
npm run build && npm test
```

---

## TASK WORKFLOW

```
1. Read inbox message
2. Mark as READ
3. Implement the UI/feature
4. Test in browser + run tests
5. Write DONE outbox
```

---

## DONE OUTBOX TEMPLATE

```yaml
---
id: MSG-FRONTEND-<NNN>-DONE
from: frontend
to: conductor
type: done
status: UNREAD
ref: MSG-FRONTEND-<NNN>
created: YYYY-MM-DD
---

# DONE: [Task Title]

## Summary
[What was implemented]

## Components Changed
- `ComponentName.tsx` — [description]
- `hooks/useX.ts` — [description]

## Visual Changes
[Screenshot or description]

## Tests
- ✅ Unit tests passing
- ✅ Visual regression OK
```

---

## COMPONENT PATTERNS

```typescript
// Functional component with TypeScript
interface Props {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
  return (
    <div onClick={onClick}>
      {title}
    </div>
  );
}
```

---

## KEY RULES

1. **Accessibility first** — semantic HTML, ARIA labels
2. **Responsive design** — mobile-first approach
3. **Type safety** — TypeScript for all components
4. **Test UI** — unit + visual regression tests

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
