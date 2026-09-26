export const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const REVISION = '9f4bef82ea6e296bc69f8a2f5939f73af81b07a6';
export const MODEL_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`;
export const RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
export const ORT_BASE =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
export const CACHE_NAME = 'xrblocks-gemma-vision-4.3.0';

/** Required files for q4f16 model loading and explicit processor hydration. */
export const MODEL_FILES = Object.freeze({
  'onnx/audio_encoder_q4f16.onnx': 260446,
  'onnx/audio_encoder_q4f16.onnx_data': 171258112,
  'onnx/decoder_model_merged_q4f16.onnx': 673231,
  'onnx/decoder_model_merged_q4f16.onnx_data': 1519700992,
  'onnx/embed_tokens_q4f16.onnx': 5621,
  'onnx/embed_tokens_q4f16.onnx_data': 1590689792,
  'onnx/vision_encoder_q4f16.onnx': 189124,
  'onnx/vision_encoder_q4f16.onnx_data': 99189440,
  'config.json': 5549,
  'generation_config.json': 238,
  'processor_config.json': 1689,
  'chat_template.jinja': 16317,
  'tokenizer_config.json': 18807,
  'tokenizer.json': 19439251,
});

export const MODEL_BYTES = Object.values(MODEL_FILES).reduce(
  (total, bytes) => total + bytes,
  0
);
export const IMAGE_BUDGET = 140;
