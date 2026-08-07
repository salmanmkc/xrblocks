import * as THREE from 'three';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {HumanRecognizer} from './HumanRecognizer';
import {WorldOptions} from '../WorldOptions';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Depth} from '../../depth/Depth';
import {DetectedBodyPose} from './DetectedBodyPose';

vi.mock('../../camera/CameraUtils', () => ({
  getCameraParametersSnapshot: vi.fn().mockReturnValue({}),
}));

interface PrivateRecognizer {
  currentDetectionPromise: Promise<DetectedBodyPose[]> | null;
  getOrCreateBackend: (
    activeBackend: string,
    context: unknown
  ) => Promise<unknown>;
}

describe('HumanRecognizer Multi-Client API', () => {
  let recognizer: HumanRecognizer;
  let mockBackend: {run: ReturnType<typeof vi.fn>};
  let options: WorldOptions;

  beforeEach(() => {
    vi.restoreAllMocks();

    options = new WorldOptions();
    options.humans.enable();
    const deviceCamera = {} as unknown as XRDeviceCamera;
    const depth = {
      // A real geometry so the snapshot cache can read the position
      // attribute's version, the same way the depth mesh provides it.
      depthMesh: new THREE.Mesh(new THREE.BoxGeometry()),
      options: {
        depthMesh: {
          updateFullResolutionGeometry: false,
        },
      },
    } as unknown as Depth;
    const camera = new THREE.PerspectiveCamera();
    const renderer = {
      xr: {
        getCamera: () => new THREE.PerspectiveCamera(),
      },
    } as unknown as THREE.WebGLRenderer;

    recognizer = new HumanRecognizer();
    recognizer.init({
      options,
      deviceCamera,
      depth,
      camera,
      renderer,
    });

    mockBackend = {
      run: vi.fn().mockResolvedValue([{uuid: 'pose-1'}]),
    };
    vi.spyOn(
      recognizer as unknown as PrivateRecognizer,
      'getOrCreateBackend'
    ).mockResolvedValue(mockBackend);
  });

  it('should start continuous detection for clients and cache results to poses', async () => {
    const client = {};
    recognizer.start(client);

    // Continuous detection runs immediately on first client start
    const promise = (recognizer as unknown as PrivateRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();

    const results = await promise;
    expect(results).toEqual([{uuid: 'pose-1'}]);
    expect(recognizer.poses).toEqual([{uuid: 'pose-1'}]);
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBeNull();

    // Subsequent updates trigger new detections
    recognizer.update();
    const promise2 = (recognizer as unknown as PrivateRecognizer)
      .currentDetectionPromise;
    expect(promise2).not.toBeNull();
    await promise2;
  });

  it('respects pollingIntervalMs for continuous detection', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    options.humans.pollingIntervalMs = 100;

    recognizer.start({});
    await (recognizer as unknown as PrivateRecognizer).currentDetectionPromise;

    recognizer.update();
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBeNull();

    now = 1099;
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBeNull();

    now = 1100;
    recognizer.update();
    const promise = (recognizer as unknown as PrivateRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;
    expect(mockBackend.run).toHaveBeenCalledTimes(2);
  });

  it('should stop continuous detection when all clients stop', async () => {
    const client1 = {};
    const client2 = {};

    recognizer.start(client1);
    recognizer.start(client2);

    const promise = (recognizer as unknown as PrivateRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;

    // Stop one client, continuous detection should still be active
    recognizer.stop(client1);
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).not.toBeNull();
    await (recognizer as unknown as PrivateRecognizer).currentDetectionPromise;

    // Stop final client, continuous detection should not be triggered on update
    recognizer.stop(client2);
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBeNull();
  });

  it('should return the ongoing promise for concurrent runDetection calls when started', async () => {
    const client = {};
    recognizer.start(client);

    const continuousPromise = (recognizer as unknown as PrivateRecognizer)
      .currentDetectionPromise;
    expect(continuousPromise).not.toBeNull();

    const runPromise = recognizer.runDetection();
    expect(runPromise).toBe(continuousPromise);

    await runPromise;
  });

  it('should support one-off runs when not started, and reuse the ongoing promise', async () => {
    // No clients started
    const promise1 = recognizer.runDetection();
    expect(promise1).not.toBeNull();
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBe(promise1);

    // A concurrent call should return the exact same promise
    const promise2 = recognizer.runDetection();
    expect(promise2).toBe(promise1);

    const results = await promise1;
    expect(results).toEqual([{uuid: 'pose-1'}]);
    expect(
      (recognizer as unknown as PrivateRecognizer).currentDetectionPromise
    ).toBeNull();
  });

  it('reuses the depth mesh snapshot across detections and frees it on dispose', async () => {
    const geometryDispose = vi.fn();
    const materialDispose = vi.fn();
    const snapshots: THREE.Mesh[] = [];

    mockBackend.run.mockImplementation(
      async (depthMeshSnapshot: THREE.Mesh) => {
        snapshots.push(depthMeshSnapshot);
        vi.spyOn(depthMeshSnapshot.geometry, 'dispose').mockImplementation(
          geometryDispose
        );
        const material = depthMeshSnapshot.material as THREE.Material;
        vi.spyOn(material, 'dispose').mockImplementation(materialDispose);
        return [];
      }
    );

    await recognizer.runDetection();
    await recognizer.runDetection();

    // The depth geometry never changed, so cloning it a second time would be
    // wasted work. Freeing it between detections would defeat the cache.
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(geometryDispose).not.toHaveBeenCalled();

    recognizer.dispose();
    await Promise.resolve();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the snapshot when the depth geometry changes', async () => {
    const snapshots: THREE.Mesh[] = [];
    mockBackend.run.mockImplementation(
      async (depthMeshSnapshot: THREE.Mesh) => {
        snapshots.push(depthMeshSnapshot);
        return [];
      }
    );

    await recognizer.runDetection();

    // three.js bumps the attribute version on needsUpdate, which is what the
    // depth mesh does whenever it refreshes.
    const depth = (recognizer as unknown as {depth: Depth}).depth;
    depth.depthMesh!.geometry.attributes.position.needsUpdate = true;

    await recognizer.runDetection();

    expect(snapshots[0]).not.toBe(snapshots[1]);
  });
});
