import type {Page} from '@playwright/test';

/**
 * Fails a WebGPU project's boot unless the app renders with three's WebGPU
 * backend and, in XR, the session was granted 'webgpu'. WebGPURenderer can
 * fall back to WebGL, which would otherwise pass as a WebGPU run.
 */
export async function assertRendersWithWebGPU(
  page: Page,
  xr: boolean
): Promise<void> {
  const {backend, sessionWebGPU} = await page.evaluate(() => {
    const renderer = (
      window as unknown as {
        xb: {
          core: {
            renderer: {
              backend?: {isWebGPUBackend?: boolean; isWebGLBackend?: boolean};
              xr?: {getSession?(): {enabledFeatures?: string[]} | null};
            };
          };
        };
      }
    ).xb.core.renderer;
    const features = renderer.xr?.getSession?.()?.enabledFeatures ?? [];
    return {
      backend: renderer.backend?.isWebGPUBackend
        ? 'WebGPU'
        : renderer.backend?.isWebGLBackend
          ? 'WebGL'
          : 'no WebGPURenderer',
      sessionWebGPU: Array.from(features).includes('webgpu'),
    };
  });
  if (backend !== 'WebGPU') {
    throw new Error(`Expected three's WebGPU backend, but got ${backend}.`);
  }
  if (xr && !sessionWebGPU) {
    throw new Error("The XR session wasn't granted the 'webgpu' feature.");
  }
}
