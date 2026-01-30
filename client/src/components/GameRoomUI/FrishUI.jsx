import React from 'react';
import './GameRoomUI.css';

export default function FrishUI({
  game,
  myPlayer,
  renderCard,
  handleReadyForFrish,
  handleSelectFrishCard
}) {
  // Determine number of selected frish cards
  const selectedCount = Array.isArray(myPlayer?.frish) ? myPlayer.frish.length : 0;
  const frishButtonEnabled = selectedCount === 3 && !myPlayer?.readyForFrish;
  const canSelectFrish = !myPlayer?.readyForFrish;
  return (
    <div className="frish-container">
      <h3>Frish Phase</h3>
      <p>All players passed in the auction. The hand is dead and the round will be restarted.</p>
      <div className="frish-status">
        <strong>Game Status:</strong>
        <div>Dealer: Player {typeof game.dealer === 'number' ? game.dealer + 1 : '?'}</div>
        <div>Round: {game.round}</div>
        <div>Ready for Frish: {game.readyForFrishCount || 0} / 4</div>
      </div>
      {/* My Hand */}
      {myPlayer && (
        <div>
          <h3>Your Hand</h3>
          <div className="frish-hand">
            {myPlayer.hand.map((card, idx) => {
              const isFrishSelected = Array.isArray(myPlayer.frish) && myPlayer.frish.some(f => f.card === card && f.place === idx);
              return renderCard(
                card,
                canSelectFrish ? () => handleSelectFrishCard(idx, card) : undefined,
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
