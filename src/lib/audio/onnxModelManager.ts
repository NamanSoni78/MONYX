'use client';

import * as ort from 'onnxruntime-web';
import { get, set } from 'idb-keyval';

// ============================================================================
// Monyx Studio — ONNX model manager
//
// SIMPLIFIED: The app uses ONE bundled model — UVR_MDXNET_KARA_2.onnx —
// served from /public. It auto-downloads into IndexedDB on first visit and
// is cached thereafter. There is no model picker, no upload UI, no
// HuggingFace fallback. This keeps the UX simple ("it just works") and
// removes a whole class of failure modes (CORS, wrong-model-format, etc.).
// ============================================================================

// Configure ONNX Runtime Web
ort.env.wasm.wasmPaths = '/ort-wasm/';
ort.env.wasm.simd = true;

// CRITICAL: Multi-threaded WASM requires SharedArrayBuffer, which itself
// requires the page to be served with COOP/COEP headers. If SAB isn't
// available, fall back to single-threaded — otherwise ONNX Runtime Web
// will throw cryptic errors at session creation (and inference silently
// fails, falling back to phase-cancellation, which was the original
// "model output is nearly identical to input" bug).
const canUseMultiThread = typeof SharedArrayBuffer !== 'undefined';
ort.env.wasm.numThreads = canUseMultiThread
  ? Math.min(4, navigator.hardwareConcurrency || 2)
  : 1;

// Run inference in a Web Worker so the UI doesn't freeze. This is safe
// as long as we NEVER reuse the input/output buffers across inference
// calls (the worker transfers ownership, detaching the buffer). See
// vocalSeparator.ts → separateByONNX for the fresh-buffer pattern.
ort.env.wasm.proxy = true;

// The single model kind we support. Kept as a literal type so the rest of
// the codebase (vocalSeparator.ts) can branch on it without needing the
// full ModelKind union that existed before.
export type ModelKind = 'mdxnet';

export interface SeparationModel {
  id: string;
  kind: ModelKind;
  name: string;
  size: number;
  uploadedAt: string;
}

// IndexedDB keys
const MODEL_INDEX_KEY = 'monyx-separation-models';
const MODEL_DATA_KEY = 'monyx-model-bundled-mdxnet-kara-2';

// The bundled model is served from /public/UVR_MDXNET_KARA_2.onnx. Same
// file is used by both the Vocal Remover tab and the Karaoke Studio tab.
const BUNDLED_MODEL_URL = '/UVR_MDXNET_KARA_2.onnx';

function isWebGPUAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !!(navigator as any).gpu;
}

// ============================================================================
// Model list / data access
// ============================================================================

export async function listStoredModels(): Promise<SeparationModel[]> {
  return (await get<SeparationModel[]>(MODEL_INDEX_KEY)) ?? [];
}

async function saveModelIndex(models: SeparationModel[]) {
  await set(MODEL_INDEX_KEY, models);
}

export async function loadModelData(id: string): Promise<ArrayBuffer | null> {
  // For the bundled model, id is just a tag — we always read from the
  // same IndexedDB key.
  if (id !== MODEL_DATA_KEY && id !== 'bundled') return null;
  return (await get<ArrayBuffer>(MODEL_DATA_KEY)) ?? null;
}

// ============================================================================
// ensureDefaultModel — auto-load the bundled model into IndexedDB.
// Returns the model record. Called from VocalRemover and KaraokeStudio
// on first mount.
// ============================================================================

let ensurePromise: Promise<SeparationModel | null> | null = null;

export async function ensureDefaultModel(
  onProgress?: (p: number) => void
): Promise<SeparationModel | null> {
  // De-duplicate concurrent calls (both VocalRemover and KaraokeStudio
  // might call this on mount).
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // Check if already stored
    const existing = await listStoredModels();
    if (existing.length > 0) {
      // Verify the data is actually there
      const data = await loadModelData(MODEL_DATA_KEY);
      if (data && data.byteLength > 0) {
        return existing[0];
      }
      // Data is missing — fall through and re-download.
    }

    // Download the bundled model from /public
    try {
      onProgress?.(0.05);
      const resp = await fetch(BUNDLED_MODEL_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const total = Number(resp.headers.get('content-length') || 26_000_000);
      const reader = resp.body?.getReader();
      if (!reader) {
        const buffer = await resp.arrayBuffer();
        return await storeBundledModel(buffer);
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          onProgress?.(received / total);
        }
      }
      onProgress?.(1);

      // Assemble
      const buffer = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { buffer.set(c, offset); offset += c.length; }
      return await storeBundledModel(buffer.buffer);
    } catch (e) {
      console.warn('[ensureDefaultModel] Failed to download bundled model:', e);
      return null;
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

async function storeBundledModel(buffer: ArrayBuffer): Promise<SeparationModel> {
  await set(MODEL_DATA_KEY, buffer);
  const model: SeparationModel = {
    id: MODEL_DATA_KEY,
    kind: 'mdxnet',
    name: 'UVR MDX-Net KARA 2 (bundled)',
    size: buffer.byteLength,
    uploadedAt: new Date().toISOString(),
  };
  await saveModelIndex([model]);
  return model;
}

// ============================================================================
// Inference session
// ============================================================================

export interface InferenceSession {
  session: ort.InferenceSession;
  kind: ModelKind;
  inputNames: string[];
  outputNames: string[];
}

let activeSession: InferenceSession | null = null;

export async function createInferenceSession(modelData: ArrayBuffer, kind: ModelKind): Promise<InferenceSession> {
  // Release any existing session before creating a new one — otherwise
  // we leak memory across model switches.
  if (activeSession) {
    try { await activeSession.session.release(); } catch (e) { /* ignore */ }
    activeSession = null;
  }

  const executionProviders: string[] = isWebGPUAvailable()
    ? ['webgpu', 'wasm']
    : ['wasm'];

  let lastError: unknown = null;
  for (const eps of [executionProviders, ['wasm']]) {
    try {
      const session = await ort.InferenceSession.create(modelData, {
        executionProviders: eps as any,
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
      });
      activeSession = {
        session,
        kind,
        inputNames: session.inputNames,
        outputNames: session.outputNames,
      };
      console.info(`[ONNX] Session created. Providers: ${eps.join(', ')}. Inputs: ${session.inputNames}, Outputs: ${session.outputNames}`);
      return activeSession;
    } catch (e) {
      lastError = e;
      console.warn(`[ONNX] Session creation failed with [${eps.join(', ')}]:`, e);
    }
  }
  throw new Error(`ONNX session creation failed: ${lastError}`);
}

export function getActiveSession(): InferenceSession | null {
  return activeSession;
}

export async function closeSession(): Promise<void> {
  if (activeSession) {
    try { await activeSession.session.release(); } catch (e) { /* ignore */ }
    activeSession = null;
  }
}

export async function runInference(
  inputs: Record<string, ort.TypedTensor>
): Promise<ort.OnnxValue[]> {
  if (!activeSession) throw new Error('No active inference session');
  const results = await activeSession.session.run(inputs);
  return activeSession.outputNames.map((name) => results[name]);
}

// ============================================================================
// Capability detection
// ============================================================================

export function isONNXSupported(): boolean {
  return typeof WebAssembly !== 'undefined';
}

export function isWebGPUEnabled(): boolean {
  return isWebGPUAvailable();
}
