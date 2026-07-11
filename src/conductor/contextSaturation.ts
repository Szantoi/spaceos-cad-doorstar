// contextSaturation.ts - Auto Context Saturation Detector
// Goal Persistence Pattern Phase 3 (2026-07-04)
//
// Monitors Conductor session turn count and triggers automatic re-anchoring
// when context saturation threshold is reached (>50 turns).

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadActiveEpic, getEpicProgress, getNextCheckpoint } from './epicManager';
import { saveGoalState } from './sessionState';
import * as terminalsConfig from '../config/terminals';

const TMUX_SOCKET = terminalsConfig.getTmuxSocket();
const STATE_DIR = '/opt/spaceos/terminals/conductor';
const TURN_COUNT_FILE = path.join(STATE_DIR, '.turn-count');

// Thresholds
const WARNING_THRESHOLD = 30;
const CRITICAL_THRESHOLD = 50;
const AUTO_REANCHOR_THRESHOLD = 50;

/**
 * Get current turn count from persistent file
 */
export function getTurnCount(): number {
  try {
    if (!fs.existsSync(TURN_COUNT_FILE)) {
      return 0;
    }
    const content = fs.readFileSync(TURN_COUNT_FILE, 'utf-8');
    return parseInt(content.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Increment turn count and save to disk
 */
export function incrementTurnCount(): number {
  const current = getTurnCount();
  const newCount = current + 1;

  try {
    fs.writeFileSync(TURN_COUNT_FILE, String(newCount), 'utf-8');
  } catch (error) {
    console.error('[contextSaturation] Failed to save turn count:', error);
  }

  return newCount;
}

/**
 * Reset turn count (called on new session or after re-anchoring)
 */
export function resetTurnCount(): void {
  try {
    if (fs.existsSync(TURN_COUNT_FILE)) {
      fs.unlinkSync(TURN_COUNT_FILE);
    }
    console.log('[contextSaturation] Turn count reset');
  } catch (error) {
    console.error('[contextSaturation] Failed to reset turn count:', error);
  }
}

/**
 * Check if Conductor session is running
 */
function isSessionRunning(): boolean {
  try {
    execSync(`tmux -S ${TMUX_SOCKET} has-session -t spaceos-conductor 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inject message to Conductor session
 */
function injectToSession(message: string): boolean {
  try {
    if (!isSessionRunning()) {
      return false;
    }

    const escapedMessage = message
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    execSync(`tmux -S ${TMUX_SOCKET} send-keys -t spaceos-conductor "${escapedMessage}" Enter Enter`, { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build re-anchoring context message
 */
function buildReAnchoringMessage(turnCount: number): string {
  const activeEpic = loadActiveEpic();

  if (!activeEpic) {
    return `⚠️ [AUTO RE-ANCHORING - ${turnCount} turns]

Nincs aktív epic! Ellenőrizd az EPICS.yaml-t.

---
*Context Saturation Detector — Goal Persistence Pattern*`;
  }

  const progress = getEpicProgress(activeEpic);
  const nextCheckpoint = getNextCheckpoint(activeEpic);
  const doneCount = activeEpic.checkpoints?.filter(cp => cp.status === 'done').length || 0;
  const totalCount = activeEpic.checkpoints?.length || 0;

  return `🔄 [AUTO RE-ANCHORING — ${turnCount} TURN ELÉRVE]

## ⚠️ CONTEXT SATURATION FIGYELMEZTETÉS

A session elérte a ${turnCount} turn-t. A kutatások szerint ennyi turn után a goal drift kockázat **jelentősen megnő**.

---

## 🎯 GOAL RE-STATEMENT

**A TE EGYETLEN FELADATOD:** Az \`${activeEpic.id}\` epic végigvitele!

| Metrika | Érték |
|---------|-------|
| **Epic** | \`${activeEpic.id}\` — ${activeEpic.name} |
| **Progress** | **${progress}%** (${doneCount}/${totalCount} checkpoint) |
| **Status** | \`${activeEpic.status}\` |

${nextCheckpoint ? `## ⏭️ KÖVETKEZŐ MILESTONE

\`${nextCheckpoint.id}\`: ${nextCheckpoint.name}

**Feltétel:** \`${nextCheckpoint.condition}\`

---

**IMMEDIATE ACTION:** Ellenőrizd a checkpoint státuszát és haladj tovább!` : `## ✅ ÖSSZES CHECKPOINT DONE!

Az epic kész a lezárásra.`}

---

## 💡 JAVASLATOK

1. **Fókuszálj a fő célra** — ne térj el részletekbe
2. **Ha bizonytalanná válsz** — olvasd újra ezt a re-anchoring üzenetet
3. **Ha túl komplex lett** — kérj új session-t a Monitor-tól

---
*Auto Re-Anchoring — Context Saturation Detector (>${AUTO_REANCHOR_THRESHOLD} turn)*
*Turn count reset. Új ciklus indul.*`;
}

/**
 * Check context saturation and trigger re-anchoring if needed
 * Returns: 'ok' | 'warning' | 'critical' | 'reanchored'
 */
export function checkContextSaturation(): 'ok' | 'warning' | 'critical' | 'reanchored' {
  const turnCount = getTurnCount();

  if (turnCount >= AUTO_REANCHOR_THRESHOLD) {
    // Trigger auto re-anchoring
    console.log(`[contextSaturation] Turn count ${turnCount} >= ${AUTO_REANCHOR_THRESHOLD}, triggering re-anchoring`);

    const reAnchorMessage = buildReAnchoringMessage(turnCount);
    const injected = injectToSession(reAnchorMessage);

    if (injected) {
      console.log('[contextSaturation] ✓ Re-anchoring message injected');
      // Reset turn count after re-anchoring
      resetTurnCount();
      // Save goal state
      saveGoalState(0, null);
      return 'reanchored';
    } else {
      console.warn('[contextSaturation] Failed to inject re-anchoring (session not running?)');
      return 'critical';
    }
  }

  if (turnCount >= CRITICAL_THRESHOLD) {
    return 'critical';
  }

  if (turnCount >= WARNING_THRESHOLD) {
    return 'warning';
  }

  return 'ok';
}

/**
 * Get saturation status for monitoring/reporting
 */
export function getSaturationStatus(): {
  turnCount: number;
  status: 'ok' | 'warning' | 'critical';
  warningThreshold: number;
  criticalThreshold: number;
  autoReanchorThreshold: number;
} {
  const turnCount = getTurnCount();
  let status: 'ok' | 'warning' | 'critical' = 'ok';

  if (turnCount >= CRITICAL_THRESHOLD) {
    status = 'critical';
  } else if (turnCount >= WARNING_THRESHOLD) {
    status = 'warning';
  }

  return {
    turnCount,
    status,
    warningThreshold: WARNING_THRESHOLD,
    criticalThreshold: CRITICAL_THRESHOLD,
    autoReanchorThreshold: AUTO_REANCHOR_THRESHOLD,
  };
}
