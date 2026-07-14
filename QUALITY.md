# QUALITY.md — Minőségi elvárások (Gábor)

> Ez a fájl a munkával kapcsolatos minőségi elvárásokat rögzíti.
> Minden agent (root, monitor, conductor és a specialisták) minden munkájára vonatkozik.
> Domain-független: a szakma-specifikus szabályok a sziget/terminál CLAUDE.md-kben élnek.
> Forrás: Gábor, 2026-07-14. Módosítani csak vele egyeztetve.

---

## 1. Cél és irányítás (goal-fókusz)

- **Minden projektnek definiált célja van, és definiált leállási feltétele** — meg kell határozni, mikor hagyjuk abba.
- A munka hierarchiája: **program** (legnagyobb egység, több projektet tartalmaz) → **projekt** → **mérföldkő** → **epic** → **task**.
- A projekt állapotát folyamatosan vezetni kell (EPICS.yaml / goal-config — a cél nem a beszélgetés-kontextusban él).
- A sarokkövek mérhető feltétellel definiáltak: „kész" csak az, ami bizonyítottan teljesült.

## 2. Tervezés

- **Teljes architekturális tervezés nélkül nem kezdünk új feature fejlesztésébe.**
- Ha embernek tervezünk: **a UX legyen rendben.**
- Ha gépnek tervezünk: **a kimenet legyen minél könnyebben feldolgozható** (strukturált, parszolható).
- A döntéseket dokumentáljuk (ADR-minta), a tervezési szándékot (design intent) is rögzítjük, ne csak a végeredményt.

## 3. Kódolás

- **Clean code** és **DDD** (domain-driven design) elvek szerint dolgozunk.
- **Minden legyen kommentelve és README-vel ellátva.**
- **Nincsenek nagy fájlok** — bontsd fel, ha nő.
- **Nincs hardcodolt adat**: minden configból jön, hogy tudni lehessen, mit hol állítunk.
- **A futó kódot loggal kell tudni nyomon követni** — minden folyamatról látszódjon, hogy megfelelően végigment-e.

## 4. Tesztelés és ellenőrzés

- **Tesztekkel kell ellátni az egyes funkciókat ÉS a nagyobb összefüggéseket is** (unit + integráció).
- Az eredményt a végén **össze kell vetni az elvárásokkal** — nem tértünk-e el tőlük.
- **A kivitelezést rögzíteni kell a task-fájlba** (mi készült, hogyan, mi az eredmény).

## 5. Hatékonyság (token-tudatosság)

- **Minimalizáljuk a token-használatot.**
- **Nem kell mindig LLM-nek generálnia a kódot vagy a megoldást**: az a jó, ha **paraméterezhető szkript** készül, amit a változásoknál újra fel lehet használni.
- **Ami bevált, azt rögzítjük**: skillekben, tudástárban, sablonokban.
- **Minden nagyobb lépés végén memória-mentés** (memory / MEMORY.md / tudástár).

## 6. Munkamódszer

- Van egy alap-működés, de **a módszereket mindig nyitottan, a cél alapján találjuk ki** — nem ragaszkodunk folyton mindenhez.
- **Specializált agenteket használunk, akár többet is**, hogy a közös munka megossza a kontextust és a figyelem fókuszált maradjon.

## 7. Stabilitás és biztonság

- Stabilitás > új feature; rollback-elhetőség; backup a kockázatos lépések előtt.
- Runtime-adat, secrets, tokenek, `.env` sosem kerülnek gitre.
