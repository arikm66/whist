import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

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
    <div style={{ padding: 12, width: '100%', maxWidth: 'none' }}>
      <Navigation />
      <Routes>
        <Route path="/" element={token ? <Lobby /> : <Navigate to="/login" replace />} />
        <Route path="/lobby" element={token ? <Lobby /> : <Navigate to="/login" replace />} />
        <Route path="/game/:roomCode" element={token ? <GameRoom /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </div>
  );
}

export default AppWrapper;