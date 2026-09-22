import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from './App';
import { extractEmbeddedSubtitles } from './subtitleExtractor';

vi.mock('./subtitleExtractor', async (importOriginal) => ({
  ...(await importOriginal()),
  extractEmbeddedSubtitles: vi.fn().mockResolvedValue([]),
}));

vi.mock('socket.io-client', () => {
  const socketMock = {
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    id: 'test-socket-id',
    data: {}
  };
  return {
    io: vi.fn(() => socketMock)
  };
});

describe('App Component', () => {
  async function enterSite() {
    const passInput = await screen.findByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    await screen.findByPlaceholderText(/örn. Mustafa/i);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => ({
      ok: true,
      json: async () => url.endsWith('/auth/status')
        ? { required: true, authenticated: Boolean(options.headers?.Authorization) }
        : { ok: true, token: 'test-token' },
    })));
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.unstubAllGlobals());

  test('renders lobby initially with disabled buttons', async () => {
    render(<App />);

    await enterSite();

    expect(screen.getByText(/SYNC/i)).toBeInTheDocument();
    expect(screen.getByText(/CİNEMA/i)).toBeInTheDocument();
    
    const createBtn = screen.getByText(/Oda Oluştur/i);
    const joinBtn = screen.getByText(/Odaya Katıl/i);
    
    expect(createBtn).toBeDisabled();
    expect(joinBtn).toBeDisabled();
  });

  test('socket connection waits for server authentication', async () => {
    const { io } = await import('socket.io-client');
    render(<App />);
    await screen.findByPlaceholderText(/Şifreyi giriniz/i);
    expect(io).not.toHaveBeenCalled();
    await enterSite();
    await waitFor(() => expect(io).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      auth: { siteToken: 'test-token' },
    })));
  });

  test('site without a configured password opens directly', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ required: false, authenticated: true }),
    });
    render(<App />);
    await screen.findByPlaceholderText(/örn. Mustafa/i);
    expect(screen.queryByPlaceholderText(/Şifreyi giriniz/i)).not.toBeInTheDocument();
  });

  test('protected room reconnects with its tab-scoped password after reload', async () => {
    const { io } = await import('socket.io-client');
    localStorage.setItem('synccinema_auth_token', 'test-token');
    localStorage.setItem('synccinema_session', JSON.stringify({ roomName: '12345', myName: 'TestUser' }));
    sessionStorage.setItem('synccinema_room_password:12345', 'room-secret');
    render(<App />);
    await waitFor(() => expect(io).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      auth: { siteToken: 'test-token' },
    })));
    const socket = io();
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => connectHandler());
    expect(socket.emit).toHaveBeenCalledWith('join_room', {
      roomName: '12345', userName: 'TestUser', roomPassword: 'room-secret',
    });
  });

  test('enables create room button when name is entered', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    await enterSite();
    
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => {
      connectHandler();
    });
        
    const nameInput = screen.getByPlaceholderText(/örn. Mustafa/i);
    await userEvent.type(nameInput, 'TestUser');
    
    const createBtn = screen.getByText(/Oda Oluştur/i);
    expect(createBtn).not.toBeDisabled();
    
    await userEvent.click(createBtn);
    
    expect(socket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      userName: 'TestUser'
    }));

    const roomStatusHandler = socket.on.mock.calls.find(call => call[0] === 'room_status')[1];
    act(() => {
      roomStatusHandler({
        userCount: 1,
        users: [{ socketId: 'me', userName: 'TestUser' }],
        isAdmin: true
      });
    });
    
    expect(screen.getByText(/ODA KODU/i)).toBeInTheDocument();
  });

  test('voice chat button is enabled only when video is selected and another user is present', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    await enterSite();
    
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => connectHandler());
    
    const nameInput = screen.getByPlaceholderText(/örn. Mustafa/i);
    await userEvent.type(nameInput, 'TestUser');
    const createBtn = screen.getByText(/Oda Oluştur/i);
    await userEvent.click(createBtn);

    const roomStatusHandler = socket.on.mock.calls.find(call => call[0] === 'room_status')[1];
    act(() => {
      roomStatusHandler({
        userCount: 1,
        users: [{ socketId: 'me', userName: 'TestUser' }],
        isAdmin: true
      });
    });

    const voiceBtn = screen.getByText(/Sesi Aç/i);
    expect(voiceBtn).toBeDisabled();

    act(() => {
      roomStatusHandler({
        userCount: 2,
        users: [
          { socketId: 'me', userName: 'TestUser' },
          { socketId: 'other', userName: 'Friend' }
        ],
        isAdmin: true
      });
    });

    expect(voiceBtn).not.toBeDisabled();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['dummy content'], 'movie.mp4', { type: 'video/mp4' });
    await userEvent.upload(fileInput, file);

    expect(voiceBtn).not.toBeDisabled();
  });

  test('large videos play without starting embedded subtitle extraction', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    render(<App />);
    await enterSite();
    act(() => socket.on.mock.calls.find(call => call[0] === 'connect')[1]());
    await userEvent.type(screen.getByPlaceholderText(/örn. Mustafa/i), 'TestUser');
    await userEvent.click(screen.getByText(/Oda Oluştur/i));
    act(() => socket.on.mock.calls.find(call => call[0] === 'room_status')[1]({
      userCount: 1,
      users: [{ socketId: 'me', userName: 'TestUser' }],
      isAdmin: true,
    }));
    const file = new File(['video'], 'large.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 300 * 1024 * 1024 });
    await userEvent.upload(document.querySelector('input[type="file"]'), file);
    expect(screen.getByText(/gömülü altyazı çıkarma atlandı/i)).toBeInTheDocument();
    expect(document.querySelector('.video-pane video').getAttribute('src')).toBe('blob:mock');
    expect(extractEmbeddedSubtitles).not.toHaveBeenCalled();
  });

  test('lobby shows room password field', async () => {
    render(<App />);

    await enterSite();

    expect(screen.getByPlaceholderText(/Şifre belirle veya boş bırak/i)).toBeInTheDocument();
  });

  test('share button appears after joining room', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    await enterSite();
    
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => connectHandler());
        
    const nameInput = screen.getByPlaceholderText(/örn. Mustafa/i);
    await userEvent.type(nameInput, 'TestUser');
    
    await userEvent.click(screen.getByText(/Oda Oluştur/i));

    const roomStatusHandler = socket.on.mock.calls.find(call => call[0] === 'room_status')[1];
    act(() => {
      roomStatusHandler({
        userCount: 1,
        users: [{ socketId: 'me', userName: 'TestUser' }],
        isAdmin: true
      });
    });
    
    expect(screen.getByText(/Paylaş/i)).toBeInTheDocument();
  });

  test('keyboard shortcut modal opens with ? key', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    await enterSite();
    
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => connectHandler());
        
    const nameInput = screen.getByPlaceholderText(/örn. Mustafa/i);
    await userEvent.type(nameInput, 'TestUser');
    
    await userEvent.click(screen.getByText(/Oda Oluştur/i));

    const roomStatusHandler = socket.on.mock.calls.find(call => call[0] === 'room_status')[1];
    act(() => {
      roomStatusHandler({
        userCount: 1,
        users: [{ socketId: 'me', userName: 'TestUser' }],
        isAdmin: true
      });
    });
    
    await userEvent.keyboard('?');
    
    expect(screen.getByText(/Klavye Kısayolları/i)).toBeInTheDocument();
    expect(screen.getByText(/Space/)).toBeInTheDocument();
    expect(screen.getByText(/Oynat \/ Duraklat/)).toBeInTheDocument();
  });
});
