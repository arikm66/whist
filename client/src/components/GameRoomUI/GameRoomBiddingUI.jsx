import React from 'react';

export default function GameRoomBiddingUI({
  game,
  myPlayer,
  myPosition,
  bidValue,
  bidTimeRemaining,
  handleSelectBid,
  renderCard
}) {
  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#e3f2fd', 
      borderRadius: '8px',
      marginBottom: '2rem'
    }}>
      <h3>Bidding Phase</h3>
      <p>Trump: {(!game.trumpSuit || game.trumpSuit === 'NT') ? 'NT' : (game.trumpSuit)}</p>
      {/* Bid History */}
      <div style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '1rem', borderRadius: '4px' }}>
        <strong>Bids Placed:</strong>
        {game.bids.map((bid, idx) => (
          <div key={idx} style={{ marginTop: '0.5rem' }}>
            Player {idx + 1} {idx === myPosition && '(You)'}: {bid !== null ? bid : 'Waiting...'}
            {bid !== null && game.bids[idx] !== null && (
              <span style={{ marginLeft: '1rem', color: '#4CAF50' }}>✓</span>
            )}
          </div>
        ))}
      </div>
      {/* Current Bidder */}
      <div style={{ 
        padding: '1rem', 
        backgroundColor: Number(game.currentBidder) === Number(myPosition) ? '#fff3cd' : '#f5f5f5',
        borderRadius: '4px',
        marginBottom: '1rem'
      }}>
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
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 60px)',
                        gap: '10px',
                        marginTop: '8px'
                      }}
                    >
                      {numbers.map((num) => {
                        const isDisabled = isLastBidder && num === forbidden;
                        const isSelected = String(num) === String(bidValue);
                        return (
                          <button
                            key={num}
                            onClick={() => !isDisabled && handleSelectBid(num)}
                            disabled={isDisabled}
                            style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '8px',
                              border: isSelected ? '2px solid #1976D2' : '2px solid #ccc',
                              backgroundColor: isDisabled ? '#eee' : (isSelected ? '#BBDEFB' : 'white'),
                              color: isDisabled ? '#999' : '#333',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              cursor: isDisabled ? 'not-allowed' : 'pointer'
                            }}
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
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px'
          }}>
            {myPlayer.hand.map(card => 
              renderCard(card, null, false)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
