import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import api from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

function Home() {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const res = await api.get('/items');
        setItems(res.data);
      } catch (err) {
        console.error('Error loading items:', err);
      }
    };
    load();
  }, [token]);

  const saveData = async () => {
    if (!inputValue) return;
    try {
      const res = await api.post('/items', { content: inputValue });
      setItems([...items, res.data]);
      setInputValue('');
    } catch (err) {
      console.error("Error saving data:", err);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Vite + React + Node</h1>
      <div style={{ marginBottom: '1rem' }}>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="New entry..."
          style={{ padding: '8px', marginRight: '8px' }}
        />
        <button onClick={saveData} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Save to DB
        </button>
      </div>
      <ul style={{ lineHeight: '2' }}>
        {items.map(item => <li key={item._id}>{item.content}</li>)}
      </ul>
    </div>
  );
}

function Navigation() {
  const { token, user, logout } = useAuth();

  return (
    <nav style={{ marginBottom: 12 }}>
      <Link to="/" style={{ marginRight: 8 }}>Home</Link>
      {!token && (
        <>
          <Link to="/login" style={{ marginRight: 8 }}>Login</Link>
          <Link to="/register">Register</Link>
        </>
      )}
      {token && (
        <>
          <Link to="/lobby" style={{ marginRight: 8 }}>Lobby</Link>
          <span style={{ marginRight: 12, color: '#555' }}>
            {user?.email || 'Signed in'}
          </span>
          <a onClick={logout} style={{ marginRight: 8, cursor: 'pointer' }}>
            Logout
          </a>
        </>
      )}
    </nav>
  );
}

function AppWrapper() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

function AppRoutes() {
  const { token } = useAuth();

  return (
    <div style={{ padding: 12 }}>
      <Navigation />
      <Routes>
        <Route path="/" element={token ? <Lobby /> : <Navigate to="/login" replace />} />
        <Route path="/lobby" element={token ? <Lobby /> : <Navigate to="/login" replace />} />
        <Route path="/game/:roomCode" element={token ? <GameRoom /> : <Navigate to="/login" replace />} />
        <Route path="/items" element={token ? <Home /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </div>
  );
}

export default AppWrapper;