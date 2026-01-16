import React from 'react';

export default function Modal({ title, message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: 8,
        padding: 24,
        minWidth: 320,
        boxShadow: '0 2px 16px rgba(0,0,0,0.2)'
      }}>
        <h2 style={{marginTop:0}}>{title}</h2>
        <div style={{whiteSpace:'pre-line',marginBottom:24}}>{message}</div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={onCancel} style={{padding:'8px 16px',background:'#eee',border:'none',borderRadius:4}}>Cancel</button>
          <button onClick={onConfirm} style={{padding:'8px 16px',background:'#2196F3',color:'white',border:'none',borderRadius:4}}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}