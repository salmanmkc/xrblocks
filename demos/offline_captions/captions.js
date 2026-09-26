export const UPDATE_MS = 100;
export const MAX_LINES = 60;
export const PLACEHOLDER = 'Captions appear here.';

/** Finalized caption lines plus one interim line, rendered as one string. */
export class CaptionLog {
  constructor({maxLines = MAX_LINES} = {}) {
    this.maxLines = maxLines;
    /** @type {string[]} */
    this.lines = [];
    /** @type {{id: number, text: string} | null} */
    this.interim = null;
    /** Highest segment id that has been finalized. */
    this.finalizedId = 0;
    this.revision = 0;
  }

  /**
   * @param {number} id
   * @param {string} text
   * @returns {boolean} whether the visible text changed.
   */
  setInterim(id, text) {
    if (id <= this.finalizedId) return false;
    text = normalize(text);
    if (this.interim?.id === id && this.interim.text === text) return false;
    this.interim = {id, text};
    this.revision++;
    return true;
  }

  /**
   * @param {number} id
   * @param {string} text
   * @returns {boolean} whether the visible text changed.
   */
  finalize(id, text) {
    if (id <= this.finalizedId) return false;
    this.finalizedId = id;
    text = normalize(text);
    const hadInterim = this.interim !== null && this.interim.id <= id;
    if (hadInterim) this.interim = null;
    if (!text) {
      if (hadInterim) this.revision++;
      return hadInterim;
    }
    this.lines.push(text);
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
    this.revision++;
    return true;
  }

  /** Drop the interim line without finalizing, for example a skipped noise. */
  dropInterim(id) {
    if (this.interim?.id !== id) return false;
    this.interim = null;
    this.revision++;
    return true;
  }

  clear() {
    this.lines = [];
    this.interim = null;
    this.revision++;
  }

  get empty() {
    return !this.lines.length && !this.interim?.text;
  }

  render() {
    if (this.empty) return PLACEHOLDER;
    const parts = [...this.lines];
    if (this.interim?.text) parts.push(`${this.interim.text} …`);
    return parts.join('\n');
  }
}

/** Latest-value throttle: at most one delivery per interval plus a final flush. */
export class Throttle {
  /**
   * @param {(value: unknown) => void} deliver
   * @param {{intervalMs?: number, now?: () => number}} [options]
   */
  constructor(
    deliver,
    {intervalMs = UPDATE_MS, now = () => performance.now()} = {}
  ) {
    this.deliver = deliver;
    this.intervalMs = intervalMs;
    this.now = now;
    this.last = -Infinity;
    this.hasPending = false;
    this.pending = undefined;
  }

  /** @param {unknown} value */
  schedule(value) {
    this.pending = value;
    this.hasPending = true;
  }

  /** Deliver the pending value if the interval has elapsed. */
  poll() {
    if (!this.hasPending || this.now() - this.last < this.intervalMs) return;
    this.flush();
  }

  flush() {
    if (!this.hasPending) return;
    const value = this.pending;
    this.hasPending = false;
    this.pending = undefined;
    this.last = this.now();
    this.deliver(value);
  }

  cancel() {
    this.hasPending = false;
    this.pending = undefined;
  }
}

/**
 * @param {{firstCaptionMs?: number | null, finalLatencyMs?: number | null, rtf?: number | null}} metrics
 */
export function formatMetrics({firstCaptionMs, finalLatencyMs, rtf} = {}) {
  const ms = (value) =>
    Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
  const factor = Number.isFinite(rtf) ? rtf.toFixed(2) : '-';
  return `First caption: ${ms(firstCaptionMs)} · End of speech to text: ${ms(finalLatencyMs)} · Real-time factor: ${factor}`;
}

/** @param {string} text */
function normalize(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
