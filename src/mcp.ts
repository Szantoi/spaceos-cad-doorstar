/**
 * MCP (Model Context Protocol) HTTP Transport Router
 *
 * Implements the MCP protocol for Claude Code integration.
 * Delegates execution to the global toolRegistry.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { TERMINALS } from './identity';
import { initializeTools, toolRegistry } from './interfaces/mcp/tools';

const router = Router();
const MCP_VERSION = '2024-11-05';

// ─── Agent Authentication ───────────────────────────────────────────────────
interface AgentsConfig {
  version?: string;
  updated?: string;
  master_token?: string;
  agents: Record<string, string>;  // token -> agent_name
  groups?: Record<string, string[]>;
  default_agent?: string | null;
}

const AGENTS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'agents.yaml');

let masterToken: string = process.env.MCP_AUTH_TOKEN || '';
let agentTokens: Record<string, string> = {};  // token -> agent_name
let defaultAgent: string | null = null;
let lastAgentsConfigMtime: number = 0;

function loadAgentTokens(): void {
  const envTokens: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MCP_TOKEN_')) {
      const agentName = key.substring(10).toLowerCase();
      const token = process.env[key] || '';
      if (token) {
        envTokens[token] = agentName;
      }
    }
  }

  const envMasterToken = process.env.MCP_AUTH_TOKEN;
  if (envMasterToken) {
    masterToken = envMasterToken;
  }

  try {
    const stat = fs.statSync(AGENTS_CONFIG_PATH);
    const mtime = stat.mtimeMs;

    if (mtime === lastAgentsConfigMtime && Object.keys(agentTokens).length > 0) {
      return;
    }

    const content = fs.readFileSync(AGENTS_CONFIG_PATH, 'utf-8');
    const config = yaml.load(content) as AgentsConfig;

    if (config) {
      if (!envMasterToken && config.master_token) {
        masterToken = config.master_token;
      }
      const yamlTokens: Record<string, string> = {};
      if (config.agents) {
        for (const [token, agentName] of Object.entries(config.agents)) {
          if (token && agentName) {
            yamlTokens[token] = agentName;
          }
        }
      }
      agentTokens = { ...yamlTokens, ...envTokens };
      defaultAgent = config.default_agent || null;
      lastAgentsConfigMtime = mtime;
      console.log(`[MCP] 🔑 Agent tokens loaded (${Object.keys(agentTokens).length} agents, master: ${masterToken ? 'set' : 'not set'})`);
    }
  } catch (err) {
    if (Object.keys(agentTokens).length === 0) {
      agentTokens = envTokens;
      console.warn(`[MCP] ⚠️ Could not load agents.yaml, using env vars only (${Object.keys(envTokens).length} agents)`);
    }
  }
}

loadAgentTokens();
setInterval(loadAgentTokens, 30_000);

// ─── Tool Permissions ───────────────────────────────────────────────────────
type ToolPermission = 'all' | 'none' | string[];

interface ToolPermissionsConfig {
  version?: string;
  updated?: string;
  default?: ToolPermission;
  permissions: Record<string, ToolPermission>;
}

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'tool-permissions.yaml');
const RELOAD_INTERVAL_MS = 30_000;

let toolPermissions: Record<string, ToolPermission> = {};
let defaultPermission: ToolPermission = 'all';
let lastConfigMtime: number = 0;

function loadToolPermissions(): void {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    const mtime = stat.mtimeMs;

    if (mtime === lastConfigMtime && Object.keys(toolPermissions).length > 0) {
      return;
    }

    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = yaml.load(content) as ToolPermissionsConfig;

    if (config && config.permissions) {
      toolPermissions = config.permissions;
      defaultPermission = config.default || 'all';
      lastConfigMtime = mtime;
      console.log(`[MCP] 🔄 Tool permissions loaded (${Object.keys(toolPermissions).length} rules, default: ${defaultPermission})`);
    }
  } catch (err) {
    if (Object.keys(toolPermissions).length === 0) {
      console.warn(`[MCP] ⚠️ Could not load tool-permissions.yaml, using defaults`);
      toolPermissions = {
        'set_focus_queue': ['root', 'conductor'],
        'add_focus_item': ['root', 'conductor'],
        'set_active_task': ['root', 'conductor'],
        'set_task_status': ['root', 'conductor'],
        'get_focus_queue': 'all',
        'create_project': ['root', 'conductor'],
        'dispatch_next': ['root', 'conductor'],
        'write_memory': ['root', 'conductor', 'librarian'],
        'append_memory': ['root', 'conductor', 'librarian'],
        'save_tiered_memory': ['root', 'conductor', 'librarian'],
        'promote_memory': ['root', 'conductor', 'librarian'],
        'send_message': ['root', 'conductor'],
      };
      defaultPermission = 'all';
    }
  }
}

loadToolPermissions();
setInterval(loadToolPermissions, RELOAD_INTERVAL_MS);

function getAgentFromToken(token: string): string | null {
  if (masterToken && token === masterToken) return 'root';
  return agentTokens[token] || null;
}

function canUseTool(terminal: string, toolName: string): boolean {
  if (terminal === 'root') return true;
  const permission = toolPermissions[toolName];
  if (permission === undefined) {
    if (defaultPermission === 'all') return true;
    if (defaultPermission === 'none') return false;
    if (Array.isArray(defaultPermission)) return defaultPermission.includes(terminal);
    return true;
  }
  if (permission === 'all') return true;
  if (permission === 'none') return false;
  if (Array.isArray(permission)) return permission.includes(terminal);
  return true;
}

function filterToolsForTerminal(tools: any[], terminal: string): any[] {
  return tools.filter(tool => canUseTool(terminal, tool.name));
}

declare global {
  namespace Express {
    interface Request {
      mcpTerminal?: string;
    }
  }
}

function authenticate(req: Request, res: Response, next: () => void) {
  if (!masterToken && Object.keys(agentTokens).length === 0) {
    req.mcpTerminal = 'root';
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (defaultAgent) {
      req.mcpTerminal = defaultAgent;
      return next();
    }
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: Bearer token required' },
      id: null,
    });
    return;
  }
  const token = authHeader.substring(7);
  const agent = getAgentFromToken(token);
  if (!agent) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32002, message: 'Forbidden: Invalid token' },
      id: null,
    });
    return;
  }
  req.mcpTerminal = agent;
  next();
}

// ─── REST Auth (flotta-biztonság, 2026-07-10) ───────────────────────────────
// A REST /api/mailbox route-ok eddig token nélkül voltak hívhatók — ezen a
// résen át tudott a lokál flotta-agent idegen (VPS) példányra dolgozni.
// Ugyanaz a tokenkészlet, mint az MCP-nél, sima JSON hibaformátummal.

export function authenticateRest(req: Request, res: Response, next: () => void) {
  if (!masterToken && Object.keys(agentTokens).length === 0) {
    req.mcpTerminal = 'root';
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Bearer token required' });
    return;
  }
  const agent = getAgentFromToken(authHeader.substring(7));
  if (!agent) {
    res.status(403).json({ error: 'Forbidden: Invalid token' });
    return;
  }
  req.mcpTerminal = agent;
  next();
}

// Mailbox-jogosultság REST-en, az MCP tool-permission szabályokkal összhangban:
// koordinátorok (root/conductor) mindent; monitor minden GET-et; más terminál
// csak a SAJÁT inbox/outbox-át éri el, send_message-t a tool-permission dönti el.
export function authorizeMailboxRest(req: Request, res: Response, next: () => void) {
  const agent = req.mcpTerminal || '';
  if (agent === 'root' || agent === 'conductor') return next();

  const method = req.method.toUpperCase();
  const seg = req.path.split('/').filter(Boolean);

  const deny = (msg: string) => {
    console.warn(`[REST-AUTH] DENY ${agent} ${method} ${req.path} — ${msg}`);
    res.status(403).json({ error: `Forbidden: ${msg}` });
  };

  // Globális végpontok: /outbox/unread, /counter, /tasks/status, /broadcast
  const isGlobal =
    (seg[0] === 'outbox' && seg[1] === 'unread') ||
    seg[0] === 'counter' ||
    (seg[0] === 'tasks' && seg[1] === 'status');
  if (isGlobal) {
    if (method === 'GET' && agent === 'monitor') return next();
    return deny(`'${agent}' cannot access global mailbox endpoint`);
  }
  if (seg[0] === 'broadcast') {
    return deny('broadcast is coordinator-only');
  }

  const target = decodeURIComponent(seg[0] || '');

  // send_message idegen terminálnak: az MCP tool-permission dönt
  if (method === 'POST' && seg[1] === 'inbox') {
    if (target === agent || canUseTool(agent, 'send_message')) return next();
    return deny(`'${agent}' may not send messages via REST`);
  }

  // Minden más művelet: csak a saját mailbox (monitor GET-je kivétel)
  if (target === agent) return next();
  if (method === 'GET' && agent === 'monitor') return next();
  return deny(`'${agent}' may only access its own mailbox`);
}

// ─── Federation Audit Log ───────────────────────────────────────────────────
// Sziget-közi (bridge) forgalom dedikált naplója. Minden olyan MCP-hívás,
// amelynek hívója '-bridge' végű identitás, JSONL-ként ide íródik.
const FEDERATION_LOG_PATH = path.join(__dirname, '..', 'logs', 'federation.jsonl');

function isBridgeAgent(agent: string): boolean {
  return agent.endsWith('-bridge');
}

function logFederation(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  fs.appendFile(FEDERATION_LOG_PATH, line + '\n', (err) => {
    if (err) console.error('[MCP] ⚠️ federation.jsonl write failed:', err.message);
  });
}

// Initialize tools registry
initializeTools();

// ─── MCP JSON-RPC Handler ───────────────────────────────────────────────────
router.post('/', authenticate, async (req: Request, res: Response) => {
  const { jsonrpc, method, params, id } = req.body;

  const fedCaller = req.mcpTerminal || 'root';
  const fedIp = (req.headers['x-real-ip'] as string) ||
                (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                req.socket.remoteAddress || 'unknown';
  const fedActive = isBridgeAgent(fedCaller);

  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      id: id || null,
    });
    return;
  }

  try {
    switch (method) {
      case 'initialize': {
        if (fedActive) logFederation({ agent: fedCaller, ip: fedIp, method: 'initialize', status: 'ok' });
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: MCP_VERSION,
            serverInfo: {
              name: 'spaceos-knowledge-service',
              version: '1.4.0',
            },
            capabilities: {
              tools: {},
            },
          },
          id,
        });
        break;
      }

      case 'tools/list': {
        const callerTerminal = req.mcpTerminal || 'root';
        const visibleTools = filterToolsForTerminal(toolRegistry.getDefinitions(), callerTerminal);
        res.json({
          jsonrpc: '2.0',
          result: {
            tools: visibleTools,
          },
          id,
        });
        break;
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32602, message: 'Invalid params: name is required' },
            id,
          });
          return;
        }

        const callerTerminal = req.mcpTerminal || 'root';
        if (!canUseTool(callerTerminal, name)) {
          console.log(`[MCP] 🚫 ${name} DENIED for terminal: ${callerTerminal}`);
          if (fedActive) logFederation({ agent: fedCaller, ip: fedIp, method: 'tools/call', tool: name, status: 'denied' });
          res.status(403).json({
            jsonrpc: '2.0',
            error: {
              code: -32003,
              message: `Permission denied: terminal '${callerTerminal}' cannot use tool '${name}'`,
            },
            id,
          });
          return;
        }

        const startTime = Date.now();
        const targetTerminal = (args as Record<string, unknown>)?.terminal as string || 'unknown';
        console.log(`[MCP] 📥 ${name} (caller: ${callerTerminal}, target: ${targetTerminal})`);

        try {
          const result = await toolRegistry.call(name, args || {}, { terminal: callerTerminal });
          const duration = Date.now() - startTime;
          console.log(`[MCP] ✅ ${name} (${duration}ms)`);
          if (fedActive) logFederation({ agent: fedCaller, ip: fedIp, method: 'tools/call', tool: name, target: targetTerminal, status: 'ok', ms: duration });
          res.json({
            jsonrpc: '2.0',
            result,
            id,
          });
        } catch (toolErr) {
          const duration = Date.now() - startTime;
          console.error(`[MCP] ❌ ${name} FAILED (${duration}ms):`, toolErr);
          if (fedActive) logFederation({ agent: fedCaller, ip: fedIp, method: 'tools/call', tool: name, target: targetTerminal, status: 'error', ms: duration, error: toolErr instanceof Error ? toolErr.message : String(toolErr) });
          throw toolErr;
        }
        break;
      }

      case 'notifications/initialized': {
        res.status(204).send();
        break;
      }

      default: {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: msg },
      id,
    });
  }
});

// ─── MCP Info Endpoint (GET) ────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  const definitions = toolRegistry.getDefinitions();
  res.json({
    name: 'spaceos-knowledge-service',
    version: '1.3.0',
    protocol: MCP_VERSION,
    description: 'SpaceOS Knowledge Service MCP Server - RAG search, mailbox, identity, memory, skills, workflow, terminal setup, terminal docs',
    tools: definitions.map(t => t.name),
    toolCount: definitions.length,
    terminals: TERMINALS,
    documentation: 'https://your-domain.com',
  });
});

export default router;
