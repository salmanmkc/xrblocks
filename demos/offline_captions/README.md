# Offline captions

Speak into the microphone and live captions appear on a floating spatial card. Speech recognition runs on this device with [Moonshine](https://github.com/moonshine-ai/moonshine) in a module worker, so audio never leaves the browser. There is no cloud service and no API key, and captioning keeps working with the network off once the model is loaded.

This is speech-to-text from the microphone, fully in the browser. It differs from the SDK's `xb.SpeechRecognizer`, which wraps the Web Speech API (Chrome sends that audio to Google servers), and from the Read Aloud demo in [#639](https://github.com/google/xrblocks/pull/639), which reads camera text aloud with OCR and text-to-speech running on a tethered laptop.

## Run

Build the SDK with `npm run build:sdk`, start `npm run serve`, and open `http://127.0.0.1:8080/demos/offline_captions/` in Chrome. The microphone needs a secure context (HTTPS or localhost).

Press **Download captions model (~94 MB)** on the 2D panel. Nothing downloads automatically. The page checks storage quota, asks the browser to persist the cache, shows progress, and verifies the size and SHA-256 digest of every file before saving it to the Cache API. Later visits offer **Load cached captions model**, which only reads the cache; if files were evicted, it asks for another explicit Download. On desktop, XR Blocks starts the simulator behind the panel, so press **Continue in simulator**, or enter XR on a headset.

On the card, press **Start listening** and speak. The current utterance shows as an interim line ending in `…`, and it is replaced by the final text after a short pause. **Stop listening** finalizes any speech in progress, and **Clear** empties the transcript. The level bar shows the microphone input, and the metrics line shows the latest first-caption latency, end-of-speech-to-text latency and real-time factor. The card lazily follows your head so the captions stay in view.

## How it works

1. `microphone.js` opens `getUserMedia` with echo cancellation, noise suppression and auto gain, and an `AudioWorklet` (`captureProcessor.js`) posts transferred mono chunks at the device sample rate.
2. `audio.js` resamples to 16 kHz with a stateful box filter, and `vad.js` segments speech with an energy detector: a 300 ms noise calibration, an adaptive threshold, 300 ms of pre-roll, and 600 ms of trailing silence to end an utterance (12 s maximum).
3. `scheduler.js` serializes work on the single worker. Finished utterances queue in order. While someone is still talking, an interim transcription of the growing utterance runs every 700 ms whenever the worker is idle. Noises shorter than 300 ms are dropped.
4. `CaptionsRuntime.js` runs in `captionsWorker.js` and decodes greedily with Moonshine (`do_sample: false`, one beam, about six tokens per second of audio). The client uses request IDs, ignores stale replies, cancels downloads cooperatively, resets the worker on crashes and disposes it on exit.
5. `captions.js` renders finalized lines plus the interim line into one retained `UIText` inside one `UIScrollView`. Text writes are throttled to 10 Hz, and no panels are added per line.

With `?debug=1`, `window.offlineCaptions.feedUrl(url)` plays a 16-bit PCM WAV through the same resampler, segmenter and worker as the microphone, paced in real time. It is a test hook only and is not used by the normal page.

## Model and runtime

| Pin          | Value                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model        | [`onnx-community/moonshine-base-ONNX`](https://huggingface.co/onnx-community/moonshine-base-ONNX/tree/b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad) at revision `b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad`, `q8` weights |
| Runtime      | `@huggingface/transformers@4.3.0`, standalone `dist/transformers.min.js` imported by URL in the worker (workers do not get import maps)                                                                              |
| ONNX Runtime | `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`, `ort-wasm-simd-threaded.asyncify` WASM backend, one thread                                                                                                          |

| Cached asset                                                                 |          Bytes |
| ---------------------------------------------------------------------------- | -------------: |
| `onnx/decoder_model_merged_quantized.onnx`                                   |     42,498,870 |
| ORT `ort-wasm-simd-threaded.asyncify.wasm`                                   |     26,861,777 |
| `onnx/encoder_model_quantized.onnx`                                          |     20,513,063 |
| `tokenizer.json`                                                             |      3,761,754 |
| `tokenizer_config.json`, `config.json`, `generation_config.json`, ORT `.mjs` |        189,861 |
| Total                                                                        | **93,825,325** |

The worker builds the tokenizer from the cached JSON with `PreTrainedTokenizer` and loads `MoonshineForConditionalGeneration` directly. Transformers.js 4.3.0's `pipeline()` and `AutoTokenizer` also request files from the `main` branch even when a revision is given. During loading, `env.fetch` refuses every network request, so a cached load either reads the pinned files or fails.

Moonshine base with WASM was chosen after a smoke test on generated speech. Moonshine tiny was about twice as fast but made visible mistakes ("Caption stay", stray capitals). WebGPU was slower for these short utterances and would share the GPU with rendering.

| Candidate (same three clips)                      | Real-time factor | Accuracy                                     |
| ------------------------------------------------- | ---------------- | -------------------------------------------- |
| **moonshine-base q8, WASM**                       | **0.12-0.17**    | All three exact apart from `7:30` formatting |
| moonshine-tiny q8, WASM                           | 0.06-0.09        | Word and casing errors                       |
| moonshine-base, WebGPU (fp32 encoder, q4 decoder) | 0.19-0.31        | Not faster                                   |

## Measured results

These were measured in a persistent Chrome 154 profile on an Apple M4 Mac mini with 16 GB, served over localhost. The test speech is three sentences generated with macOS `say` (13.6 s, with 1.2 s pauses). It went through the debug feed and also through Chrome's fake microphone (`--use-file-for-fake-audio-capture`), which exercises the real `getUserMedia` and AudioWorklet path.

- The explicit download and load took 6.3 s. A cached load took 3.2 s, including a 2.6 s model load and warmup, with zero model or ONNX Runtime network requests.
- With the network blocked after loading, all three sentences were captioned exactly (apart from punctuation) with zero network requests.
- The first interim caption appeared 0.6-0.8 s after speech started.
- End of speech to final text was 1.2-1.6 s, which includes the 600 ms pause that ends an utterance.
- The real-time factor was 0.13-0.21 (0.43-0.62 s of inference for 2.9-4.2 s utterances).
- In the simulator, frame p95 was 18.4-18.6 ms and the maximum was 18.7-18.8 ms, both idle and while captioning.

## Device note

The first load compiles the WASM runtime and runs a one-second warmup, so it takes a few seconds even from the cache. The page, three.js and the Transformers.js script come from the network or the HTTP cache; only the model and ONNX Runtime files are pinned in the Cache API. Phones and standalone headsets have not been measured, and single-threaded WASM will be slower there than on a desktop CPU.

## Credits

- [Moonshine](https://github.com/moonshine-ai/moonshine) speech recognition models by Useful Sensors, MIT license. The [ONNX conversion](https://huggingface.co/onnx-community/moonshine-base-ONNX) is by onnx-community.
- [Transformers.js](https://github.com/huggingface/transformers.js) is Apache-2.0, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) is MIT.
- The explicit download, Cache API, worker lifecycle and preload panel patterns follow the on-device Gemma demos in [#634](https://github.com/google/xrblocks/pull/634) and [#642](https://github.com/google/xrblocks/pull/642), without importing their files.
- Created for [#629](https://github.com/google/xrblocks/issues/629), the call for on-device machine learning demos.
