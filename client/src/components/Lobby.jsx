import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Lobby() {
  const [rooms, setRooms] = useState([]);
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const handleDeleteRoom = async (roomCode) => {
    if (!user || user.role !== 'Admin') return;
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    try {
      await api.delete(`/rooms/${roomCode}`);
      // Remove room from UI immediately
      setRooms((prev) => prev.filter((r) => r.roomCode !== roomCode));
    } catch (err) {
      alert('Failed to delete room');
    }
  };

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

    socket.on('gameStarted', ({ game }) => {
      navigate(`/game/${game.roomCode}`);
    });

    socket.on('error', ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off('roomsList');
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('gameStarted');
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${minutes}`;
  };

  return (
    <div style={{ padding: '1rem 2rem', maxWidth: '1400px', margin: '0 auto', width: 'calc(100% - 4rem)' }}>
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
            cursor: 'pointer'
          }}
        >
          Create New Room
        </button>

      </div>

      <h2>Available Rooms</h2>
      {rooms.length === 0 ? (
        <p>No rooms available. Create one to start playing!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {rooms
            .slice() // copy to avoid mutating state
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((room) => {
            const isFull = room.players.length >= 4;
            const userInRoom = room.players.some(p => (p.userId === user?._id || p.userId === user?.id) || p.email === user?.email);
            const canJoin = (room.status === 'waiting' && !isFull) || (userInRoom && room.status !== 'finished');
            const buttonText = userInRoom 
              ? (room.status === 'finished' ? 'Finished' : 'Rejoin')
              : (room.status === 'waiting' && !isFull ? 'Join' : (isFull ? 'Full' : 'Closed'));
            
            return (
              <div 
                key={room.roomCode} 
                onClick={() => canJoin && handleJoinRoom(room.roomCode)}
                style={{ 
                  border: '1px solid #ddd', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: canJoin ? '#f9fcff' : '#f5f5f5',
                  cursor: canJoin ? 'pointer' : 'not-allowed',
                  position: 'relative'
                }}
              >
                <div>
                  <strong>Room: {room.roomCode}</strong>
                  <div style={{ fontSize: '14px', color: '#555' }}>
                    Status: {room.status}
                  </div>
                  <div style={{ fontSize: '14px', color: '#555' }}>
                    Players: {room.players.length}/4
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    Created: {formatDate(room.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (canJoin) handleJoinRoom(room.roomCode); }}
                    disabled={!canJoin}
                    style={{ 
                      padding: '8px 16px', 
                      cursor: canJoin ? 'pointer' : 'not-allowed',
                      backgroundColor: canJoin ? '#2196F3' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      marginBottom: user?.role === 'Admin' ? '0.5rem' : 0
                    }}
                  >
                    {buttonText}
                  </button>
                  {user?.role === 'Admin' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteRoom(room.roomCode); }}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: '#e53935',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '14px',
                        marginTop: 0
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
