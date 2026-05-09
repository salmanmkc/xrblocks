import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AI} from '../ai/AI';
import {Gemini} from '../ai/Gemini';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {Registry} from '../core/components/Registry';

import {World} from './World';
import {WorldOptions} from './WorldOptions';

function makeWorld(opts?: Partial<WorldOptions>) {
  const world = new World();
  const options = new WorldOptions();
  Object.assign(options, opts);
  return {world, options};
}

async function initWorld(
  world: World,
  options: WorldOptions,
  registry: Registry
) {
  await world.init({options, camera: new THREE.PerspectiveCamera(), registry});
}

describe('World', () => {
  describe('init', () => {
    it('initializes when only options + camera + registry are provided (no AI / no camera)', async () => {
      const {world, options} = makeWorld();
      const registry = new Registry();
      registry.register(registry);
      await expect(initWorld(world, options, registry)).resolves.not.toThrow();
    });
  });

  describe('askAboutScene', () => {
    let world: World;
    let registry: Registry;
    let aiQuery: ReturnType<typeof vi.fn>;
    let geminiQuery: ReturnType<typeof vi.fn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const made = makeWorld();
      world = made.world;
      registry = new Registry();
      registry.register(registry);
      await initWorld(world, made.options, registry);
      aiQuery = vi.fn().mockResolvedValue({text: 'text-only-answer'});
      geminiQuery = vi.fn().mockResolvedValue({text: 'vision-answer'});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    function registerAi(model?: object) {
      const fakeModel = model ?? Object.create(Gemini.prototype);
      Object.assign(fakeModel as object, {query: geminiQuery});
      const ai = Object.create(AI.prototype) as AI;
      Object.assign(ai, {
        isAvailable: () => true,
        model: fakeModel,
        query: aiQuery,
      });
      registry.register(ai, AI);
      return ai;
    }

    function registerCamera(
      snapshot: string | null = 'data:image/png;base64,AAA'
    ) {
      const camera = Object.create(XRDeviceCamera.prototype) as XRDeviceCamera;
      Object.assign(camera, {
        getSnapshot: vi.fn().mockResolvedValue(snapshot),
      });
      registry.register(camera, XRDeviceCamera);
      return camera;
    }

    it('throws when AI is not registered', async () => {
      await expect(world.askAboutScene('hi')).rejects.toThrow(/AI/i);
    });

    it('uses Gemini multipart when image option is provided', async () => {
      registerAi();
      const text = await world.askAboutScene('what is this?', {
        image: {data: 'BBB', mimeType: 'image/jpeg'},
      });
      expect(text).toBe('vision-answer');
      expect(geminiQuery).toHaveBeenCalledTimes(1);
      const call = geminiQuery.mock.calls[0][0];
      expect(call.type).toBe('multiPart');
      expect(call.parts).toEqual([
        {inlineData: {mimeType: 'image/jpeg', data: 'BBB'}},
        {text: 'what is this?'},
      ]);
      expect(aiQuery).not.toHaveBeenCalled();
    });

    it('captures from the device camera when no image is provided', async () => {
      registerAi();
      const cam = registerCamera('data:image/png;base64,ZZZ');
      const text = await world.askAboutScene('describe the scene');
      expect(text).toBe('vision-answer');
      expect(cam.getSnapshot).toHaveBeenCalledWith({outputFormat: 'base64'});
      const parts = geminiQuery.mock.calls[0][0].parts;
      expect(parts[0]).toEqual({
        inlineData: {mimeType: 'image/png', data: 'ZZZ'},
      });
      expect(parts[1]).toEqual({text: 'describe the scene'});
    });

    it('falls back to text-only when no camera is registered and warns', async () => {
      registerAi();
      const text = await world.askAboutScene('just a thought');
      expect(text).toBe('text-only-answer');
      expect(aiQuery).toHaveBeenCalledWith({prompt: 'just a thought'});
      expect(geminiQuery).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back to text-only when camera snapshot returns null and warns', async () => {
      registerAi();
      registerCamera(null);
      const text = await world.askAboutScene('describe');
      expect(text).toBe('text-only-answer');
      expect(aiQuery).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back to text-only when the model is not Gemini and warns', async () => {
      const nonGemini = {query: geminiQuery};
      registerAi(nonGemini);
      const text = await world.askAboutScene('hi', {
        image: {data: 'AAA', mimeType: 'image/png'},
      });
      expect(text).toBe('text-only-answer');
      expect(aiQuery).toHaveBeenCalledWith({prompt: 'hi'});
      expect(geminiQuery).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('returns null when the AI response has no text', async () => {
      registerAi();
      geminiQuery.mockResolvedValueOnce({text: null});
      const text = await world.askAboutScene('q', {
        image: {data: 'A', mimeType: 'image/png'},
      });
      expect(text).toBeNull();
    });
  });
});
