/**
 * watchConductorProgress.ts — Conductor folyamatos munka trigger
 *
 * Célja: A Conductor aktívan görgesse tovább a fejlesztési folyamatokat
 *
 * Működés:
 * 1. Ellenőrzi hogy a Conductor fut-e
 * 2. Ha fut ÉS idle (nincs friss aktivitás) → nudge küldés
 * 3. Ellenőrzi a queue-t, outbox-okat, planning pipeline-t
 * 4. Ha van feldolgozható munka → explicit prompt injection
 *
 * 2026-07-02: Conductor auto-trigger implementáció
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  SPACEOS_ROOT,
  hasSession,
  sendKeys,
  sendEnter,
  capturePane,
  getState,
  setState,
  log,
  telegram,
} from './common';

// ─── Config ─────────────────────────────────────────────────────────────────

const CONDUCTOR_SESSION = 'spaceos-conductor';
const CONDUCTOR_TERMINAL = 'conductor';
// TEST MODE: Faster intervals for testing
// TODO: Revert to 30/60 after testing
const IDLE_THRESHOLD_MINUTES = 2; // Conductor idle 2+ perc → nudge (was 30)
const NUDGE_INTERVAL_MINUTES = 4; // Max 1x/4min nudge (was 60)

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConductorProgressResult {
  running: boolean;
  idle: boolean;
  nudged: boolean;
  reason?: string;
  workAvailable?: {
    queue: number;
    outbox: number;
    planning: number;
  };
}

// ─── Detect idle Conductor ──────────────────────────────────────────────────

async function isConductorIdle(): Promise<{ idle: boolean; lastActivity?: number }> {
  const stateKey = 'conductor_last_activity';
  const lastActivityStr = await getState(stateKey);

  if (!lastActivityStr) {
    // No activity recorded → assume idle
    return { idle: true };
  }

  const lastActivity = parseInt(lastActivityStr, 10);
  const now = Math.floor(Date.now() / 1000);
  const idleSeconds = now - lastActivity;
  const idleMinutes = Math.floor(idleSeconds / 60);

  return {
    idle: idleMinutes >= IDLE_THRESHOLD_MINUTES,
    lastActivity: idleMinutes,
  };
}

// ─── Check work availability ────────────────────────────────────────────────

async function checkWorkAvailable(): Promise<{
  queue: number;
  outbox: number;
  planning: number;
  total: number;
}> {
  let queue = 0;
  let outbox = 0;
  let planning = 0;

  // 1. Planning queue
  try {
    const queuePath = path.join(SPACEOS_ROOT, 'docs/planning/queue');
    const files = await fs.readdir(queuePath);
    queue = files.filter(f => f.endsWith('.md')).length;
  } catch {
    // Queue directory might not exist
  }

  // 2. Terminal outbox UNREAD (DONE/BLOCKED waiting for Conductor review)
  const terminals = ['backend', 'frontend', 'designer', 'architect', 'librarian', 'explorer'];
  for (const term of terminals) {
    try {
      const outboxPath = path.join(SPACEOS_ROOT, `terminals/${term}/outbox`);
      const files = await fs.readdir(outboxPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await fs.readFile(path.join(outboxPath, file), 'utf-8');
        if (content.includes('status: UNREAD')) {
          outbox++;
        }
      }
    } catch {
      // Outbox might not exist
    }
  }

  // 3. Planning pipeline (ideas, selected, debate)
  const planningStages = ['ideas', 'selected', 'debate'];
  for (const stage of planningStages) {
    try {
      const stagePath = path.join(SPACEOS_ROOT, `docs/planning/${stage}`);
      const files = await fs.readdir(stagePath);
      planning += files.filter(f => f.endsWith('.md')).length;
    } catch {
      // Stage directory might not exist
    }
  }

  return {
    queue,
    outbox,
    planning,
    total: queue + outbox + planning,
  };
}

// ─── Nudge Conductor ────────────────────────────────────────────────────────

async function nudgeConductor(work: { queue: number; outbox: number; planning: number }): Promise<boolean> {
  const nudgeKey = 'conductor_progress_nudge';
  const lastNudgeStr = await getState(nudgeKey);
  const now = Math.floor(Date.now() / 1000);

  if (lastNudgeStr) {
    const lastNudge = parseInt(lastNudgeStr, 10);
    const elapsedMinutes = Math.floor((now - lastNudge) / 60);

    if (elapsedMinutes < NUDGE_INTERVAL_MINUTES) {
      // Too soon since last nudge
      return false;
    }
  }

  // Build nudge message
  const workSummary: string[] = [];
  if (work.queue > 0) workSummary.push(`queue: ${work.queue}`);
  if (work.outbox > 0) workSummary.push(`outbox DONE: ${work.outbox}`);
  if (work.planning > 0) workSummary.push(`planning: ${work.planning}`);

  const nudgeMsg = `
🔄 Conductor folytatható munka észlelve:
${workSummary.join(' | ')}

Kérlek dolgozd fel az elakadt ügyeket. Workflow:
1. Outbox DONE review (terminals/*/outbox/)
2. Planning queue dispatch (docs/planning/queue/)
3. Blocked escalation handling
`.trim();

  await sendKeys(CONDUCTOR_SESSION, nudgeMsg);
  await new Promise(r => setTimeout(r, 500));
  await sendEnter(CONDUCTOR_SESSION);
  await new Promise(r => setTimeout(r, 1000));
  await sendEnter(CONDUCTOR_SESSION);

  await setState(nudgeKey, String(now));
  await log(`[WatchConductorProgress] Nudge sent: ${workSummary.join(', ')}`);

  return true;
}

// ─── Update Conductor activity ──────────────────────────────────────────────

async function updateConductorActivity(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await setState('conductor_last_activity', String(now));
}

// ─── Main watcher ───────────────────────────────────────────────────────────

export async function watchConductorProgress(): Promise<ConductorProgressResult> {
  const result: ConductorProgressResult = {
    running: false,
    idle: false,
    nudged: false,
  };

  // 1. Check if Conductor session is running
  const sessionRunning = await hasSession(CONDUCTOR_SESSION);
  result.running = sessionRunning;

  if (!sessionRunning) {
    // Conductor not running - watchPriority will handle auto-start
    result.reason = 'Session not running (watchPriority handles start)';
    return result;
  }

  // 2. Check if Conductor is idle
  const idleCheck = await isConductorIdle();
  result.idle = idleCheck.idle;

  if (!idleCheck.idle) {
    // Conductor is active - no need to nudge
    result.reason = `Active (last activity: ${idleCheck.lastActivity} min ago)`;
    return result;
  }

  // 3. Check if there's work available
  const work = await checkWorkAvailable();
  result.workAvailable = work;

  if (work.total === 0) {
    // No work available - Conductor can idle
    result.reason = 'No work available (idle OK)';
    return result;
  }

  // 4. Work available + Conductor idle → nudge
  const nudged = await nudgeConductor(work);
  result.nudged = nudged;

  if (nudged) {
    result.reason = `Nudged: ${work.queue} queue, ${work.outbox} outbox, ${work.planning} planning`;
    await telegram(`🔄 *Conductor Progress Nudge*\n\`\`\`\nQueue: ${work.queue}\nOutbox DONE: ${work.outbox}\nPlanning: ${work.planning}\n\`\`\``);
  } else {
    result.reason = 'Nudge throttled (too soon since last nudge)';
  }

  return result;
}

// ─── Activity tracker (called by other watchers) ───────────────────────────

/**
 * Call this from watchInbox, watchDone, etc. when Conductor processes something
 * This prevents unnecessary nudges when Conductor is actively working
 */
export async function trackConductorActivity(): Promise<void> {
  await updateConductorActivity();
}

// ─── Standalone execution ───────────────────────────────────────────────────

if (require.main === module) {
  watchConductorProgress().then(result => {
    console.log('[WatchConductorProgress] Result:', JSON.stringify(result, null, 2));
  });
}
