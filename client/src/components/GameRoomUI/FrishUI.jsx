import React from 'react';

export default function GameRoomFrishUI({
  game,
  myPlayer,
  frishCardsSelected,
  renderCard,
  handleFrishSelected
}) {
  return (
    <div style={{ margin: '32px 0', background: '#f3e5f5', borderRadius: 12, padding: '2rem' }}>
      <h3>Frish Phase</h3>
      <p>All players passed in the auction. The hand is dead and the round will be restarted.</p>
      <div style={{ marginTop: 24, background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #ccc' }}>
        <strong>Game Status:</strong>
        <div>Dealer: Player {typeof game.dealer === 'number' ? game.dealer + 1 : '?'}</div>
        <div>Round: {game.round}</div>
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
              renderCard(card, frishCardsSelected ? null : () => {}, !frishCardsSelected)
            )}
          </div>
        </div>
      )}
      <button
        style={{
          marginTop: 32,
          padding: '12px 32px',
          fontSize: 18,
          borderRadius: 8,
          background: frishCardsSelected ? '#1976D2' : '#aaa',
          color: 'white',
          border: 'none',
          cursor: frishCardsSelected ? 'pointer' : 'not-allowed',
          opacity: frishCardsSelected ? 1 : 0.7
        }}
        disabled={!frishCardsSelected}
        onClick={handleFrishSelected}
      >
        Frish
      </button>
    </div>
  );
}
