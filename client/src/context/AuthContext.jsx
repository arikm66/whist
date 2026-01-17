import React, { createContext, useState, useEffect, useContext } from 'react';

import api from '../services/api';
import socket from '../services/socket';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      if (!user) {
        (async () => {
          try {
            const res = await api.get('/auth/me');
            const fetchedUser = res.data?.user;
            if (fetchedUser) {
              localStorage.setItem('user', JSON.stringify(fetchedUser));
              setUser(fetchedUser);
            }
          } catch (err) {
            logout();
          }
        })();
      }
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }, [token, user]);

  const login = (tokenValue, userObj) => {
    localStorage.setItem('token', tokenValue);
    if (userObj) {
      localStorage.setItem('user', JSON.stringify(userObj));
      socket.emit('login', {
        userId: userObj._id || userObj.id,
        email: userObj.email
      });
    }
    setToken(tokenValue);
    setUser(userObj || null);
  };

  const logout = () => {
    try {
      const userStr = localStorage.getItem('user');
      const userObj = userStr ? JSON.parse(userStr) : null;
      if (userObj) {
        socket.emit('logout', {
          userId: userObj._id || userObj.id,
          email: userObj.email
        });
      }
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);