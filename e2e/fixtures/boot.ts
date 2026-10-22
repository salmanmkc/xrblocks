import {test as base, expect} from '@playwright/test';
import {SimulatorDriver} from '../drivers/simulator';
import {IwerDriver, type IwerDriverOptions} from '../drivers/webxr';
import type {XRTestDriver} from '../drivers/types';

type Fixtures = {
  /** Booted driver for the current project's backend. */
  driver: XRTestDriver & {webgpu: boolean};
  /** Per-test settings for the emulated IWER headset. */
  iwerOptions: IwerDriverOptions;
};

/**
 * Boots the harness app on the project's backend:
 * - `sim-webgl` / `sim-webgpu` — desktop simulator (?xrAutomation=1), with
 *   the WebGPU project switching the harness to `THREE.WebGPURenderer`
 * - `xr-*` — the real WebXR code path behind IWER's emulated headset
 */
export const test = base.extend<Fixtures>({
  iwerOptions: [{}, {option: true}],
  driver: async ({page, iwerOptions}, use, testInfo) => {
    const project = testInfo.project.name;
    const webxr = project.startsWith('xr-');
    const webgpu = project === 'sim-webgpu';
    if (webgpu) {
      // about:blank isn't a secure context, so it never has navigator.gpu: ask
      // for an adapter on the test server's origin instead.
      await page.goto(process.env.E2E_BASE_URL!);
      const supported = await page.evaluate(async () => {
        const gpu = (
          navigator as Navigator & {
            gpu?: {requestAdapter(): Promise<unknown>};
          }
        ).gpu;
        return Boolean(await gpu?.requestAdapter());
      });
      if (!supported) {
        testInfo.skip(true, 'WebGPU is not available in this browser.');
      }
    }
    const driver = webxr
      ? new IwerDriver(page, iwerOptions)
      : new SimulatorDriver(page);
    driver.webgpu = webgpu;
    await driver.boot('e2e/fixtures/apps/harness.html');
    await use(driver);
    await driver.destroy().catch(() => undefined);
  },
});

export {expect};
