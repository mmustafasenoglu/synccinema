import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from './App';

// Mock socket.io-client
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
  });

  test('renders lobby initially with disabled buttons', async () => {
    render(<App />);

    // Şifre ekranını geç
    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));

    expect(screen.getByText(/Sync/i)).toBeInTheDocument();
    expect(screen.getByText(/Cinema/i)).toBeInTheDocument();
    
    const createBtn = screen.getByText(/Oda Oluştur/i);
    const joinBtn = screen.getByText(/Odaya Katıl/i);
    
    expect(createBtn).toBeDisabled();
    expect(joinBtn).toBeDisabled();
  });

  test('enables create room button when name is entered', async () => {
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    // Şifre ekranını geç
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
    
    // Click create room
    await userEvent.click(createBtn);
    
    // Should emit join_room
    expect(socket.emit).toHaveBeenCalledWith('join_room', expect.objectContaining({
      userName: 'TestUser'
    }));
    
    // Should transition to main layout
    expect(screen.getByText(/Oda Kodu:/i)).toBeInTheDocument();
  });

  test('voice chat button is enabled only when video is selected and another user is present', async () => {
    // Mock URL.createObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    
    const { io } = await import('socket.io-client');
    const socket = io();
    
    render(<App />);

    // Şifre ekranını geç
    const passInput = screen.getByPlaceholderText(/Şifreyi giriniz/i);
    await userEvent.type(passInput, '12345');
    await userEvent.click(screen.getByText(/Giriş Yap/i));
    
    // Connect
    const connectHandler = socket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => connectHandler());
    
    // Join room
    const nameInput = screen.getByPlaceholderText(/örn. Mustafa/i);
    await userEvent.type(nameInput, 'TestUser');
    const createBtn = screen.getByText(/Oda Oluştur/i);
    await userEvent.click(createBtn);

    // Initial state: Sesi Aç should be disabled
    const voiceBtn = screen.getByText(/Sesi Aç/i);
    expect(voiceBtn).toBeDisabled();

    // Another user joins (simulate room_status event)
    const roomStatusHandler = socket.on.mock.calls.find(call => call[0] === 'room_status')[1];
    act(() => {
      roomStatusHandler({
        userCount: 2,
        users: [
          { socketId: 'me', userName: 'TestUser' },
          { socketId: 'other', userName: 'Friend' }
        ]
      });
    });

    // Still disabled because no video is selected
    expect(voiceBtn).toBeDisabled();

    // A video is selected by the user
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['dummy content'], 'movie.mp4', { type: 'video/mp4' });
    await userEvent.upload(fileInput, file);

    // Now it should be enabled
    expect(voiceBtn).not.toBeDisabled();
    
    // Restore mock
    window.URL.createObjectURL.mockRestore?.();
  });
});
