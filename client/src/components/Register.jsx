import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', { email, password });
      const token = res.data?.token;
      const user = res.data?.user;
      if (token) {
        login(token, user);
        navigate('/');
      } else {
        alert(res.data?.msg || 'Registration failed');
      }
    } catch (err) {
      alert(err.response?.data?.msg || 'Registration error');
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">Register</button>
    </form>
  );
}