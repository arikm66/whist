import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';

export default function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const { user, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    socket.connect();

    // Request room list
    socket.emit('getRooms');

    // Listen for room list updates
    socket.on('roomsList', ({ rooms }) => {
      setRooms(rooms);
    });

    socket.on('roomCreated', ({ roomCode, game }) => {
      navigate(`/game/${roomCode}`);
    });

    socket.on('roomJoined', ({ game }) => {
      navigate(`/game/${game.roomCode}`);
    });

    socket.on('error', ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off('roomsList');
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('error');
    };
  }, [token, navigate]);

  const handleCreateRoom = () => {
    if (!user) return;
    socket.emit('createRoom', { userId: user._id || user.id, email: user.email });
  };

  const handleJoinRoom = (code) => {
    if (!user) return;
    socket.emit('joinRoom', { roomCode: code, userId: user._id || user.id, email: user.email });
  };

  const handleJoinByCode = () => {
    if (!roomCode.trim()) {
      alert('Please enter a room code');
      return;
    }
    handleJoinRoom(roomCode.toUpperCase());
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Whist Card Game - Lobby</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <button 
          onClick={handleCreateRoom}
          style={{ 
            padding: '12px 24px', 
            fontSize: '16px', 
            backgroundColor: '#4CAF50', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
        >
          Create New Room
        </button>

        <input
          type="text"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="Enter room code"
          style={{ padding: '10px', marginRight: '8px', textTransform: 'uppercase' }}
          maxLength={6}
        />
        <button 
          onClick={handleJoinByCode}
          style={{ 
            padding: '10px 20px', 
            cursor: 'pointer',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Join Room
        </button>
      </div>

      <h2>Available Rooms</h2>
      {rooms.length === 0 ? (
        <p>No rooms available. Create one to start playing!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {rooms.map((room) => (
            <div 
              key={room.roomCode} 
              style={{ 
                border: '1px solid #ddd', 
                padding: '1rem', 
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <strong>Room Code: {room.roomCode}</strong>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Players: {room.players.length}/4
                </div>
              </div>
              <button 
                onClick={() => handleJoinRoom(room.roomCode)}
                disabled={room.players.length >= 4}
                style={{ 
                  padding: '8px 16px', 
                  cursor: room.players.length >= 4 ? 'not-allowed' : 'pointer',
                  backgroundColor: room.players.length >= 4 ? '#ccc' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                {room.players.length >= 4 ? 'Full' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
