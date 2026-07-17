import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from './App';

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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
  });

  test('renders lobby initially with disabled buttons', async () => {
    render(<App />);

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));

    expect(screen.getByText(/SYNC/i)).toBeInTheDocument();
    expect(screen.getByText(/CİNEMA/i)).toBeInTheDocument();
    
    const createBtn = screen.getByText(/Oda Oluştur/i);
    const joinBtn = screen.getByText(/Odaya Katıl/i);
    
    expect(createBtn).toBeDisabled();
    expect(joinBtn).toBeDisabled();
  });

  test('enables create room button when name is entered', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    
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

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    
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

  test('lobby shows room password field', async () => {
    render(<App />);

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));

    expect(screen.getByPlaceholderText(/Şifre belirle veya boş bırak/i)).toBeInTheDocument();
  });

  test('share button appears after joining room', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    
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

    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    
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
