import React from 'react';

export default function GameRoomWaitingUI({ game }) {
  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#f0f0f0', 
      borderRadius: '8px',
      marginBottom: '2rem'
    }}>
      <h3>Waiting for players...</h3>
      <p>{game.players.length}/4 players joined</p>
      <div style={{ marginTop: '1rem' }}>
        {game.players.map((player, idx) => (
          <div key={idx}>✓ {player.email}</div>
        ))}
      </div>
    </div>
  );
}
