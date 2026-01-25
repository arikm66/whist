import React from 'react';

export default function GameRoomFinishedUI({ game }) {
  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#fff3cd', 
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      <h2>Game Finished!</h2>
      <h3>Final Scores:</h3>
      {game.scores.sort((a, b) => b.score - a.score).map((score, idx) => (
        <div key={idx} style={{ fontSize: '18px', margin: '0.5rem' }}>
          Player {score.position + 1}: {score.score} points
        </div>
      ))}
    </div>
  );
}
