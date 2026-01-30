import React from 'react';
import './GameRoomUI.css';

export default function WaitingUI({ game }) {
  return (
    <div className="waiting-container">
      <h3 className="waiting-title">Waiting for players...</h3>
      <p className="waiting-players-count">{game.players.length}/4 players joined</p>
      <div className="waiting-players-list">
        {game.players.map((player, idx) => (
          <div key={idx} className="waiting-player-row">✓ {player.email}</div>
        ))}
      </div>
    </div>
  );
}
