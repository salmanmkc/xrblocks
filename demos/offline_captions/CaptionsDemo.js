import * as THREE from 'three';
import * as xb from 'xrblocks';

import {CaptionsClient} from './CaptionsClient.js';
import {Resampler, TARGET_SAMPLE_RATE} from './audio.js';
import {CaptionLog, Throttle, UPDATE_MS, formatMetrics} from './captions.js';
import {Microphone} from './microphone.js';
import {
  CACHED_LABEL,
  DOWNLOAD_LABEL,
  LOADED_LABEL,
  TOTAL_BYTES,
} from './modelConfig.js';
import * as modelStore from './modelStore.js';
import {CaptionScheduler} from './scheduler.js';
import {SpeechSegmenter} from './vad.js';

export const PARTIAL_MS = 700;
/** Interim text waits for this much voiced audio, so short noises cost nothing. */
export const MIN_PARTIAL_SPEECH_MS = 400;
const NOTE_STYLE = {fontSize: 18, color: '#cbd5e1'};
const LEVEL_STEP = 3;
const RELOAD = 'Load the model again to keep captioning.';

/** Maps an RMS level to a 0-100 meter value over a 60 dB range. */
export function levelPercent(level) {
  if (!(level > 0)) return 0;
  const db = 20 * Math.log10(level);
  return Math.round(Math.min(100, Math.max(0, ((db + 60) / 60) * 100)));
}

/** One caption card, microphone pipeline and worker shared with the preload panel. */
export class CaptionsDemo extends xb.Script {
  constructor({
    client = new CaptionsClient(),
    microphone = new Microphone(),
    store = modelStore,
    now = () => performance.now(),
    follow = true,
  } = {}) {
    super();
    this.name = 'Offline captions demo';
    this.client = client;
    this.microphone = microphone;
    this.store = store;
    this.now = now;
    this.cached = false;
    this.supported = false;
    this.busy = false;
    this.disposed = false;
    this.listening = null;
    this.previousLoaded = client.loaded;
    this.log = new CaptionLog();
    this.utterances = new Map();
    this.shownFinals = [];
    this.history = [];
    this.lastSegmentId = 0;
    this.lastPartialAt = -Infinity;
    this.lastLevelAt = -Infinity;
    this.lastStateAt = -Infinity;
    this.lastProgressAt = -Infinity;
    this.levelValue = 0;
    this.metricsValues = {};
    this.textWriter = new Throttle(() => this.writeCaptions(), {
      intervalMs: UPDATE_MS,
      now: () => this.now(),
    });
    this.scheduler = this.createScheduler();
    this.createPanel(follow);
    this.refreshControls();
  }

  createScheduler() {
    return new CaptionScheduler({
      transcribe: (audio) => this.client.transcribe(audio),
      onPartial: (id, result) => {
        if (this.log.setInterim(id, result.text)) this.textWriter.schedule();
      },
      onFinal: (id, result, meta) => {
        this.utterances.delete(id);
        if (this.log.finalize(id, result.text)) {
          this.shownFinals.push({id, text: result.text.trim(), result, meta});
          this.textWriter.schedule();
        }
      },
      onError: (error) => {
        if (this.disposed) return;
        this.showError(error);
        if (!this.client.loaded) this.showUnloaded();
      },
    });
  }

  createPanel(follow) {
    const button = (label, onClick) =>
      new xb.UIButton({label, onClick, style: {flexGrow: 1, fontSize: 22}});
    this.status = new xb.UIText({
      text: 'Checking this browser.',
      style: NOTE_STYLE,
    });
    this.metrics = new xb.UIText({text: formatMetrics(), style: NOTE_STYLE});
    this.captionText = new xb.UIText({
      text: this.log.render(),
      style: {
        width: '100%',
        fontSize: 24,
        whiteSpace: 'pre-line',
        lineHeight: 1.35,
        color: '#f8fafc',
      },
    });
    this.captionView = new xb.UIScrollView({
      ariaLabel: 'Live captions',
      style: {height: 260, padding: 14, backgroundColor: '#0b1220'},
      children: [this.captionText],
    });
    this.levelFill = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '0%',
        height: 10,
        borderRadius: 5,
        backgroundColor: '#5eead4',
      },
    });
    this.levelBar = new xb.UIPanel({
      ariaLabel: 'Microphone level',
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: 10,
        borderRadius: 5,
        backgroundColor: '#1e293b',
      },
      children: [this.levelFill],
    });
    this.loadButton = button(DOWNLOAD_LABEL, () => this.onLoadButton());
    this.listenButton = button('Start listening', () => this.toggleListening());
    this.clearButton = button('Clear', () => this.clearCaptions());
    this.buttons = [this.loadButton, this.listenButton, this.clearButton];
    this.card = new xb.UICard({
      size: {width: 1.2, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      style: {gap: 10, padding: 18, backgroundColor: '#101827ee'},
      children: [
        new xb.UIText({
          text: 'OFFLINE CAPTIONS',
          style: {fontSize: 28, fontWeight: 'bold', color: '#f8fafc'},
        }),
        new xb.UIText({
          text: `Live captions from your microphone, recognized on this device. ~${Math.round(TOTAL_BYTES / 1e6)} MB one-time download for Chrome.`,
          style: NOTE_STYLE,
        }),
        this.loadButton,
        this.status,
        this.captionView,
        this.levelBar,
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
          children: [this.listenButton, this.clearButton],
        }),
        this.metrics,
        new xb.UIText({
          text: 'Audio stays on this device. No cloud, no API key.',
          style: NOTE_STYLE,
        }),
      ],
    });
    this.card.name = 'Offline captions card';
    if (follow) {
      // Lazy follow keeps captions in view; dragging the card sets a new offset.
      this.card.add(
        new xb.FollowHead({
          offset: new THREE.Vector3(0, -0.1, -1),
          smoothing: 0.04,
        }),
        new xb.FaceCamera({mode: 'spherical', smoothing: 0.08})
      );
    }
    this.add(this.card);
  }

  init() {
    if (this.disposed) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.card.position.set(0, xb.user.height - 0.1, -1);
    this.initializing = this.checkAvailability();
    return this.initializing;
  }

  async checkAvailability() {
    const operation = this.begin('checking');
    try {
      await this.client.check();
      if (!this.isCurrent(operation)) return;
      this.supported = true;
      const cached = await this.store.inspectCache();
      if (!this.isCurrent(operation)) return;
      this.cached = cached.complete === true;
      this.status.text = this.cached
        ? 'Model cached. Choose Load to start captioning.'
        : 'Download the model once, then caption speech on this device.';
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.showError(error, this.supported ? 'Error' : 'Unsupported');
      }
    } finally {
      this.finish(operation);
    }
  }

  onLoadButton() {
    if (this.operation?.type === 'loading') return this.cancelLoad();
    // A cache-only click never becomes download consent after eviction.
    return this.loadModel({allowDownload: !this.cached});
  }

  async loadModel({allowDownload = false} = {}) {
    if (!this.canStart() || !this.supported || this.client.loaded) return;
    const operation = this.begin('loading');
    this.pendingProgress = undefined;
    try {
      const cached = await this.store.inspectCache();
      if (!this.isCurrent(operation)) return;
      this.cached = cached.complete === true;
      if (!this.cached) {
        if (!allowDownload) {
          throw new Error('The cached model is incomplete. Choose Download.');
        }
        await this.store.prepareStorage(cached.missingBytes);
        if (!this.isCurrent(operation)) return;
        this.status.text = 'Downloading the captions model.';
        this.lastProgressAt = this.now();
        await this.client.download({
          onProgress: (event) => {
            if (!this.isCurrent(operation)) return;
            const percent = Math.floor((event.loaded / event.total) * 100);
            this.pendingProgress = `Downloading: ${percent}% of ${Math.round(event.total / 1e6)} MB`;
          },
        });
        if (!this.isCurrent(operation)) return;
        this.pendingProgress = undefined;
        this.cached = true;
      }
      this.status.text = 'Loading the captions model.';
      const result = await this.client.load();
      if (!this.isCurrent(operation)) return;
      this.loadMs = result.loadMs;
      this.status.text = `Ready in ${(result.loadMs / 1000).toFixed(1)} s. Choose Start listening.`;
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
    } finally {
      if (!this.disposed && operation.canceled) {
        this.status.text =
          'Loading canceled. Choose the button above to retry.';
      }
      this.pendingProgress = undefined;
      this.finish(operation);
    }
  }

  async cancelLoad() {
    if (this.operation?.type !== 'loading' || this.stopping) return;
    this.stopping = true;
    this.operation.canceled = true;
    this.status.text = 'Canceling.';
    this.refreshControls();
    try {
      await this.client.stop();
    } catch (error) {
      if (!this.disposed) this.showError(error);
    } finally {
      this.stopping = false;
      this.refreshControls();
    }
  }

  toggleListening() {
    return this.listening ? this.stopListening() : this.startListening();
  }

  /**
   * Start a caption session. The source is the microphone, or in debug mode an
   * already decoded file fed through the same resampler and segmenter.
   * @param {{source?: 'microphone' | 'file'}} [options]
   */
  async startListening({source = 'microphone'} = {}) {
    if (!this.canStart() || !this.client.loaded || this.listening) return false;
    const session = {
      source,
      rate: null,
      resampler: null,
      segmenter: new SpeechSegmenter(),
      // Segment IDs keep increasing across sessions so old results stay stale.
      idBase: this.lastSegmentId,
    };
    this.listening = session;
    this.lastPartialAt = this.now();
    this.status.text =
      source === 'microphone'
        ? 'Starting the microphone.'
        : 'Captioning a file.';
    this.refreshControls();
    if (source === 'microphone') {
      try {
        await this.microphone.start((samples, rate) =>
          this.pushAudio(samples, rate, session)
        );
      } catch (error) {
        if (this.listening === session) this.listening = null;
        if (!this.disposed) {
          this.showError(
            error?.name === 'NotAllowedError'
              ? new Error('Allow microphone access to caption speech.')
              : error
          );
        }
        this.refreshControls();
        return false;
      }
      if (this.listening !== session) {
        await this.microphone.stop();
        return false;
      }
    }
    this.status.text = 'Listening. Speak and captions appear below.';
    this.refreshControls();
    return true;
  }

  async stopListening({flush = true} = {}) {
    const session = this.listening;
    if (!session) return;
    this.listening = null;
    if (session.source === 'microphone') await this.microphone.stop();
    if (flush) {
      for (const event of session.segmenter.flush()) {
        this.handleSegment(event, session);
      }
    }
    this.setLevel(0, true);
    if (!this.disposed && this.client.loaded) {
      this.status.text = 'Stopped. Choose Start listening to continue.';
    }
    this.refreshControls();
  }

  /**
   * @param {Float32Array} samples
   * @param {number} sampleRate
   */
  pushAudio(samples, sampleRate, session = this.listening) {
    if (!session || session !== this.listening || this.disposed) return;
    if (session.rate !== sampleRate) {
      session.rate = sampleRate;
      session.resampler =
        sampleRate === TARGET_SAMPLE_RATE ? null : new Resampler(sampleRate);
    }
    const mono = session.resampler
      ? session.resampler.process(samples)
      : samples;
    for (const event of session.segmenter.push(mono)) {
      this.handleSegment(event, session);
    }
  }

  handleSegment(event, session) {
    const now = this.now();
    const {frameMs, startFrames} = session.segmenter.config;
    const id = session.idBase + event.id;
    this.lastSegmentId = Math.max(this.lastSegmentId, id);
    if (event.type === 'start') {
      this.utterances.set(id, {
        startedAt: now - startFrames * frameMs,
        firstShownAt: null,
      });
      return;
    }
    if (event.tooShort) {
      this.utterances.delete(id);
      if (this.log.dropInterim(id)) this.textWriter.schedule();
      return;
    }
    this.scheduler.submitFinal(id, event.audio, {
      speechEndedAt: now - event.silenceMs,
    });
  }

  requestPartial() {
    const session = this.listening;
    if (!session?.segmenter.active || this.scheduler.busy) return;
    if (this.now() - this.lastPartialAt < PARTIAL_MS) return;
    const {segmenter} = session;
    if (
      segmenter.speechFrames * segmenter.config.frameMs <
      MIN_PARTIAL_SPEECH_MS
    ) {
      return;
    }
    const audio = segmenter.activeAudio();
    if (!audio) return;
    this.lastPartialAt = this.now();
    this.scheduler.requestPartial(
      session.idBase + session.segmenter.activeId,
      audio
    );
  }

  /**
   * Debug helper: plays decoded audio through the same resampler, segmenter
   * and worker as the microphone, paced in real time by default.
   * @param {Float32Array} samples
   * @param {number} sampleRate
   */
  async feed(samples, sampleRate, {chunkFrames = 2048, realtime = true} = {}) {
    if (!(await this.startListening({source: 'file'}))) {
      throw new Error(
        'Load the model and stop listening before feeding audio.'
      );
    }
    const session = this.listening;
    const chunkMs = (chunkFrames / sampleRate) * 1000;
    const started = this.now();
    for (
      let offset = 0, index = 1;
      offset < samples.length && this.listening === session;
      offset += chunkFrames, index++
    ) {
      this.pushAudio(
        samples.slice(offset, offset + chunkFrames),
        sampleRate,
        session
      );
      const wait = realtime ? started + index * chunkMs - this.now() : 0;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, wait)));
    }
    if (this.listening === session) await this.stopListening();
    await this.whenIdle();
    return this.history;
  }

  /** Resolves once queued transcriptions are shown. */
  async whenIdle() {
    while (
      !this.disposed &&
      (this.scheduler.busy || this.textWriter.hasPending)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async clearCaptions() {
    if (this.disposed) return;
    this.scheduler.clear();
    this.log.clear();
    this.utterances.clear();
    this.shownFinals = [];
    this.history = [];
    this.metricsValues = {};
    this.metrics.text = formatMetrics();
    this.textWriter.schedule();
    this.textWriter.flush();
    this.captionView.scrollTo(0);
    this.pendingBottom = undefined;
  }

  /** Writes the one caption text node; called at most every UPDATE_MS. */
  writeCaptions() {
    if (this.disposed) return;
    const now = this.now();
    if (
      !this.pendingBottom &&
      this.captionView.maxScrollTop - this.captionView.scrollTop < 16
    ) {
      this.pendingBottom = {
        height: this.captionView.scrollHeight,
        offset: this.captionView.scrollTop,
      };
    }
    const text = this.log.render();
    if (this.captionText.text !== text) this.captionText.text = text;
    const interimId = this.log.interim?.text ? this.log.interim.id : null;
    const first = this.utterances.get(interimId);
    if (first && first.firstShownAt === null) {
      first.firstShownAt = now;
      this.metricsValues.firstCaptionMs = now - first.startedAt;
    }
    for (const final of this.shownFinals) {
      const utterance = {
        id: final.id,
        text: final.text,
        finalLatencyMs: now - final.meta.speechEndedAt,
        inferenceMs: final.result.inferenceMs,
        audioMs: final.result.audioMs,
        rtf: final.result.inferenceMs / final.result.audioMs,
      };
      this.history.push(utterance);
      this.metricsValues.finalLatencyMs = utterance.finalLatencyMs;
      this.metricsValues.rtf = utterance.rtf;
    }
    if (this.shownFinals.length) {
      this.shownFinals = [];
      this.metrics.text = formatMetrics(this.metricsValues);
    }
  }

  setLevel(value, force = false) {
    if (!force && Math.abs(value - this.levelValue) < LEVEL_STEP) return;
    this.levelValue = value;
    this.levelFill.style.width = `${value}%`;
  }

  update() {
    if (this.disposed) return;
    const now = this.now();
    this.requestPartial();
    this.textWriter.poll();
    if (
      this.pendingProgress !== undefined &&
      now - this.lastProgressAt >= UPDATE_MS
    ) {
      if (this.status.text !== this.pendingProgress) {
        this.status.text = this.pendingProgress;
      }
      this.pendingProgress = undefined;
      this.lastProgressAt = now;
    }
    if (this.pendingBottom && this.captionView.ready) {
      if (this.captionView.scrollTop !== this.pendingBottom.offset) {
        this.pendingBottom = undefined;
      } else if (this.captionView.scrollHeight !== this.pendingBottom.height) {
        this.captionView.scrollTo(this.captionView.maxScrollTop);
        this.pendingBottom = undefined;
      }
    }
    if (now - this.lastLevelAt >= UPDATE_MS) {
      this.lastLevelAt = now;
      this.setLevel(
        this.listening ? levelPercent(this.listening.segmenter.level) : 0
      );
    }
    if (now - this.lastStateAt >= UPDATE_MS) {
      this.lastStateAt = now;
      this.refreshControls();
    }
  }

  refreshControls() {
    const busy = this.busy || this.stopping;
    const unavailable = this.disposed || !this.supported;
    const loading = this.operation?.type === 'loading';
    const label = loading
      ? 'Cancel'
      : this.client.loaded
        ? LOADED_LABEL
        : this.cached
          ? CACHED_LABEL
          : DOWNLOAD_LABEL;
    if (this.loadButton.label !== label) this.loadButton.label = label;
    this.loadButton.disabled = loading
      ? !!this.stopping
      : unavailable || busy || this.client.loaded;
    const listenLabel = this.listening ? 'Stop listening' : 'Start listening';
    if (this.listenButton.label !== listenLabel) {
      this.listenButton.label = listenLabel;
    }
    this.listenButton.disabled =
      unavailable || busy || (!this.client.loaded && !this.listening);
    this.clearButton.disabled = this.disposed || this.log.empty;
    const unloaded =
      !this.disposed && this.previousLoaded && !this.client.loaded && !busy;
    this.previousLoaded = this.client.loaded;
    if (unloaded) this.showUnloaded();
  }

  showUnloaded() {
    if (this.disposed) return;
    if (!this.status.text.endsWith(RELOAD)) {
      const error = this.status.text.startsWith('Error:')
        ? `${this.status.text} `
        : '';
      this.status.text = `${error}${RELOAD}`;
    }
    if (this.listening) void this.stopListening({flush: false});
  }

  canStart() {
    return !this.disposed && !this.busy && !this.stopping;
  }

  begin(type) {
    this.operation = {type, canceled: false};
    this.busy = true;
    this.refreshControls();
    return this.operation;
  }

  isCurrent(operation) {
    return (
      !this.disposed && this.operation === operation && !operation.canceled
    );
  }

  finish(operation) {
    if (this.operation !== operation) return;
    this.operation = undefined;
    this.busy = false;
    this.refreshControls();
  }

  showError(error, prefix = 'Error') {
    console.error('Offline captions:', error);
    if (!this.disposed) {
      this.status.text = `${prefix}: ${error?.message ?? String(error)}`;
    }
  }

  dispose() {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    if (this.operation) this.operation.canceled = true;
    this.scheduler.clear();
    this.textWriter.cancel();
    this.pendingBottom = undefined;
    this.pendingProgress = undefined;
    for (const button of this.buttons) button.onClick = undefined;
    const listening = this.listening;
    this.listening = null;
    this.clear();
    this.disposing = Promise.resolve()
      .then(() => listening?.source === 'microphone' && this.microphone.stop())
      .then(() => this.client.dispose())
      .catch((error) => console.error('Offline captions:', error));
    return this.disposing;
  }
}
