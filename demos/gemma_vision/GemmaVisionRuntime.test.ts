import {describe, expect, it, vi} from 'vitest';
import {GemmaVisionRuntime} from './GemmaVisionRuntime.js';
import {REVISION} from './modelConfig.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return {promise, resolve};
}

function fixture() {
  const replies: Record<string, any>[] = [];
  const disposeInput = vi.fn();
  const disposeOutput = vi.fn();
  const process = vi.fn(async () => ({
    input_ids: {dims: [1, 300], dispose: disposeInput},
    pixel_values: {dims: [1, 2520, 768], dispose: disposeInput},
    num_soft_tokens_per_image: [266],
  }));
  const template = vi.fn(() => 'templated image question');
  const budgets: number[] = [];
  const model = {
    dispose: vi.fn(),
    generate: vi.fn(async (options) => {
      options.streamer.options.token_callback_function([12n]);
      options.streamer.options.callback_function('A red ');
      options.streamer.options.token_callback_function([13n, 14n, 1n]);
      options.streamer.options.callback_function('chair.');
      return {
        tolist: () => [Array(300).fill(0n).concat([12n, 13n, 14n, 1n])],
        dispose: disposeOutput,
      };
    }),
  };
  const library = {
    env: {backends: {onnx: {wasm: {}}}},
    Gemma4ForConditionalGeneration: {
      from_pretrained: vi.fn(async () => model),
    },
    GemmaTokenizer: class {
      decode() {
        return 'A red chair.';
      }
    },
    Gemma4ImageProcessor: class {
      constructor(config) {
        budgets.push(config.max_soft_tokens);
      }
    },
    Gemma4Processor: vi.fn(function () {
      return Object.assign(process, {apply_chat_template: template});
    }),
    RawImage: class {
      constructor(
        public data,
        public width,
        public height,
        public channels
      ) {}
    },
    TextStreamer: class {
      constructor(
        public tokenizer,
        public options
      ) {}
    },
    InterruptableStoppingCriteria: class {
      interrupted = false;
      interrupt() {
        this.interrupted = true;
      }
    },
  };
  const store = {
    inspectCache: vi.fn(async () => ({complete: true, missingBytes: 0})),
    loadProcessorAssets: vi.fn(async () => ({
      processorConfig: {image_processor: {max_soft_tokens: 280}},
      tokenizerJSON: {},
      tokenizerConfig: {},
      chatTemplate: 'template',
    })),
    createGuardedFetch: vi.fn(() => vi.fn()),
  };
  let clock = 0;
  const runtime = new GemmaVisionRuntime({
    loadRuntime: async () => library,
    postMessage: (reply) => replies.push(reply),
    probe: vi.fn(async () => {}),
    store,
    now: () => (clock += 10),
  });
  const call = (id: number, type: string, extra = {}) =>
    runtime.handle({id, type, ...extra});
  const capture = () =>
    call(2, 'image', {
      imageId: 1,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
  return {
    runtime,
    replies,
    model,
    library,
    store,
    process,
    template,
    budgets,
    disposeInput,
    disposeOutput,
    call,
    capture,
  };
}

describe('GemmaVisionRuntime', () => {
  it('does not load or fetch on construction or capture', async () => {
    const f = fixture();
    await f.capture();
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
    expect(f.store.loadProcessorAssets).not.toHaveBeenCalled();
  });

  it('requires explicit download consent when cache is incomplete', async () => {
    const f = fixture();
    f.store.inspectCache.mockResolvedValue({complete: false, missingBytes: 10});
    await f.call(1, 'load', {allowDownload: false});
    expect(f.replies.at(-1)).toMatchObject({type: 'error', id: 1});
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
  });

  it('pins model loading and does not use AutoProcessor discovery', async () => {
    const f = fixture();
    await f.call(1, 'load', {allowDownload: false});
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        revision: REVISION,
        dtype: 'q4f16',
        device: 'webgpu',
        local_files_only: true,
      })
    );
    expect(f.store.createGuardedFetch).toHaveBeenCalledWith(false);
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      result: {cached: true},
    });
  });

  it('processes the actual image and counts tokens rather than text chunks', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'What is this?'});
    expect(f.template).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [{type: 'image'}, {type: 'text', text: 'What is this?'}],
        },
      ],
      {tokenize: false, add_generation_prompt: true, enable_thinking: false}
    );
    expect(f.process).toHaveBeenCalledWith(
      'templated image question',
      expect.objectContaining({width: 1, height: 1, channels: 4}),
      null,
      {add_special_tokens: false}
    );
    expect(f.model.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        do_sample: false,
        num_beams: 1,
        max_new_tokens: 128,
      })
    );
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      id: 3,
      result: {text: 'A red chair.', generatedTokens: 3, interrupted: false},
    });
    expect(f.disposeInput).toHaveBeenCalledTimes(2);
    expect(f.disposeOutput).toHaveBeenCalledOnce();
  });

  it.each([70, 140, 280])(
    'uses public constructor options for budget %i',
    async (budget) => {
      const f = fixture();
      await f.call(1, 'load');
      await f.capture();
      await f.call(3, 'generate', {
        imageId: 1,
        question: 'Read this',
        imageBudget: budget,
      });
      expect(f.budgets).toEqual([budget]);
    }
  );

  it('retains completed turns only and resets them on a new capture', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await f.call(4, 'generate', {imageId: 1, question: 'What color?'});
    expect(f.template.mock.calls[1][0]).toHaveLength(3);
    await f.call(5, 'image', {
      imageId: 2,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
    await f.call(6, 'generate', {imageId: 2, question: 'Describe again'});
    expect(f.template.mock.calls[2][0]).toHaveLength(1);
  });

  it('rejects a stale image, invalid budget and unknown operation', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    for (const extra of [
      {imageId: 9, question: 'Describe'},
      {imageId: 1, question: 'Describe', imageBudget: 42},
    ]) {
      await f.call(3, 'generate', extra);
      expect(f.replies.at(-1)?.type).toBe('error');
    }
    await f.call(4, 'unknown');
    expect(f.replies.at(-1)?.type).toBe('error');
    expect(f.model.generate).not.toHaveBeenCalled();
  });

  it('serializes work and stops during preprocessing without invoking the model', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    const pause = deferred();
    const input = {input_ids: {dims: [1, 300], dispose: vi.fn()}};
    f.process.mockImplementation(async () => {
      await pause.promise;
      return input;
    });
    const pending = f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await Promise.resolve();
    await f.call(4, 'image', {
      imageId: 2,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
    expect(f.replies.at(-1)).toMatchObject({type: 'error', id: 4});
    const stopping = f.call(5, 'stop', {targetId: 3});
    pause.resolve();
    await Promise.all([pending, stopping]);
    expect(f.model.generate).not.toHaveBeenCalled();
    expect(f.replies).toContainEqual(
      expect.objectContaining({
        id: 3,
        type: 'result',
        result: expect.objectContaining({interrupted: true}),
      })
    );
    expect(input.input_ids.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the model once and visibly rejects later operations', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'dispose');
    await f.call(4, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.model.dispose).toHaveBeenCalledOnce();
    expect(f.replies.at(-1)).toMatchObject({id: 4, type: 'error'});
  });
});
