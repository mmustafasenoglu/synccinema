import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => ({ peers: [], socket: null }));

vi.mock('socket.io-client', () => ({
  io: () => {
    const handlers = {};
    mocks.socket = {
      on: (event, handler) => { handlers[event] = handler; },
      emit: vi.fn(),
      disconnect: vi.fn(),
      handlers,
      id: 'me',
    };
    return mocks.socket;
  },
}));

vi.mock('simple-peer', () => ({
  default: class MockPeer {
    constructor(options) {
      this.initiator = options.initiator;
      this.handlers = {};
      this.addTrack = vi.fn();
      this.removeTrack = vi.fn();
      this.signal = vi.fn();
      this.destroy = vi.fn(() => { this.destroyed = true; });
      mocks.peers.push(this);
    }
    on(event, handler) { this.handlers[event] = handler; }
  },
}));

const audioTrack = { kind: 'audio', enabled: true, stop: vi.fn() };
const videoTrack = { kind: 'video', stop: vi.fn() };
const audioStream = {
  tracks: [audioTrack],
  getTracks() { return this.tracks; },
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); },
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); },
  addTrack(track) { this.tracks.push(track); },
  removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track); },
};

beforeEach(() => {
  mocks.peers.length = 0;
  mocks.socket = null;
  audioStream.tracks = [audioTrack];
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/auth/status')
      ? { required: true, authenticated: false }
      : url.endsWith('/auth')
        ? { ok: true, token: 'test-token' }
        : { iceServers: [] },
  })));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValueOnce(audioStream).mockResolvedValueOnce({ getVideoTracks: () => [videoTrack] }) },
  });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('turning the camera on and off keeps the voice peer connected', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.type(await screen.findByPlaceholderText(/Şifreyi giriniz/i), '12345');
  await user.click(screen.getByText(/Giriş Yap/i));
  await screen.findByPlaceholderText(/örn. Mustafa/i);
  act(() => mocks.socket.handlers.connect());
  await user.type(screen.getByPlaceholderText(/örn. Mustafa/i), 'TestUser');
  await user.click(screen.getByText(/Oda Oluştur/i));
  act(() => mocks.socket.handlers.room_status({
    userCount: 2,
    users: [{ socketId: 'me', userName: 'TestUser' }, { socketId: 'other', userName: 'Friend' }],
    isAdmin: true,
    autoVoice: true,
    voiceMode: 'initiator',
  }));
  await waitFor(() => expect(mocks.peers).toHaveLength(1));
  const peer = mocks.peers[0];

  await user.click(screen.getByText(/Kamerayı Aç/i));
  await waitFor(() => expect(peer.addTrack).toHaveBeenCalledWith(videoTrack, audioStream));
  expect(mocks.peers).toHaveLength(1);
  expect(peer.destroy).not.toHaveBeenCalled();
  const renegotiate = { type: 'renegotiate', renegotiate: true };
  act(() => mocks.socket.handlers.webrtc_signal_received({ signal: renegotiate }));
  expect(peer.signal).toHaveBeenCalledWith(renegotiate);

  await user.click(screen.getByText(/Kamerayı Kapat/i));
  expect(peer.removeTrack).toHaveBeenCalledWith(videoTrack, audioStream);
  expect(videoTrack.stop).toHaveBeenCalled();
  expect(mocks.peers).toHaveLength(1);
  expect(peer.destroy).not.toHaveBeenCalled();
});

test('leaving the room cancels a pending WebRTC startup', async () => {
  const user = userEvent.setup();
  const originalFetch = globalThis.fetch;
  let finishTurnRequest;
  vi.stubGlobal('fetch', vi.fn((url, options) => url.endsWith('/turn-credentials')
    ? new Promise(resolve => { finishTurnRequest = resolve; })
    : originalFetch(url, options)));
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  render(<App />);
  await user.type(await screen.findByPlaceholderText(/Şifreyi giriniz/i), '12345');
  await user.click(screen.getByText(/Giriş Yap/i));
  await screen.findByPlaceholderText(/örn. Mustafa/i);
  act(() => mocks.socket.handlers.connect());
  await user.type(screen.getByPlaceholderText(/örn. Mustafa/i), 'TestUser');
  await user.click(screen.getByText(/Oda Oluştur/i));
  act(() => mocks.socket.handlers.room_status({
    userCount: 2,
    users: [{ socketId: 'me', userName: 'TestUser' }, { socketId: 'other', userName: 'Friend' }],
    isAdmin: true,
    autoVoice: true,
    voiceMode: 'initiator',
  }));
  await waitFor(() => expect(finishTurnRequest).toBeTypeOf('function'));
  await user.click(screen.getByText('Çık'));
  await act(async () => {
    finishTurnRequest({ ok: true, json: async () => ({ iceServers: [] }) });
  });
  expect(mocks.peers).toHaveLength(0);
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});
