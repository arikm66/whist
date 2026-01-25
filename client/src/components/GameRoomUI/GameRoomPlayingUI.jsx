import React from 'react';

export default function GameRoomPlayingUI({
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
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        backgroundColor: '#f9f9f9',
        padding: '1rem',
        borderRadius: '8px',
        alignItems: 'stretch'
      }}>
        {game.players.map((player, idx) => (
          <div 
            key={idx} 
            style={{ 
              flex: '1 1 0',
              minWidth: 0,
              backgroundColor: trickWinner === idx ? '#4CAF50' : 'transparent',
              color: trickWinner === idx ? 'white' : 'inherit',
              padding: '0.5rem',
              borderRadius: '4px',
              transition: 'background-color 0.3s ease, color 0.3s ease',
              minHeight: '80px',
              boxSizing: 'border-box'
            }}
          >
            <strong>
              Player {idx + 1} {idx === myPosition && '(You)'}
            </strong>
            <div style={{ 
              fontWeight: trickWinner === idx ? 'bold' : 'normal',
              transition: 'font-weight 0.3s ease'
            }}>
              Bid: {game.bids[idx]} | Tricks: {player.tricksWon} {trickWinner === idx && '🎉'}
            </div>
            <div>Score: {game.scores.find(s => s.position === idx)?.score || 0}</div>
          </div>
        ))}
      </div>
      {/* Current Trick */}
      <div style={{ 
        marginBottom: '2rem',
        padding: '2rem',
        backgroundColor: '#e8f5e9',
        borderRadius: '8px',
        minHeight: '180px'
      }}>
        <h3>Current Trick</h3>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {game.currentTrick.length > 0 ? (
            game.currentTrick.map((play, idx) => (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '0.5rem', fontSize: '12px' }}>
                  Player {play.position + 1}
                </div>
                {renderCard(play.card, null, false)}
              </div>
            ))
          ) : (
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              Waiting for first card...
            </div>
          )}
        </div>
      </div>
      {/* My Hand */}
      {myPlayer && (
        <div>
          <h3>Your Hand</h3>
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px'
          }}>
            {myPlayer.hand.map(card => 
              renderCard(card, handlePlayCard, isMyTurn && !isWaitingForNextTrick)
            )}
          </div>
        </div>
      )}
    </>
  );
}
