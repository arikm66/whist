import React from 'react';
import './FinishedUI.css';

export default function FinishedUI({ game }) {
  return (
    <div className="finished-container">
      <h2 className="finished-title">Game Finished!</h2>
      <h3 className="finished-scores-title">Final Scores:</h3>
      {game.scores.sort((a, b) => b.score - a.score).map((score, idx) => (
        <div key={idx} className="finished-score-row">
          Player {score.position + 1}: {score.score} points
        </div>
      ))}
    </div>
  );
}
