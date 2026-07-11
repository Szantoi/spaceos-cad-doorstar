/**
 * skillFactory.ts — Automatic skill generation from work patterns
 *
 * Inspired by Marveen: https://github.com/Szotasz/marveen
 *
 * Analyzes completed tasks and conversations to:
 * 1. Detect reusable patterns worth preserving as skills
 * 2. Extract workflow steps, tools, and decision points
 * 3. Generate SKILL.md with proper structure
 * 4. Register skills in the index
 *
 * Trigger conditions:
 * - User explicitly requests skill creation
 * - Complex task (5+ steps) completed successfully
 * - Error recovery pattern detected
 * - User corrections reveal generalizable patterns
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { log as pipelineLog } from './common';
import { saveMemory } from './memoryStore';

const log = (prefix: string, message: string) => pipelineLog(`[${prefix}] ${message}`);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillCandidate {
  id: string;
  name: string;
  description: string;
  triggerPhrases: string[];
  steps: WorkflowStep[];
  tools: string[];
  pitfalls: string[];
  prerequisites: string[];
  examples: SkillExample[];
  source: 'conversation' | 'task' | 'error_recovery' | 'manual';
  confidence: number; // 0.0 - 1.0
  createdAt: string;
}

export interface WorkflowStep {
  order: number;
  action: string;
  command?: string;
  decision?: string;
  notes?: string;
}

export interface SkillExample {
  trigger: string;
  outcome: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  timestamp?: string;
}

export interface SkillGenerationResult {
  success: boolean;
  skillPath?: string;
  skillName?: string;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SKILLS_DIR = '/opt/spaceos/.claude/skills';
const CANDIDATES_FILE = '/opt/spaceos/spaceos-nexus/knowledge-service/data/skill-candidates.json';

// Trigger patterns for skill creation requests
const SKILL_REQUEST_PATTERNS = [
  /turn this into a skill/i,
  /make a skill from this/i,
  /save this (as a )?skill/i,
  /create a skill for/i,
  /remember how to do this/i,
  /save this (workflow|process|procedure)/i,
  // Hungarian
  /tanítsd meg magad/i,
  /csinálj (ebből )?skill-t/i,
  /jegyezd meg ezt a folyamatot/i,
  /mentsd el skill-ként/i,
];

// Patterns indicating complex work worth capturing
const COMPLEXITY_INDICATORS = [
  /step \d/i,
  /first.*then.*finally/i,
  /multiple files/i,
  /across.*modules/i,
  /integration/i,
  /pipeline/i,
  /workflow/i,
];

// ─── Skill Detection ─────────────────────────────────────────────────────────

/**
 * Check if a message is requesting skill creation
 */
export function isSkillCreationRequest(message: string): boolean {
  return SKILL_REQUEST_PATTERNS.some(p => p.test(message));
}

/**
 * Detect if completed work is worth capturing as a skill
 */
export function detectSkillCandidate(
  conversation: ConversationTurn[],
  options: { minSteps?: number; minConfidence?: number } = {}
): SkillCandidate | null {
  const { minSteps = 5, minConfidence = 0.6 } = options;

  // Analyze conversation for workflow patterns
  const analysis = analyzeConversation(conversation);

  if (analysis.steps.length < minSteps) {
    return null;
  }

  // Calculate confidence based on various factors
  const confidence = calculateConfidence(analysis);

  if (confidence < minConfidence) {
    return null;
  }

  return {
    id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: analysis.suggestedName,
    description: analysis.description,
    triggerPhrases: analysis.triggers,
    steps: analysis.steps,
    tools: analysis.tools,
    pitfalls: analysis.pitfalls,
    prerequisites: analysis.prerequisites,
    examples: analysis.examples,
    source: 'conversation',
    confidence,
    createdAt: new Date().toISOString(),
  };
}

interface ConversationAnalysis {
  suggestedName: string;
  description: string;
  triggers: string[];
  steps: WorkflowStep[];
  tools: string[];
  pitfalls: string[];
  prerequisites: string[];
  examples: SkillExample[];
}

function analyzeConversation(conversation: ConversationTurn[]): ConversationAnalysis {
  const steps: WorkflowStep[] = [];
  const tools = new Set<string>();
  const pitfalls: string[] = [];
  const prerequisites: string[] = [];

  let stepOrder = 1;
  let lastUserMessage = '';

  for (const turn of conversation) {
    if (turn.role === 'user') {
      lastUserMessage = turn.content;
    }

    if (turn.role === 'assistant') {
      // Extract tools used
      if (turn.tools) {
        turn.tools.forEach(t => tools.add(t));
      }

      // Extract step-like patterns
      const stepMatches = turn.content.match(/(?:^|\n)(?:\d+\.|[-*])\s+(.+)/gm);
      if (stepMatches) {
        for (const match of stepMatches) {
          const action = match.replace(/^[\d.)\-*\s]+/, '').trim();
          if (action.length > 10 && action.length < 200) {
            steps.push({
              order: stepOrder++,
              action,
              command: extractCommand(action),
            });
          }
        }
      }

      // Extract error handling / pitfalls
      if (/error|warning|caution|note:|important:/i.test(turn.content)) {
        const pitfallMatch = turn.content.match(/(?:error|warning|caution|note|important)[:\s]+([^.!?\n]+[.!?])/i);
        if (pitfallMatch) {
          pitfalls.push(pitfallMatch[1].trim());
        }
      }
    }
  }

  // Generate suggested name from first user message
  const suggestedName = generateSkillName(lastUserMessage || conversation[0]?.content || 'unnamed-skill');

  // Generate description
  const description = generateDescription(conversation, steps);

  // Generate trigger phrases
  const triggers = generateTriggers(conversation);

  return {
    suggestedName,
    description,
    triggers,
    steps,
    tools: Array.from(tools),
    pitfalls: pitfalls.slice(0, 5),
    prerequisites,
    examples: [{
      trigger: lastUserMessage.slice(0, 100),
      outcome: `Successfully completed ${steps.length}-step workflow`,
    }],
  };
}

function extractCommand(text: string): string | undefined {
  const codeMatch = text.match(/`([^`]+)`/);
  return codeMatch ? codeMatch[1] : undefined;
}

function generateSkillName(text: string): string {
  // Extract key words and create a slug
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);

  return words.join('-') || 'custom-workflow';
}

function generateDescription(conversation: ConversationTurn[], steps: WorkflowStep[]): string {
  const firstUser = conversation.find(t => t.role === 'user')?.content || '';
  const truncated = firstUser.slice(0, 150);

  return `Workflow for: ${truncated}. Contains ${steps.length} steps.`;
}

function generateTriggers(conversation: ConversationTurn[]): string[] {
  const triggers: string[] = [];

  for (const turn of conversation) {
    if (turn.role === 'user' && turn.content.length > 10 && turn.content.length < 100) {
      triggers.push(turn.content);
    }
  }

  return triggers.slice(0, 5);
}

function calculateConfidence(analysis: ConversationAnalysis): number {
  let confidence = 0.5;

  // More steps = higher confidence
  confidence += Math.min(analysis.steps.length * 0.05, 0.25);

  // Tools used = higher confidence
  confidence += Math.min(analysis.tools.length * 0.05, 0.15);

  // Pitfalls documented = higher confidence
  confidence += analysis.pitfalls.length > 0 ? 0.1 : 0;

  return Math.min(confidence, 1.0);
}

// ─── Skill Generation ────────────────────────────────────────────────────────

/**
 * Generate a skill from a candidate
 */
export async function generateSkill(candidate: SkillCandidate): Promise<SkillGenerationResult> {
  const skillDir = path.join(SKILLS_DIR, candidate.name);

  // Check if skill already exists
  if (existsSync(skillDir)) {
    return {
      success: false,
      error: `Skill "${candidate.name}" already exists at ${skillDir}`,
    };
  }

  try {
    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Generate SKILL.md content
    const skillMd = generateSkillMd(candidate);

    // Write SKILL.md
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd);

    // Create optional directories if needed
    if (candidate.steps.some(s => s.command)) {
      await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    }

    // Save to memory for future reference
    await saveMemory({
      type: 'procedural',
      source: 'skill',
      content: `Created skill: ${candidate.name} - ${candidate.description}`,
      keywords: `skill ${candidate.name} ${candidate.tools.join(' ')}`,
      salience: 0.8,
    });

    log('skillFactory', `Generated skill: ${candidate.name} at ${skillDir}`);

    return {
      success: true,
      skillPath: skillDir,
      skillName: candidate.name,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create skill: ${err}`,
    };
  }
}

function generateSkillMd(candidate: SkillCandidate): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`name: ${candidate.name}`);
  lines.push(`description: >`);
  lines.push(`  ${candidate.description}`);
  lines.push(`  Trigger phrases: ${candidate.triggerPhrases.slice(0, 3).map(t => `"${t}"`).join(', ')}`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${candidate.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`);
  lines.push('');

  // Auto-generated notice
  lines.push('> This skill was auto-generated by Skill Factory from a completed workflow.');
  lines.push(`> Source: ${candidate.source} | Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
  lines.push(`> Generated: ${candidate.createdAt}`);
  lines.push('');

  // Prerequisites
  if (candidate.prerequisites.length > 0) {
    lines.push('## Prerequisites');
    lines.push('');
    for (const prereq of candidate.prerequisites) {
      lines.push(`- ${prereq}`);
    }
    lines.push('');
  }

  // Procedure
  lines.push('## Procedure');
  lines.push('');
  for (const step of candidate.steps) {
    lines.push(`${step.order}. ${step.action}`);
    if (step.command) {
      lines.push(`   \`\`\`bash`);
      lines.push(`   ${step.command}`);
      lines.push(`   \`\`\``);
    }
    if (step.decision) {
      lines.push(`   - Decision: ${step.decision}`);
    }
    if (step.notes) {
      lines.push(`   - Note: ${step.notes}`);
    }
  }
  lines.push('');

  // Tools used
  if (candidate.tools.length > 0) {
    lines.push('## Tools Used');
    lines.push('');
    for (const tool of candidate.tools) {
      lines.push(`- \`${tool}\``);
    }
    lines.push('');
  }

  // Pitfalls
  if (candidate.pitfalls.length > 0) {
    lines.push('## Pitfalls');
    lines.push('');
    for (const pitfall of candidate.pitfalls) {
      lines.push(`- ⚠️ ${pitfall}`);
    }
    lines.push('');
  }

  // Examples
  if (candidate.examples.length > 0) {
    lines.push('## Examples');
    lines.push('');
    for (const example of candidate.examples) {
      lines.push(`**Trigger:** "${example.trigger}"`);
      lines.push(`**Outcome:** ${example.outcome}`);
      lines.push('');
    }
  }

  // Verification
  lines.push('## Verification');
  lines.push('');
  lines.push('To verify successful completion:');
  lines.push('1. Check that all steps completed without errors');
  lines.push('2. Verify expected outputs exist');
  lines.push('3. Test the result if applicable');
  lines.push('');

  return lines.join('\n');
}

// ─── Candidate Management ────────────────────────────────────────────────────

/**
 * Save a skill candidate for later review
 */
export async function saveCandidateForReview(candidate: SkillCandidate): Promise<void> {
  let candidates: SkillCandidate[] = [];

  try {
    const content = await fs.readFile(CANDIDATES_FILE, 'utf-8');
    candidates = JSON.parse(content);
  } catch {
    // File doesn't exist yet
  }

  candidates.push(candidate);

  // Keep only last 50 candidates
  if (candidates.length > 50) {
    candidates = candidates.slice(-50);
  }

  await fs.writeFile(CANDIDATES_FILE, JSON.stringify(candidates, null, 2));
  log('skillFactory', `Saved candidate: ${candidate.name} (confidence: ${candidate.confidence.toFixed(2)})`);
}

/**
 * Get pending skill candidates
 */
export async function getPendingCandidates(): Promise<SkillCandidate[]> {
  try {
    const content = await fs.readFile(CANDIDATES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Remove a candidate (after approval or rejection)
 */
export async function removeCandidate(candidateId: string): Promise<void> {
  const candidates = await getPendingCandidates();
  const filtered = candidates.filter(c => c.id !== candidateId);
  await fs.writeFile(CANDIDATES_FILE, JSON.stringify(filtered, null, 2));
}

// ─── Skill Index Management ──────────────────────────────────────────────────

/**
 * List all installed skills
 */
export async function listSkills(): Promise<Array<{ name: string; description: string; path: string }>> {
  const skills: Array<{ name: string; description: string; path: string }> = [];

  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(SKILLS_DIR, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      try {
        const content = await fs.readFile(skillMdPath, 'utf-8');

        // Parse frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const nameMatch = frontmatterMatch[1].match(/name:\s*(.+)/);
          const descMatch = frontmatterMatch[1].match(/description:\s*>?\s*\n?\s*([^\n]+)/);

          skills.push({
            name: nameMatch?.[1]?.trim() || entry.name,
            description: descMatch?.[1]?.trim() || '',
            path: skillPath,
          });
        }
      } catch {
        // Skip skills without valid SKILL.md
      }
    }
  } catch (err) {
    log('skillFactory', `Error listing skills: ${err}`);
  }

  return skills;
}

/**
 * Get skill statistics
 */
export async function getSkillStats(): Promise<{
  totalSkills: number;
  pendingCandidates: number;
  recentlyCreated: number;
}> {
  const skills = await listSkills();
  const candidates = await getPendingCandidates();

  // Count skills created in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCandidates = candidates.filter(c =>
    new Date(c.createdAt) > sevenDaysAgo
  );

  return {
    totalSkills: skills.length,
    pendingCandidates: candidates.length,
    recentlyCreated: recentCandidates.length,
  };
}
