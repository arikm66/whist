import React from 'react';

export default function GameRoomAuctionUI({
  game,
  myPlayer,
  myPosition,
  auctionBid,
  setAuctionBid,
  auctionTimeRemaining,
  handlePlaceAuctionBid,
  handlePassAuction,
  renderCard,
  getSuitSymbol
}) {
  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#fff8e1', 
      borderRadius: '8px',
      marginBottom: '2rem'
    }}>
      <h3>Auction Phase</h3>
      <p>Players bid on quantity + suit to determine trump</p>
      {/* Auction History */}
      <div style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '1rem', borderRadius: '4px' }}>
        <strong>Auction History:</strong>
        {[0, 1, 2, 3].map((pos) => {
          const bid = game.auctionBids && game.auctionBids.filter(b => b.position === pos).pop();
          const hasPassed = game.auctionPassed && game.auctionPassed.includes(pos);
          return (
            <div key={pos} style={{ marginTop: '0.5rem' }}>
              Player {pos + 1} {pos === myPosition && '(You)'}:{' '}
              {bid ? (
                <span>{bid.quantity} {getSuitSymbol(bid.suit)}</span>
              ) : hasPassed ? (
                <span style={{ color: '#666' }}>Pass</span>
              ) : (
                <span style={{ color: '#999' }}>Waiting...</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Current Bidder */}
      <div style={{ 
        padding: '1rem', 
        backgroundColor: Number(game.auctionCurrentBidder) === Number(myPosition) ? '#fff3cd' : '#f5f5f5',
        borderRadius: '4px',
        marginBottom: '1rem'
      }}>
        {Number(game.auctionCurrentBidder) === Number(myPosition) && !game.auctionPassed.includes(myPosition) ? (
          <>
            {game.auctionFinalRaise ? (
              <h4>🔔 Final Chance to Raise Your Bid or Pass!</h4>
            ) : (
              <h4>🔔 Your Turn to Bid or Pass!</h4>
            )}
            <p style={{ color: '#d32f2f', fontWeight: 'bold' }}>Time remaining: {auctionTimeRemaining}s</p>
            <div style={{ marginTop: '1rem' }}>
              <p>Min Quantity: {Math.max(1, game.players[0].hand.length - 8)}, Max: {game.players[0].hand.length}</p>
              {game.auctionHighestBid && (
                <p>Current highest: {game.auctionHighestBid.quantity} {getSuitSymbol(game.auctionHighestBid.suit)}</p>
              )}
              {game.auctionFinalRaise && (
                <p style={{ color: '#d32f2f' }}>Other players have passed. This is your final chance to raise!</p>
              )}
              <div style={{ marginTop: '1rem' }}>
                <p><strong>Select Quantity:</strong></p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 60px)',
                    gap: '10px',
                    marginBottom: '1rem'
                  }}
                >
                  {Array.from(
                    { length: game.players[0].hand.length - Math.max(1, game.players[0].hand.length - 8) + 1 },
                    (_, i) => Math.max(1, game.players[0].hand.length - 8) + i
                  ).map((num) => {
                    const isSelected = Number(auctionBid.quantity) === num;
                    return (
                      <button
                        key={num}
                        onClick={() => setAuctionBid({ ...auctionBid, quantity: String(num) })}
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #1976D2' : '2px solid #ccc',
                          backgroundColor: isSelected ? '#BBDEFB' : 'white',
                          color: '#333',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
                <label>
                  <strong>Select Suit:</strong>
                  <select
                    value={auctionBid.suit}
                    onChange={(e) => setAuctionBid({ ...auctionBid, suit: e.target.value })}
                    style={{ 
                      padding: '8px', 
                      marginLeft: '8px',
                      fontSize: '14px',
                      border: '2px solid #2196F3',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="C">Clubs ♣</option>
                    <option value="D">Diamonds ♦</option>
                    <option value="H">Hearts ♥</option>
                    <option value="S">Spades ♠</option>
                    <option value="NT">No-Trump</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick={handlePlaceAuctionBid}
                  style={{ 
                    padding: '8px 16px', 
                    backgroundColor: '#4CAF50', 
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginRight: '8px',
                    fontSize: '14px'
                  }}
                >
                  Place Bid
                </button>
                <button
                  onClick={handlePassAuction}
                  style={{ 
                    padding: '8px 16px', 
                    backgroundColor: '#f44336', 
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Pass
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <p>
              Waiting for <strong>Player {typeof game.auctionCurrentBidder === 'number' ? game.auctionCurrentBidder + 1 : 'Unknown'}</strong> in auction...
              {game.auctionPassed.includes(game.auctionCurrentBidder) && ' (has passed)'}
            </p>
          </div>
        )}
      </div>
      {/* Show hand during auction */}
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
