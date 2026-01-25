import React from 'react';

export default function GameRoomFrishUI({
  game,
  myPlayer,
  frishCardsSelected,
  renderCard,
  handleFrishSelected,
  handleSelectFrishCard
}) {
  // Determine number of selected frish cards
  const selectedCount = Array.isArray(myPlayer?.frish) ? myPlayer.frish.length : 0;
  const frishButtonEnabled = selectedCount === 3;
  return (
    <div style={{ margin: '32px 0', background: '#f3e5f5', borderRadius: 12, padding: '2rem', color: '#222' }}>
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
            {myPlayer.hand.map((card, idx) => {
              const isFrishSelected = Array.isArray(myPlayer.frish) && myPlayer.frish.some(f => f.card === card && f.place === idx);
              return renderCard(
                card,
                () => handleSelectFrishCard(idx, card),
                true,
                isFrishSelected
              );
            })}
          </div>
        </div>
      )}
      <button
        style={{
          marginTop: 32,
          padding: '12px 32px',
          fontSize: 18,
          borderRadius: 8,
          background: frishButtonEnabled ? '#1976D2' : '#aaa',
          color: 'white',
          border: 'none',
          cursor: frishButtonEnabled ? 'pointer' : 'not-allowed',
          opacity: frishButtonEnabled ? 1 : 0.7
        }}
        disabled={!frishButtonEnabled}
        onClick={handleFrishSelected}
      >
        Frish
      </button>
    </div>
  );
}
