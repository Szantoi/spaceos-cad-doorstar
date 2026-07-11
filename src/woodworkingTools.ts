import { promises as fs } from 'fs';
import * as path from 'path';

// Helper to load current environment variable file
async function updateEnvFile(key: string, value: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf-8');
  } catch (err) {
    // env file doesn't exist, start empty
  }

  const lines = content.split(/\r?\n/);
  let keyIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`)) {
      keyIndex = i;
      break;
    }
  }

  const newLine = `${key}=${value}`;
  if (keyIndex > -1) {
    lines[keyIndex] = newLine;
  } else {
    lines.push(newLine);
  }

  await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
}

// ─── Tool 1: select_active_project ───────────────────────────────────────────

export interface SelectActiveProjectArgs {
  project_path: string;
}

export async function handleSelectActiveProject(args: SelectActiveProjectArgs) {
  const rawPath = args.project_path;
  const normalizedPath = rawPath.replace(/\\/g, '/');

  try {
    const stats = await fs.stat(normalizedPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${normalizedPath}`,
      };
    }

    // Save in active process environment
    process.env.SPACEOS_ROOT = normalizedPath;
    process.env.TERMINALS_PATH = `${normalizedPath}/terminals`;
    process.env.ACTIVE_PROJECT_PATH = normalizedPath;

    // Persist to .env
    await updateEnvFile('SPACEOS_ROOT', normalizedPath);
    await updateEnvFile('TERMINALS_PATH', `${normalizedPath}/terminals`);

    return {
      success: true,
      project_path: normalizedPath,
      message: `Active project successfully updated to: ${normalizedPath}. Environment variables SPACEOS_ROOT and TERMINALS_PATH updated in .env.`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Directory does not exist or is inaccessible: ${normalizedPath}. Error: ${error.message}`,
    };
  }
}

// ─── Tool 2: initialize_project_terminals ────────────────────────────────────

export async function handleInitializeProjectTerminals() {
  const projectPath = process.env.SPACEOS_ROOT;
  if (!projectPath || projectPath === '/opt/spaceos') {
    return {
      success: false,
      error: 'Active project path not set or points to default /opt/spaceos. Please run select_active_project first.',
    };
  }

  const terminalsPath = path.join(projectPath, 'terminals');

  const terminals = [
    { name: 'root', description: 'Strategic decisions, woodworking workspace coordinator' },
    { name: 'conductor', description: 'Task dispatch, pipeline coordination, progress tracker' },
    { name: 'backend', description: 'C# AutoCAD script developer, API integrator' },
    { name: 'frontend', description: 'React/TypeScript project tracking portal developer' },
    { name: 'designer', description: 'Figma and DWG/DXF drawings analyst' },
    { name: 'architect', description: 'Cabinet joints, hardware, and structural architecture planner' },
    { name: 'librarian', description: 'Textbook knowledge retriever and documentation curator' },
    { name: 'explorer', description: 'Codebase researcher and file validator' },
    { name: 'monitor', description: 'Health monitoring and task escalation checker' },
  ];

  const initialized: string[] = [];

  // Load agents.yaml to retrieve individual tokens for MCP configuration
  let masterToken = '';
  const agentTokensMap: Record<string, string> = {};

  try {
    const yaml = await import('js-yaml');
    const configPath = path.join(process.cwd(), 'config', 'agents.yaml');
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content) as any;
    if (config) {
      masterToken = config.master_token || '';
      if (config.agents) {
        for (const [token, agentName] of Object.entries(config.agents)) {
          agentTokensMap[agentName as string] = token;
        }
      }
    }
  } catch (err) {
    console.warn('[InitializeTerminals] Could not load agents.yaml tokens:', err);
  }

  try {
    await fs.mkdir(terminalsPath, { recursive: true });

    for (const term of terminals) {
      const termDir = path.join(terminalsPath, term.name);
      await fs.mkdir(path.join(termDir, 'inbox'), { recursive: true });
      await fs.mkdir(path.join(termDir, 'outbox'), { recursive: true });
      await fs.mkdir(path.join(termDir, 'archive'), { recursive: true });

      // Generate customized CLAUDE.md
      const claudeMd = `# CLAUDE.md — ${term.name.toUpperCase()} Terminal
      
> Role: ${term.description}
> Part of the SpaceOS Woodworking Production Prep Fleet.

## Core Rules & Responsibilities

1. **Workspace Context**: Active project is located at: \`${projectPath}\`
2. **Mailbox Flow**: Check for incoming tasks in \`inbox/\` and output finished status to \`outbox/\`.
3. **Woodworking Standards**:
   - Adhere to Hungarian woodworking standards and textbook guidelines.
   - For all cutting list preparations, apply appropriate sizing allowances.
   - Ensure cost calculations follow the 11-step schema (pages 40-41 of the textbook).

## Project Checklist Requirements
- **Műszaki leírás** (Technical description)
- **Anyagszükséglet** (Bill of Materials)
- **Szabásterv** (Cutting list / plan)
- **Összetett Árkalkuláció** (Cost calculation table)
`;

      await fs.writeFile(path.join(termDir, 'CLAUDE.md'), claudeMd, 'utf-8');

      // Create .agents directory and write mcp_config.json for Antigravity CLI (agy)
      const token = term.name === 'root' ? masterToken : (agentTokensMap[term.name] || masterToken);
      if (token) {
        const agentsDir = path.join(termDir, '.agents');
        await fs.mkdir(agentsDir, { recursive: true });
        
        const mcpConfig = {
          mcpServers: {
            "spaceos-knowledge": {
              serverUrl: "http://localhost:3456/mcp/",
              headers: {
                "Authorization": `Bearer ${token}`
              }
            }
          }
        };
        await fs.writeFile(
          path.join(agentsDir, 'mcp_config.json'),
          JSON.stringify(mcpConfig, null, 2),
          'utf-8'
        );
      }

      initialized.push(term.name);
    }

    return {
      success: true,
      terminals_root: terminalsPath,
      initialized_terminals: initialized,
      message: `Initialized fleet directories, CLAUDE.md files, and .agents/mcp_config.json files under ${terminalsPath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to initialize terminals folder structure: ${error.message}`,
    };
  }
}

// ─── Tool 3: generate_project_tmux_script ────────────────────────────────────

export async function handleGenerateProjectTmuxScript() {
  const projectPath = process.env.SPACEOS_ROOT;
  if (!projectPath || projectPath === '/opt/spaceos') {
    return {
      success: false,
      error: 'Active project path not set or points to default /opt/spaceos. Please run select_active_project first.',
    };
  }

  const projectSlug = path.basename(projectPath).toLowerCase().replace(/[^\w-]/g, '_');
  const serviceDir = process.cwd().replace(/\\/g, '/');

  const tmuxScript = `#!/bin/bash

# Generated Tmux Launch Script for ${projectSlug}
SESSION="${projectSlug}"
ENGINE="claude"

# Check if first argument is 'agy'
if [ "$1" == "agy" ]; then
  ENGINE="agy"
fi

echo "=== SpaceOS Project Terminals starting in tmux ==="
echo "Project Path: ${projectPath}"
echo "Knowledge Service: ${serviceDir}"
echo "CLI Engine: \$ENGINE"

# Kill existing session if running
tmux kill-session -t "\$SESSION" 2>/dev/null

# Create a new session in the background with the first window (root)
tmux new-session -d -s "\$SESSION" -n "root" -c "${projectPath}/terminals/root"
tmux send-keys -t "\$SESSION:root" "echo '=== SpaceOS ROOT Terminal ===' && \$ENGINE" C-m

# 2nd window: Conductor Task Loop / Service
tmux new-window -t "\$SESSION" -n "conductor" -c "${projectPath}/terminals/conductor"
tmux send-keys -t "\$SESSION:conductor" "echo '=== SpaceOS Conductor / Knowledge Service ===' && node \\"${serviceDir}/dist/server.js\\"" C-m

# 3rd window: Backend Developer
tmux new-window -t "\$SESSION" -n "backend" -c "${projectPath}/terminals/backend"
tmux send-keys -t "\$SESSION:backend" "echo '=== SpaceOS Backend Terminal ===' && \$ENGINE" C-m

# 4th window: Frontend Developer
tmux new-window -t "\$SESSION" -n "frontend" -c "${projectPath}/terminals/frontend"
tmux send-keys -t "\$SESSION:frontend" "echo '=== SpaceOS Frontend Terminal ===' && \$ENGINE" C-m

# 5th window: Designer
tmux new-window -t "\$SESSION" -n "designer" -c "${projectPath}/terminals/designer"
tmux send-keys -t "\$SESSION:designer" "echo '=== SpaceOS Designer Terminal ===' && \$ENGINE" C-m

# 6th window: Architect
tmux new-window -t "\$SESSION" -n "architect" -c "${projectPath}/terminals/architect"
tmux send-keys -t "\$SESSION:architect" "echo '=== SpaceOS Architect Terminal ===' && \$ENGINE" C-m

# 7th window: Librarian
tmux new-window -t "\$SESSION" -n "librarian" -c "${projectPath}/terminals/librarian"
tmux send-keys -t "\$SESSION:librarian" "echo '=== SpaceOS Librarian Terminal ===' && \$ENGINE" C-m

# 8th window: Explorer
tmux new-window -t "$SESSION" -n "explorer" -c "${projectPath}/terminals/explorer"
tmux send-keys -t "\$SESSION:explorer" "echo '=== SpaceOS Explorer Terminal ===' && \$ENGINE" C-m

# 9th window: Monitor
tmux new-window -t "\$SESSION" -n "monitor" -c "${projectPath}/terminals/monitor"
tmux send-keys -t "\$SESSION:monitor" "echo '=== SpaceOS Monitor Terminal ===' && \$ENGINE" C-m

# Select the first window
tmux select-window -t "\$SESSION:root"

echo "Session started. Attach with: tmux attach -t \$SESSION"
`;

  const scriptPath = path.join(projectPath, 'start-project-tmux.sh');
  try {
    await fs.writeFile(scriptPath, tmuxScript, { encoding: 'utf-8', mode: 0o755 });
    return {
      success: true,
      script_path: scriptPath,
      message: `Generated tmux startup script successfully at: ${scriptPath}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to write tmux script: ${error.message}`,
    };
  }
}

// ─── Tool 4: calculate_woodworking_cost ──────────────────────────────────────

export interface CalculateWoodworkingCostArgs {
  material_cost: number;
  labor_hours: number;
  hourly_rate?: number;
  other_costs?: number;
  overhead_percent?: number;
  profit_percent?: number;
  vat_percent?: number;
}

export async function handleCalculateWoodworkingCost(args: CalculateWoodworkingCostArgs) {
  const materialCost = Number(args.material_cost);
  const laborHours = Number(args.labor_hours);
  const hourlyRate = Number(args.hourly_rate ?? 5000);
  const otherCosts = Number(args.other_costs ?? 0);
  const overheadPercent = Number(args.overhead_percent ?? 20);
  const profitPercent = Number(args.profit_percent ?? 15);
  const vatPercent = Number(args.vat_percent ?? 27);

  // Calculations based on pages 40-41
  const laborCost = laborHours * hourlyRate;
  const laborTaxes = Math.round(laborCost * 0.13); // 13% szocho (2023)
  const directCosts = materialCost + laborCost + laborTaxes + otherCosts;
  
  const overheadCosts = Math.round(directCosts * (overheadPercent / 100));
  const selfCost = directCosts + overheadCosts;

  const profitAmount = Math.round(selfCost * (profitPercent / 100));
  const calculatedPrice = selfCost + profitAmount;

  // Termék nettó értékesítési ára (rounded to nearest 100 HUF for professional neatness)
  const netSellingPrice = Math.round(calculatedPrice / 100) * 100;
  const vatAmount = Math.round(netSellingPrice * (vatPercent / 100));
  const grossSellingPrice = netSellingPrice + vatAmount;

  // Format as Markdown table
  const markdownReport = `### Összetett Árkalkuláció (Book Page 40-41)

| Kalkulációs lépés | Számítás / Képlet | Érték (nettó) |
|---|---|---|
| **Alap + segédanyagok összesen (1)** | Megadott input | **${materialCost.toLocaleString('hu-HU')} Ft** |
| **Bérköltség (2)** | ${laborHours} óra × ${hourlyRate.toLocaleString('hu-HU')} Ft/óra | **${laborCost.toLocaleString('hu-HU')} Ft** |
| **Bérköltség járulékai (3)** | Bérköltség × 13% szocho | **${laborTaxes.toLocaleString('hu-HU')} Ft** |
| **Egyéb közvetlen költségek (4)** | Outsourcing / fém / üveg | **${otherCosts.toLocaleString('hu-HU')} Ft** |
| **Közvetlen költségek összesen (5)** | (1) + (2) + (3) + (4) | **${directCosts.toLocaleString('hu-HU')} Ft** |
| **Általános (üzemi) költségek (6)** | Közvetlen költségek × ${overheadPercent}% | **${overheadCosts.toLocaleString('hu-HU')} Ft** |
| **Önköltség (7)** | Közvetlen + Általános | **${selfCost.toLocaleString('hu-HU')} Ft** |
| **Nyereség (8)** | Önköltség × ${profitPercent}% | **${profitAmount.toLocaleString('hu-HU')} Ft** |
| **Termék kalkulált ára (9)** | Önköltség + Nyereség | **${calculatedPrice.toLocaleString('hu-HU')} Ft** |
| **Termék nettó értékesítési ára (10)** | Kerekített nettó eladási ár | **${netSellingPrice.toLocaleString('hu-HU')} Ft** |
| **ÁFA összege (27%) (11a)** | Nettó eladási ár × ${vatPercent}% | **${vatAmount.toLocaleString('hu-HU')} Ft** |
| **Termék bruttó értékesítési ára (11b)** | Nettó ár + ÁFA | **${grossSellingPrice.toLocaleString('hu-HU')} Ft** |
`;

  return {
    success: true,
    data: {
      material_cost: materialCost,
      labor_cost: laborCost,
      labor_taxes: laborTaxes,
      other_costs: otherCosts,
      direct_costs: directCosts,
      overhead_costs: overheadCosts,
      self_cost: selfCost,
      profit_amount: profitAmount,
      calculated_price: calculatedPrice,
      net_selling_price: netSellingPrice,
      vat_amount: vatAmount,
      gross_selling_price: grossSellingPrice,
    },
    markdown: markdownReport,
  };
}

// ─── Tool 5: calculate_material_allowance ────────────────────────────────────

export interface ElementInput {
  name: string;
  length: number;    // mm (net)
  width: number;     // mm (net)
  thickness: number; // mm (net)
  quantity: number;
  type: 'solid_wood' | 'panel_product';
}

export interface CalculateMaterialAllowanceArgs {
  elements: ElementInput[];
}

export async function handleCalculateMaterialAllowance(args: CalculateMaterialAllowanceArgs) {
  const elements = args.elements;
  if (!elements || !Array.isArray(elements) || elements.length === 0) {
    return {
      success: false,
      error: 'Elements array is empty or invalid.',
    };
  }

  let totalSolidWoodVolumeM3 = 0;
  let totalPanelAreaM2 = 0;

  const results = elements.map(el => {
    const netL = Number(el.length);
    const netW = Number(el.width);
    const netT = Number(el.thickness);
    const qty = Number(el.quantity);

    let grossL = netL;
    let grossW = netW;
    let grossT = netT;

    let allowanceDesc = '';

    if (el.type === 'solid_wood') {
      // Wood allowances: +15mm length, +5mm width, +3mm thickness
      grossL = netL + 15;
      grossW = netW + 5;
      grossT = netT + 3;
      allowanceDesc = '+15mm L, +5mm W, +3mm T';

      const itemVol = (grossL / 1000) * (grossW / 1000) * (grossT / 1000) * qty;
      totalSolidWoodVolumeM3 += itemVol;
    } else {
      // Panel allowances: +20mm length, +20mm width, thickness unchanged
      grossL = netL + 20;
      grossW = netW + 20;
      allowanceDesc = '+20mm L, +20mm W';

      const itemArea = (grossL / 1000) * (grossW / 1000) * qty;
      totalPanelAreaM2 += itemArea;
    }

    return {
      name: el.name,
      type: el.type,
      quantity: qty,
      net: { length: netL, width: netW, thickness: netT },
      gross: { length: grossL, width: grossW, thickness: grossT },
      allowances: allowanceDesc,
      net_volume_m3: el.type === 'solid_wood' ? (netL / 1000) * (netW / 1000) * (netT / 1000) * qty : undefined,
      net_area_m2: el.type === 'panel_product' ? (netL / 1000) * (netW / 1000) * qty : undefined,
      gross_volume_m3: el.type === 'solid_wood' ? (grossL / 1000) * (grossW / 1000) * (grossT / 1000) * qty : undefined,
      gross_area_m2: el.type === 'panel_product' ? (grossL / 1000) * (grossW / 1000) * qty : undefined,
    };
  });

  // Generate markdown tables
  let markdown = '### Szabásjegyzék és Ráhagyás Számítás\n\n';
  markdown += '| Megnevezés | Típus | db | Nettó méret (mm) | Ráhegyások | Szabásméret (Bruttó mm) | Számított Anyag (Bruttó) |\n';
  markdown += '|---|---|---|---|---|---|---|\n';

  results.forEach(r => {
    const netStr = `${r.net.length} × ${r.net.width} × ${r.net.thickness}`;
    const grossStr = `${r.gross.length} × ${r.gross.width} × ${r.gross.thickness}`;
    const matStr = r.type === 'solid_wood'
      ? `${(r.gross_volume_m3 || 0).toFixed(5)} m³`
      : `${(r.gross_area_m2 || 0).toFixed(3)} m²`;

    markdown += `| ${r.name} | ${r.type === 'solid_wood' ? 'Fenyő/Lombos' : 'Laptermék'} | ${r.quantity} | ${netStr} | ${r.allowances} | ${grossStr} | ${matStr} |\n`;
  });

  markdown += `\n**Összesített anyagszükséglet (ráhagyásokkal):**\n`;
  if (totalSolidWoodVolumeM3 > 0) {
    markdown += `- **Tömörfa összesen:** ${totalSolidWoodVolumeM3.toFixed(5)} m³\n`;
  }
  if (totalPanelAreaM2 > 0) {
    markdown += `- **Laptermékek összesen:** ${totalPanelAreaM2.toFixed(3)} m²\n`;
  }

  return {
    success: true,
    results,
    totals: {
      solid_wood_volume_m3: totalSolidWoodVolumeM3,
      panel_area_m2: totalPanelAreaM2,
    },
    markdown,
  };
}

// ─── Tool 6: check_technical_checklist ───────────────────────────────────────

export interface CheckTechnicalChecklistArgs {
  project_dir: string;
}

export async function handleCheckTechnicalChecklist(args: CheckTechnicalChecklistArgs) {
  const rawPath = args.project_dir;
  const normalizedPath = rawPath.replace(/\\/g, '/');

  try {
    const files = await fs.readdir(normalizedPath);
    
    // Checklist categories
    const categories = {
      technical_description: {
        name: 'Műszaki leírás',
        found: false,
        files: [] as string[],
        patterns: [/muszaki/i, /leiras/i, /leírás/i, /műszaki/i],
      },
      material_list: {
        name: 'Anyagszükséglet / B.O.M.',
        found: false,
        files: [] as string[],
        patterns: [/anyag/i, /szukseglet/i, /szükséglet/i, /bom/i, /jegyzék/i, /jegyzek/i],
      },
      cutting_plan: {
        name: 'Szabásterv / Vágásterv',
        found: false,
        files: [] as string[],
        patterns: [/szabas/i, /szabás/i, /vagasterv/i, /vágásterv/i, /cutting/i],
      },
      cost_calculation: {
        name: 'Árkalkuláció / Önköltségszámítás',
        found: false,
        files: [] as string[],
        patterns: [/arkalk/i, /árkalk/i, /kalkulacio/i, /kalkuláció/i, /ar/i, /ár/i, /koltseg/i, /költség/i],
      },
    };

    for (const file of files) {
      const fileLower = file.toLowerCase();
      // Match against patterns
      for (const [key, cat] of Object.entries(categories)) {
        for (const pattern of cat.patterns) {
          if (pattern.test(fileLower)) {
            cat.files.push(file);
            cat.found = true;
            break;
          }
        }
      }
    }

    let markdown = `### Műszaki Dokumentáció Ellenőrzés: \`${normalizedPath}\`\n\n`;
    let allReady = true;

    for (const [key, cat] of Object.entries(categories)) {
      if (cat.found) {
        markdown += `- **[x] ${cat.name}**: ✅ Megtalálva (\`${cat.files.join(', ')}\`)\n`;
      } else {
        markdown += `- **[ ] ${cat.name}**: ❌ HIÁNYZIK\n`;
        allReady = false;
      }
    }

    markdown += `\n**Státusz:** ${allReady ? '🎉 Minden kötelező gyártáselőkészítő dokumentum rendelkezésre áll!' : '⚠️ Figyelem! Néhány kötelező dokumentáció hiányzik a gyártás megkezdése előtt.'}\n`;

    return {
      success: true,
      directory: normalizedPath,
      checklist: {
        technical_description: { found: categories.technical_description.found, files: categories.technical_description.files },
        material_list: { found: categories.material_list.found, files: categories.material_list.files },
        cutting_plan: { found: categories.cutting_plan.found, files: categories.cutting_plan.files },
        cost_calculation: { found: categories.cost_calculation.found, files: categories.cost_calculation.files },
      },
      all_ready: allReady,
      markdown,
    };

  } catch (error: any) {
    return {
      success: false,
      error: `Failed to check folder: ${normalizedPath}. Error: ${error.message}`,
    };
  }
}
