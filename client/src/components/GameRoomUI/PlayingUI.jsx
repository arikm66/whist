import React from 'react';
import './PlayingUI.css';

export default function PlayingUI({
  game,
  myPlayer,
  myPosition,
  trickWinner,
  renderCard,
  handlePlayCard,
  isMyTurn,
  isWaitingForNextTrick
}) {
  return (
    <>
      {/* Scores */}
      <div className="playing-scores">
        {game.players.map((player, idx) => (
          <div
            key={idx}
            className={`playing-score-player${trickWinner === idx ? ' winner' : ''}`}
          >
            <strong>
              Player {idx + 1} {idx === myPosition && '(You)'}
            </strong>
            <div className={`playing-score-bid${trickWinner === idx ? ' winner' : ''}`}>
              Bid: {game.bids[idx]} | Tricks: {player.tricksWon} {trickWinner === idx && '🎉'}
            </div>
            <div>Score: {game.scores.find(s => s.position === idx)?.score || 0}</div>
          </div>
        ))}
      </div>
      {/* Current Trick */}
      <div className="playing-current-trick">
        <h3>Current Trick</h3>
        <div className="playing-current-trick-cards">
          {game.currentTrick.length > 0 ? (
            game.currentTrick.map((play, idx) => (
              <div key={idx} className="playing-current-trick-player">
                <div className="playing-current-trick-player-label">
                  Player {play.position + 1}
                </div>
                {renderCard(play.card, null, false)}
              </div>
            ))
          ) : (
            <div className="playing-current-trick-waiting">
              Waiting for first card...
            </div>
          )}
        </div>
      </div>
      {/* My Hand */}
      {myPlayer && (
        <div>
          <h3>Your Hand</h3>
          <div className="playing-hand">
            {myPlayer.hand.map(card =>
              renderCard(card, handlePlayCard, isMyTurn && !isWaitingForNextTrick)
            )}
          </div>
        </div>
      )}
    </>
  );
}
