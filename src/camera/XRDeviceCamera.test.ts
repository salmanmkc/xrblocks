import {describe, it, expect, vi, beforeEach} from 'vitest';

import {StreamState} from '../video/VideoStream';

import {XRDeviceCamera} from './XRDeviceCamera';

function createMockOptions() {
  return {
    willCaptureFrequently: false,
    videoConstraints: {facingMode: 'environment' as const},
    rgbToDepthParams: {
      fx: 0,
      fy: 0,
      cx: 0,
      cy: 0,
      nearZ: 0,
      farZ: 0,
      aspectRatio: 1,
    },
  };
}

/**
 * Creates a mock MediaStream with a single video track.
 */
function createMockStream(): MediaStream {
  const track = {
    kind: 'video',
    getSettings: () => ({deviceId: 'mock-device', facingMode: 'environment'}),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

describe('XRDeviceCamera', () => {
  let camera: XRDeviceCamera;

  beforeEach(() => {
    camera = new XRDeviceCamera(createMockOptions());

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          {
            kind: 'videoinput',
            deviceId: 'mock-device',
            label: 'Mock Camera',
            groupId: 'mock-group',
          },
        ]),
        getUserMedia: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('sets ERROR state when video.play() is rejected', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      createMockStream()
    );

    const playError = new Error('NotAllowedError: play() request was rejected');
    Object.defineProperty(camera, 'video_', {
      value: {
        ...document.createElement('video'),
        set srcObject(_: MediaStream | null) {},
        set src(_: string) {},
        play: vi.fn().mockRejectedValue(playError),
        onloadedmetadata: null,
        onerror: null,
        autoplay: true,
        muted: true,
        playsInline: true,
      },
      writable: true,
      configurable: true,
    });

    const stateChanges: StreamState[] = [];
    camera.addEventListener('statechange', ((event: {state: StreamState}) => {
      stateChanges.push(event.state);
    }) as unknown as EventListener);

    await expect(camera.init()).rejects.toThrow(
      'Failed to start video playback'
    );
    expect(stateChanges).toContain(StreamState.ERROR);
  });
});
