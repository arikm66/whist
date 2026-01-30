import React from 'react';
import './GameRoomUI.css';

export default function BiddingUI({
  game,
  myPlayer,
  myPosition,
  bidValue,
  bidTimeRemaining,
  handleSelectBid,
  renderCard
}) {
  return (
    <div className="bidding-container">
      <h3>Bidding Phase</h3>
      <p>Trump: {(!game.trumpSuit || game.trumpSuit === 'NT') ? 'NT' : (game.trumpSuit)}</p>
      {/* Bid History */}
      <div className="bidding-history">
        <strong>Bids Placed:</strong>
        {game.bids.map((bid, idx) => (
          <div key={idx} style={{ marginTop: '0.5rem' }}>
            Player {idx + 1} {idx === myPosition && '(You)'}: {bid !== null ? bid : 'Waiting...'}
            {bid !== null && game.bids[idx] !== null && (
              <span className="bid-check">✓</span>
            )}
          </div>
        ))}
      </div>
      {/* Current Bidder */}
      <div className={`bidding-current-bidder ${Number(game.currentBidder) === Number(myPosition) ? 'my-turn' : 'other-turn'}`}>
        {Number(game.currentBidder) === Number(myPosition) ? (
          <>
            <h4>🔔 Your Turn to Bid!</h4>
            <p style={{ color: '#d32f2f', fontWeight: 'bold' }}>Time remaining: {bidTimeRemaining}s</p>
            <div style={{ marginTop: '1rem' }}>
              {(() => {
                const tricksAvailable = (game.players && game.players[myPosition]) ? game.players[myPosition].hand.length : (game.players && game.players[0] ? game.players[0].hand.length : 0);
                const lastBidderPos = (game.auctionWinner + 3) % 4;
                const isLastBidder = Number(myPosition) === Number(lastBidderPos);
                const sumPrev = game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0);
                const forbidden = isLastBidder ? (tricksAvailable - sumPrev) : null;
                const numbers = Array.from({ length: tricksAvailable + 1 }, (_, i) => i);
                return (
                  <>
                    <p>Choose your bid (0–{tricksAvailable})</p>
                    {isLastBidder && (
                      <p style={{ color: '#d32f2f' }}>
                        You cannot bid {forbidden} (would equal total {tricksAvailable}).
                      </p>
                    )}
                    <div className="bidding-quantity-grid">
                      {numbers.map((num) => {
                        const isDisabled = isLastBidder && num === forbidden;
                        const isSelected = String(num) === String(bidValue);
                        return (
                          <button
                            key={num}
                            onClick={() => !isDisabled && handleSelectBid(num)}
                            disabled={isDisabled}
                            className={`bidding-quantity-btn${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <div>
            <p>Waiting for <strong>Player {typeof game.currentBidder === 'number' ? game.currentBidder + 1 : 'Unknown'}</strong> to place their bid...</p>
          </div>
        )}
      </div>
      {/* Show hand during bidding (non-interactive) */}
      {myPlayer && (
        <div>
          <h3>Your Hand</h3>
          <div className="bidding-hand">
            {myPlayer.hand.map(card => 
              renderCard(card, null, false)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
