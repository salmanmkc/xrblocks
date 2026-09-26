import {
  CACHE_NAME,
  MODEL_BASE,
  MODEL_BYTES,
  MODEL_FILES,
  ORT_BASE,
} from './modelConfig.js';

const modelURLs = new Set(
  Object.keys(MODEL_FILES).map((file) => MODEL_BASE + file)
);
const runtimeURLs = new Set([
  `${ORT_BASE}ort-wasm-simd-threaded.asyncify.mjs`,
  `${ORT_BASE}ort-wasm-simd-threaded.asyncify.wasm`,
]);

function openCache() {
  if (!globalThis.caches) {
    throw new Error('Browser cache storage is unavailable.');
  }
  return globalThis.caches.open(CACHE_NAME);
}

function matchesSize(response, bytes) {
  return (
    response.ok && Number(response.headers.get('Content-Length')) === bytes
  );
}

/** Inspect headers only; never read multi-GB cached weight bodies. */
export async function inspectCache() {
  const cache = await openCache();
  let presentBytes = 0;
  for (const [file, bytes] of Object.entries(MODEL_FILES)) {
    const response = await cache.match(MODEL_BASE + file);
    if (!response) continue;
    if (matchesSize(response, bytes)) presentBytes += bytes;
    // A cache implementation may tee the body; do not wait for its other reader.
    void response.body?.cancel();
  }
  return {
    complete: presentBytes === MODEL_BYTES,
    missingBytes: MODEL_BYTES - presentBytes,
    presentBytes,
    totalBytes: MODEL_BYTES,
  };
}

/**
 * Request durable storage before a consented download. Unknown quota is not a
 * guarantee that the download will fit; callers must display the warning.
 * @param {number} missingBytes
 * @returns {Promise<{persistent: boolean|null, quotaKnown: boolean, warning?: string}>}
 */
export async function prepareStorage(missingBytes) {
  const storage = globalThis.navigator?.storage;
  let persistent = null;
  const warnings = [];
  try {
    if (storage?.persisted) persistent = await storage.persisted();
    if (persistent !== true && storage?.persist) {
      persistent = await storage.persist();
    }
    if (persistent !== true) {
      warnings.push(
        persistent === false
          ? 'Storage persistence was denied; the browser may evict the model.'
          : 'Storage persistence is unavailable; the browser may evict the model.'
      );
    }
  } catch (error) {
    warnings.push(`Storage persistence failed: ${error.message}`);
  }

  let estimate;
  try {
    estimate = await storage?.estimate?.();
  } catch (error) {
    warnings.push(`Storage quota estimate failed: ${error.message}`);
  }
  const quotaKnown =
    Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage);
  if (quotaKnown) {
    const requiredBytes = missingBytes + 64 * 1024 * 1024;
    const availableBytes = estimate.quota - estimate.usage;
    if (availableBytes < requiredBytes) {
      throw new Error(
        `Insufficient browser storage: ${requiredBytes} bytes required ` +
          `(including 64 MiB runtime headroom), ${availableBytes} bytes available.`
      );
    }
  } else {
    warnings.push(
      'Storage quota is unavailable; available space is not verified.'
    );
  }
  return {
    persistent,
    quotaKnown,
    ...(warnings.length ? {warning: warnings.join(' ')} : {}),
  };
}

/**
 * Install on Transformers env.fetch, not globalThis.fetch. Cache-only loads
 * must be served by the loader's browser cache; model network fallback rejects.
 * @param {boolean} allowDownload
 * @returns {typeof fetch}
 */
export function createGuardedFetch(allowDownload) {
  const networkFetch = globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const isModel = modelURLs.has(url);
    if (!isModel && !runtimeURLs.has(url)) {
      throw new Error(`Unapproved model/runtime URL: ${url}`);
    }
    if (isModel && !allowDownload) {
      throw new Error(
        'Model asset is not cached. An explicit Download is required.'
      );
    }
    return networkFetch(input, init);
  };
}

/**
 * Read only the four assets required by the public image-only processor.
 * Progress uses the runtime's per-file byte event shape, including cache reads.
 * @param {{allowDownload: boolean, onProgress?: (event: {status: string, file: string, loaded: number, total: number, progress: number}) => void}} options
 */
export async function loadProcessorAssets({
  allowDownload,
  onProgress = () => {},
}) {
  const cache = await openCache();
  const guardedFetch = createGuardedFetch(allowDownload);
  const assets = {};
  const files = {
    processorConfig: 'processor_config.json',
    tokenizerJSON: 'tokenizer.json',
    tokenizerConfig: 'tokenizer_config.json',
    chatTemplate: 'chat_template.jinja',
  };
  for (const [key, file] of Object.entries(files)) {
    const url = MODEL_BASE + file;
    const expectedBytes = MODEL_FILES[file];
    let response = await cache.match(url);
    if (response && !matchesSize(response, expectedBytes)) {
      void response.body?.cancel();
      response = undefined;
    }
    const fromCache = Boolean(response);
    if (!response) response = await guardedFetch(url);
    if (!response.ok) {
      void response.body?.cancel();
      throw new Error(`Could not download ${file}: HTTP ${response.status}.`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== expectedBytes) {
      throw new Error(
        `Incorrect byte length for ${file}: expected ${expectedBytes}, got ${bytes.byteLength}.`
      );
    }
    const text = new TextDecoder().decode(bytes);
    assets[key] = key === 'chatTemplate' ? text : JSON.parse(text);
    if (!fromCache) {
      await cache.put(
        url,
        new Response(bytes, {
          headers: {'Content-Length': String(bytes.byteLength)},
        })
      );
    }
    onProgress({
      status: 'progress',
      file,
      loaded: expectedBytes,
      total: expectedBytes,
      progress: 100,
    });
  }
  return assets;
}
