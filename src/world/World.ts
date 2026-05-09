import * as THREE from 'three';

import {AI} from '../ai/AI';
import {Gemini} from '../ai/Gemini';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {Script} from '../core/Script';
import {Registry} from '../core/components/Registry';
import {placeObjectAtIntersectionFacingTarget} from '../utils/ObjectPlacement';
import {parseBase64DataURL} from '../utils/utils';

import {ObjectDetector} from './objects/ObjectDetector';
import {PlaneDetector} from './planes/PlaneDetector';
import {WorldOptions} from './WorldOptions';
import {MeshDetector} from './mesh/MeshDetector';
// Import other modules as they are implemented in future.
// import { SceneMesh } from '/depth/SceneMesh.js';
// import { LightEstimation } from '/lighting/LightEstimation.js';
// import { HumanRecognizer } from '/human/HumanRecognizer.js';

/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
export class World extends Script {
  static dependencies = {
    options: WorldOptions,
    camera: THREE.Camera,
    registry: Registry,
  };

  editorIcon = 'sensors';

  /**
   * Configuration options for all world-sensing features.
   */
  options!: WorldOptions;

  /**
   * The depth module instance. Null if not enabled.
   */
  // depth = null;

  /**
   * The light estimation module instance. Null if not enabled.
   */
  // lighting = null;

  /**
   * The plane detection module instance. Null if not enabled.
   * Not recommended for anchoring.
   */
  planes?: PlaneDetector;

  /**
   * The object recognition module instance. Null if not enabled.
   */
  objects?: ObjectDetector;

  /**
   * The mesh detection module instance. Null if not enabled.
   */
  meshes?: MeshDetector;

  /**
   * A Three.js Raycaster for performing intersection tests.
   */
  private raycaster = new THREE.Raycaster();

  private camera!: THREE.Camera;
  private registry!: Registry;

  // Whether we need to initiate a room capture.
  private needsRoomCapture = false;

  /**
   * Initializes the world-sensing modules based on the provided configuration.
   * This method is called automatically by the XRCore.
   */
  override async init({
    options,
    camera,
    registry,
  }: {
    options: WorldOptions;
    camera: THREE.Camera;
    registry: Registry;
  }) {
    this.options = options;
    this.camera = camera;
    this.registry = registry;

    if (!this.options || !this.options.enabled) {
      return;
    }

    this.needsRoomCapture = this.options.initiateRoomCapture;

    // Conditionally initialize each perception module based on options.
    if (this.options.planes.enabled) {
      this.planes = new PlaneDetector();
      this.add(this.planes);
    }

    if (this.options.objects.enabled) {
      this.objects = new ObjectDetector();
      this.add(this.objects);
    }

    if (this.options.meshes.enabled) {
      this.meshes = new MeshDetector();
      this.add(this.meshes);
    }

    // TODO: Initialize other modules as they are available & implemented.
    /*

    if (this.options.lighting.enabled) {
      this.lighting = new LightEstimation();
    }

    if (this.options.humans.enabled) {
      this.humans = new HumanRecognizer();
    }
    */
  }

  /**
   * Places an object at the reticle.
   */
  anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D) {
    throw new Error('Method not implemented');
  }

  /**
   * Updates all active world-sensing modules with the latest XRFrame data.
   * This method is called automatically by the XRCore on each frame.
   * @param _timestamp - The timestamp for the current frame.
   * @param frame - The current XRFrame, containing environmental
   * data.
   * @override
   */
  update(_timestamp: number, frame?: XRFrame) {
    if (!this.options?.enabled || !frame) {
      return;
    }

    if (this.needsRoomCapture && frame.session.initiateRoomCapture) {
      this.needsRoomCapture = false;
      frame.session.initiateRoomCapture();
    }

    this.meshes?.updateMeshes(_timestamp, frame);
  }

  /**
   * Performs a raycast from a controller against detected real-world surfaces
   * (currently planes) and places a 3D object at the intersection point,
   * oriented to face the user.
   *
   * We recommend using /templates/3_depth/ to anchor objects based on
   * depth mesh for mixed reality experience for accuracy. This function is
   * design for demonstration purposes.
   *
   * @param objectToPlace - The object to position in the
   * world.
   * @param controller - The controller to use for raycasting.
   * @returns True if the object was successfully placed, false
   * otherwise.
   */
  placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D) {
    if (!this.planes) {
      console.warn('Cannot placeOnSurface: PlaneDetector is not enabled.');
      return false;
    }

    const allPlanes = this.planes.get();
    if (allPlanes.length === 0) {
      return false; // No surfaces to cast against.
    }

    this.raycaster.setFromXRController(controller as THREE.XRTargetRaySpace);

    const intersections = this.raycaster.intersectObjects(allPlanes);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      placeObjectAtIntersectionFacingTarget(
        objectToPlace,
        intersection,
        this.camera
      );
      return true;
    }

    return false;
  }

  /**
   * Toggles the visibility of all debug visualizations for world features.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    this.planes?.showDebugVisualizations(visible);
    this.objects?.showDebugVisualizations(visible);
  }

  /**
   * Asks the AI a question about what the device camera currently sees.
   *
   * Resolves an image source in this priority order:
   *   1. `options.image` (pre-stripped base64 + MIME type),
   *   2. a fresh snapshot from the registered `XRDeviceCamera`.
   *
   * If an image is available and the active model is Gemini, sends a multipart
   * request (image + prompt). Otherwise logs a warning and falls back to a
   * text-only `ai.query({prompt})` call.
   *
   * Throws if no `AI` is registered.
   *
   * @param prompt - The natural-language question to ask.
   * @param options - Optional pre-supplied image data.
   * @returns The model's text response, or null if the model returned none.
   */
  async askAboutScene(
    prompt: string,
    options?: AskAboutSceneOptions
  ): Promise<string | null> {
    const ai = this.registry?.get(AI);
    if (!ai) {
      throw new Error(
        'world.askAboutScene: no AI is registered. Call options.enableAI() first.'
      );
    }

    let image = options?.image ?? null;
    if (!image) {
      const camera = this.registry.get(XRDeviceCamera);
      if (camera) {
        const dataUrl = await camera.getSnapshot({outputFormat: 'base64'});
        if (dataUrl) {
          const {strippedBase64, mimeType} = parseBase64DataURL(dataUrl);
          image = {
            data: strippedBase64,
            mimeType: mimeType ?? 'image/png',
          };
        } else {
          console.warn(
            'world.askAboutScene: device camera snapshot was unavailable; ' +
              'falling back to text-only query.'
          );
        }
      } else {
        console.warn(
          'world.askAboutScene: no XRDeviceCamera is registered; ' +
            'falling back to text-only query. Call options.enableCamera() ' +
            'to enable vision answers.'
        );
      }
    }

    if (image && ai.model instanceof Gemini) {
      const response = await ai.model.query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: image.mimeType, data: image.data}},
          {text: prompt},
        ],
      });
      return response?.text ?? null;
    }

    if (image) {
      console.warn(
        'world.askAboutScene: active AI model does not support vision input; ' +
          'falling back to text-only query.'
      );
    }

    const response = await ai.query({prompt});
    if (!response) return null;
    if (typeof response === 'string') return response;
    return response.text ?? null;
  }
}

/**
 * Options accepted by {@link World.askAboutScene}.
 */
export interface AskAboutSceneOptions {
  /**
   * Pre-supplied image to send to the model. If omitted, a snapshot is captured
   * from the registered {@link XRDeviceCamera}.
   *
   * - `data`: stripped base64 (no `data:` URL prefix).
   * - `mimeType`: e.g. `image/png`, `image/jpeg`.
   */
  image?: {data: string; mimeType: string};
}
