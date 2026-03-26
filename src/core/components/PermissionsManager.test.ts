import {beforeEach, describe, expect, it, vi} from 'vitest';

import {PermissionsManager} from './PermissionsManager';

function createMediaError(name: string, message = 'media error') {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('PermissionsManager', () => {
  let permissionsManager: PermissionsManager;

  beforeEach(() => {
    permissionsManager = new PermissionsManager();

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('allows camera permission to fall back when XR camera access is available', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      createMediaError('NotFoundError', 'No camera hardware exposed')
    );
    vi.spyOn(permissionsManager, 'checkPermissionStatus').mockResolvedValue(
      'unknown'
    );

    await expect(
      permissionsManager.checkAndRequestPermissions(
        {camera: true},
        {allowVideoFallback: true}
      )
    ).resolves.toEqual({granted: true, status: 'granted', error: undefined});
  });

  it('keeps reporting missing camera hardware without XR fallback', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      createMediaError('NotFoundError', 'No camera hardware exposed')
    );
    vi.spyOn(permissionsManager, 'checkPermissionStatus').mockResolvedValue(
      'unknown'
    );

    await expect(
      permissionsManager.checkAndRequestPermissions({camera: true})
    ).resolves.toEqual({
      granted: false,
      status: 'error',
      error: 'Hardware not found.',
    });
  });

  it('does not bypass combined camera and microphone requests', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      createMediaError('NotFoundError', 'No camera hardware exposed')
    );
    vi.spyOn(permissionsManager, 'checkPermissionStatus').mockResolvedValue(
      'unknown'
    );

    await expect(
      permissionsManager.checkAndRequestPermissions(
        {camera: true, microphone: true},
        {allowVideoFallback: true}
      )
    ).resolves.toEqual({
      granted: false,
      status: 'error',
      error: 'Hardware not found.',
    });
  });
});
