/**
 * Embedding backends, priority order:
 *   1. Voyage AI (if VOYAGE_API_KEY set) — highest quality, external API
 *   2. @xenova/transformers (default)   — local ONNX inference, all-MiniLM-L6-v2
 *
 * The Xenova backend was adopted 2026-07-07 as the federation-wide standard
 * (VPS decision, MSG-CABINET-BRIDGE-007): same model on every island so the
 * embedding spaces stay compatible. No Sharp, no Python, no external API.
 * First use downloads the ONNX model (~30 MB) to the transformers cache.
 */

// ─── Voyage AI (optional upgrade) ────────────────────────────────────────────

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite';
const VOYAGE_BATCH = 50; // Reduced for rate limiting
const VOYAGE_DELAY_MS = 40000; // 40 seconds delay (3 RPM free tier, conservative)

async function voyageEmbed(
  texts: string[],
  inputType: 'document' | 'query'
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  return data.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
}

// ─── Xenova / transformers.js (local ONNX, default) ─────────────────────────

const XENOVA_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384 dims, matches sentence-transformers default

// Lazy singleton: the pipeline loads the ONNX model on first call only.
let xenovaPipeline: any = null;

async function getXenovaPipeline(): Promise<any> {
  if (!xenovaPipeline) {
    // Dynamic import: @xenova/transformers is ESM-only, this file compiles to CJS
    const { pipeline } = await (eval('import("@xenova/transformers")') as Promise<any>);
    console.log(`🔮 [Embeddings] Loading ${XENOVA_MODEL} (first call downloads ~30 MB)...`);
    xenovaPipeline = await pipeline('feature-extraction', XENOVA_MODEL);
    console.log(`🟢 [Embeddings] ${XENOVA_MODEL} ready`);
  }
  return xenovaPipeline;
}

async function xenovaEmbed(texts: string[]): Promise<number[][]> {
  const pipe = await getXenovaPipeline();
  const results: number[][] = [];
  for (const text of texts) {
    // Mean pooling + L2 normalization = sentence-transformers behaviour
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const useVoyage = (): boolean => !!process.env.VOYAGE_API_KEY;

/**
 * Embed documents. Always returns real vectors (Voyage or local Xenova).
 */
export async function embedDocuments(texts: string[]): Promise<number[][] | undefined> {
  if (useVoyage()) {
    const results: number[][] = [];
    const totalBatches = Math.ceil(texts.length / VOYAGE_BATCH);
    for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
      const batchNum = Math.floor(i / VOYAGE_BATCH) + 1;
      const batch = texts.slice(i, i + VOYAGE_BATCH);
      console.log(`⏳ Embedding batch ${batchNum}/${totalBatches} (${batch.length} texts)...`);
      results.push(...(await voyageEmbed(batch, 'document')));

      // Rate limiting: wait before next batch (except for last batch)
      if (i + VOYAGE_BATCH < texts.length) {
        console.log(`   Waiting ${VOYAGE_DELAY_MS / 1000}s (rate limit)...`);
        await new Promise(resolve => setTimeout(resolve, VOYAGE_DELAY_MS));
      }
    }
    return results;
  }
  return xenovaEmbed(texts);
}

/**
 * Embed query. Always returns a real vector (Voyage or local Xenova).
 */
export async function embedQuery(text: string): Promise<number[] | undefined> {
  if (useVoyage()) {
    const [emb] = await voyageEmbed([text], 'query');
    return emb;
  }
  const [emb] = await xenovaEmbed([text]);
  return emb;
}

export function embeddingBackend(): string {
  return useVoyage()
    ? `voyage-ai (${VOYAGE_MODEL})`
    : `xenova-local (${XENOVA_MODEL})`;
}
