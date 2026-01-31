import React from 'react';
import './GameRoomUI.css';

export default function FrishUI({
  game,
  myPlayer,
  frishCounts = [],
  renderCard,
  handleReadyForFrish,
  handleSelectFrishCard
}) {
  // Determine number of selected frish cards
  const selectedCount = Array.isArray(myPlayer?.frishCards) ? myPlayer.frishCards.length : 0;
  const frishButtonEnabled = selectedCount === 3 && !myPlayer?.readyForFrish;
  const canSelectFrish = !myPlayer?.readyForFrish;
  return (
    <div className="frish-container">
      <h3>Frish Phase</h3>
      <p>All players passed in the auction. The round will be restarted after cards are frished.</p>
      <div className="frish-status">
        <strong>Frish Status:</strong>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {game.players.map((player, idx) => {
            const isMe = myPlayer && player.userId === myPlayer.userId;
            const countObj = frishCounts.find(fc => fc.userId === player.userId);
            const frishCount = countObj ? countObj.count : (Array.isArray(player.frishCards) ? player.frishCards.length : 0);
            return (
              <li key={player.userId || idx} style={{ marginBottom: '8px' }}>
                Player {idx + 1}{isMe ? ' (You)' : ''}
                : {frishCount}/3 selected
                {' '}| {player.readyForFrish ? (
                  <span style={{ color: 'green', fontWeight: 'bold' }}>Ready</span>
                ) : 'Not Ready'}
              </li>
            );
          })}
        </ul>
        <div>Ready for Frish: {game.readyForFrishCount || 0} / 4</div>
      </div>
      {/* My Hand */}
      {myPlayer && (
        <div>
          <h3>Your Hand</h3>
          <div className="frish-hand">
            {myPlayer.hand.map((card) => {
              const isFrishSelected = Array.isArray(myPlayer.frishCards) && myPlayer.frishCards.some(f => f.card === card);
              return renderCard(
                card,
                canSelectFrish ? () => handleSelectFrishCard(card) : undefined,
                canSelectFrish,
                isFrishSelected
              );
            })}
          </div>
        </div>
      )}
      <button
        className="frish-button"
        disabled={!frishButtonEnabled}
        onClick={handleReadyForFrish}
        style={{ opacity: frishButtonEnabled ? 1 : 0.7 }}
      >
        Frish
      </button>
    </div>
  );
}
