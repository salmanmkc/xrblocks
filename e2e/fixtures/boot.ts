import {test as base, expect, type Page, type TestInfo} from '@playwright/test';
import {SimulatorDriver} from '../drivers/simulator';
import {IwerDriver, type IwerDriverOptions} from '../drivers/webxr';
import type {XRTestDriver} from '../drivers/types';

type Fixtures = {
  /** Booted driver for the current project's backend. */
  driver: XRTestDriver & {webgpu: boolean};
  /** The app the driver boots, relative to the repository root. */
  appPath: string;
  /** Per-test settings for the emulated IWER headset. */
  iwerOptions: IwerDriverOptions;
};

/**
 * Whether the test's project renders with `THREE.WebGPURenderer`. Skips the
 * test when the browser has no WebGPU, or when the project drives IWER and
 * the installed IWER can't emulate WebGPU sessions.
 */
export async function rendersWithWebGPU(
  page: Page,
  testInfo: TestInfo
): Promise<boolean> {
  const project = testInfo.project.name;
  if (!project.endsWith('-webgpu')) {
    return false;
  }
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
  if (project.startsWith('xr-') && !IwerDriver.emulatesWebGPU()) {
    testInfo.skip(true, 'The installed IWER does not emulate WebGPU sessions.');
  }
  return true;
}

/**
 * Boots the harness app on the project's backend:
 * - `sim-webgl` / `sim-webgpu` — desktop simulator (?xrAutomation=1)
 * - `xr-iwer` / `xr-iwer-webgpu` — the real WebXR code path behind IWER's
 *   emulated headset
 * The WebGPU projects switch the harness to `THREE.WebGPURenderer`.
 */
export const test = base.extend<Fixtures>({
  appPath: ['e2e/fixtures/apps/harness.html', {option: true}],
  iwerOptions: [{}, {option: true}],
  driver: async ({page, appPath, iwerOptions}, use, testInfo) => {
    const webxr = testInfo.project.name.startsWith('xr-');
    const webgpu = await rendersWithWebGPU(page, testInfo);
    const driver = webxr
      ? new IwerDriver(page, iwerOptions)
      : new SimulatorDriver(page);
    driver.webgpu = webgpu;
    await driver.boot(appPath);
    await use(driver);
    await driver.destroy().catch(() => undefined);
  },
});

export {expect};
