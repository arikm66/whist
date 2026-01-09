import React, { useState } from 'react';
import { api } from '../services/api';

export default function NewItem({ onCreated }) {
  const [content, setContent] = useState('');
  const token = localStorage.getItem('token');
  const submit = async e => {
    e.preventDefault();
    const created = await api.post('items', { content }, token);
    onCreated && onCreated(created);
    setContent('');
  };
  return (
    <form onSubmit={submit}>
      <input value={content} onChange={e=>setContent(e.target.value)} />
      <button type="submit">Add</button>
    </form>
  );
}