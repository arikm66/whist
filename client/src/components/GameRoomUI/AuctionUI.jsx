import React from 'react';
import './AuctionUI.css';

export default function AuctionUI({
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
    <div className="auction-container">
      <h3>Auction Phase</h3>
      <p>Players bid on quantity + suit to determine trump</p>
      {/* Auction History */}
      <div className="auction-history">
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
                <span className="pass">Pass</span>
              ) : (
                <span className="waiting">Waiting...</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Current Bidder */}
      <div className={`auction-current-bidder ${Number(game.auctionCurrentBidder) === Number(myPosition) ? 'my-turn' : 'other-turn'}`}>
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
                <div className="auction-quantity-grid">
                  {Array.from(
                    { length: game.players[0].hand.length - Math.max(1, game.players[0].hand.length - 8) + 1 },
                    (_, i) => Math.max(1, game.players[0].hand.length - 8) + i
                  ).map((num) => {
                    const isSelected = Number(auctionBid.quantity) === num;
                    return (
                      <button
                        key={num}
                        onClick={() => setAuctionBid({ ...auctionBid, quantity: String(num) })}
                        className={`auction-quantity-btn${isSelected ? ' selected' : ''}`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
                <label>
                  <strong>Select Suit:</strong>
                  <select
                    className="auction-select-suit"
                    value={auctionBid.suit}
                    onChange={(e) => setAuctionBid({ ...auctionBid, suit: e.target.value })}
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
                  className="auction-action-btn place"
                  onClick={handlePlaceAuctionBid}
                >
                  Place Bid
                </button>
                <button
                  className="auction-action-btn pass"
                  onClick={handlePassAuction}
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
          <div className="auction-hand">
            {myPlayer.hand.map(card => 
              renderCard(card, null, false)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
