import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';

export default function GameRoom() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [trickWinner, setTrickWinner] = useState(null);
  const [isWaitingForNextTrick, setIsWaitingForNextTrick] = useState(false);
  const [auctionBid, setAuctionBid] = useState({ quantity: '', suit: 'C' });
  const [auctionTimeRemaining, setAuctionTimeRemaining] = useState(30);
  const [bidValue, setBidValue] = useState('');
  const [bidTimer, setBidTimer] = useState(null);
  const [bidTimeRemaining, setBidTimeRemaining] = useState(30);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    socket.connect();

    // Rejoin room on mount
    socket.emit('joinRoom', { 
      roomCode, 
      userId: user._id || user.id, 
      email: user.email 
    });

    socket.on('roomJoined', ({ game }) => {
      setGame(game);
      findMyPosition(game);
    });

    socket.on('playerJoined', ({ game }) => {
      setGame(game);
      findMyPosition(game);
    });

    socket.on('gameStarted', ({ game }) => {
      setGame(game);
      findMyPosition(game);
    });

    socket.on('auctionBidPlaced', ({ position, bid, game }) => {
      setGame(game);
    });

    socket.on('auctionPassed', ({ position, game }) => {
      setGame(game);
    });

    socket.on('auctionNextBidder', ({ game }) => {
      setGame(game);
      setAuctionBid({ quantity: '', suit: 'C' });
      setAuctionTimeRemaining(30);
    });

    socket.on('auctionComplete', ({ game }) => {
      setGame(game);
      setAuctionBid({ quantity: '', suit: 'C' });
    });

    socket.on('auctionRestarted', ({ game }) => {
      setGame(game);
      setAuctionBid({ quantity: '', suit: 'C' });
      setAuctionTimeRemaining(30);
    });

    socket.on('bidPlaced', ({ position, bid, game }) => {
      setGame(game);
    });

    socket.on('nextBidder', ({ game }) => {
      setGame(game);
      setBidValue('');
      setBidTimeRemaining(30);
    });

    socket.on('biddingComplete', ({ game }) => {
      setGame(game);
      setBidValue('');
    });

    socket.on('cardPlayed', ({ game }) => {
      setGame(game);
      setSelectedCard(null);
    });

    socket.on('trickComplete', ({ trick, winner, game }) => {
      setGame(game);
      setTrickWinner(winner);
      setIsWaitingForNextTrick(true);
      setTimeout(() => {
        setTrickWinner(null);
        setIsWaitingForNextTrick(false);
      }, 2500);
    });

    socket.on('nextTrick', ({ game }) => {
      setGame(game);
    });

    socket.on('newRound', ({ game }) => {
      setGame(game);
      findMyPosition(game);
    });

    socket.on('gameFinished', ({ game }) => {
      setGame(game);
    });

    socket.on('error', ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off('roomJoined');
      socket.off('playerJoined');
      socket.off('gameStarted');
      socket.off('auctionBidPlaced');
      socket.off('auctionPassed');
      socket.off('auctionNextBidder');
      socket.off('auctionComplete');
      socket.off('auctionRestarted');
      socket.off('bidPlaced');
      socket.off('nextBidder');
      socket.off('biddingComplete');
      socket.off('cardPlayed');
      socket.off('trickComplete');
      socket.off('nextTrick');
      socket.off('newRound');
      socket.off('gameFinished');
      socket.off('error');
    };
  }, [roomCode, user, navigate]);

  const findMyPosition = (gameData) => {
    const player = gameData.players.find(p => 
      p.userId.toString() === (user._id || user.id).toString()
    );
    if (player) {
      setMyPosition(player.position);
    }
  };

  const handlePlayCard = (card) => {
    if (!game || game.status !== 'playing') return;
    if (Number(myPosition) !== Number(game.currentTurn)) return;
    if (isWaitingForNextTrick) return; // Block playing during transition
    
    setSelectedCard(card);
    socket.emit('playCard', { 
      roomCode, 
      userId: user._id || user.id, 
      card 
    });
  };

  const handlePlaceBid = () => {
    if (!bidValue || Number(bidValue) < 0) {
      alert('Please enter a valid bid');
      return;
    }
    socket.emit('placeBid', { 
      roomCode, 
      userId: user._id || user.id, 
      bid: Number(bidValue) 
    });
  };

  const handleSelectBid = (value) => {
    if (typeof value !== 'number') return;
    setBidValue(String(value));
    socket.emit('placeBid', {
      roomCode,
      userId: user._id || user.id,
      bid: value
    });
  };

  const handlePlaceAuctionBid = () => {
    if (!auctionBid.quantity || auctionBid.quantity === '') {
      alert('Please select a quantity');
      return;
    }
    socket.emit('placeAuctionBid', {
      roomCode,
      userId: user._id || user.id,
      quantity: parseInt(auctionBid.quantity),
      suit: auctionBid.suit
    });
  };

  const handlePassAuction = () => {
    socket.emit('passAuction', {
      roomCode,
      userId: user._id || user.id
    });
  };

  // Timer for auction phase
  useEffect(() => {
    if (game && game.status === 'auction' && Number(myPosition) === Number(game.auctionCurrentBidder)) {
      const timer = setInterval(() => {
        setAuctionTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [game, myPosition]);

  // Timer for bidding phase
  useEffect(() => {
    if (game && game.status === 'bidding' && Number(myPosition) === Number(game.currentBidder)) {
      const timer = setInterval(() => {
        setBidTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [game, myPosition]);

  const getSuitSymbol = (suit) => {
    const symbols = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
    return symbols[suit] || suit;
  };

  const getSuitColor = (suit) => {
    return (suit === 'H' || suit === 'D') ? '#e74c3c' : '#2c3e50';
  };

  const renderCard = (card, onClick, isPlayable = true) => {
    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    
    return (
      <div
        key={card}
        onClick={() => isPlayable && onClick && onClick(card)}
        style={{
          width: '60px',
          height: '90px',
          border: '2px solid #333',
          borderRadius: '8px',
          backgroundColor: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isPlayable && onClick ? 'pointer' : 'default',
          boxShadow: selectedCard === card ? '0 0 10px #4CAF50' : '0 2px 4px rgba(0,0,0,0.2)',
          transition: 'all 0.2s',
          opacity: !isPlayable ? 0.6 : 1,
          color: getSuitColor(suit),
          fontWeight: 'bold'
        }}
      >
        <div style={{ fontSize: '20px' }}>{rank}</div>
        <div style={{ fontSize: '24px' }}>{getSuitSymbol(suit)}</div>
      </div>
    );
  };

  if (!game) {
    return <div style={{ padding: '2rem' }}>Loading...</div>;
  }

  const myPlayer = game.players.find(p => p.position === myPosition);
  const isMyTurn = Number(game.currentTurn) === Number(myPosition);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h2>Room: {roomCode}</h2>
          <div>Status: {game.status}</div>
          {game.status === 'playing' && (
            <>
              <div>Round: {game.round}</div>
              <div>Trump: {game.trumpSuit && getSuitSymbol(game.trumpSuit)}</div>
              <div style={{ color: isMyTurn ? '#4CAF50' : '#666', fontWeight: 'bold' }}>
                {isMyTurn ? '🔔 Your Turn!' : `Player ${game.currentTurn + 1}'s Turn`}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => {
            let msg = 'You are about to leave the room.';
            if (game.status === 'waiting') {
              msg += '\nOther players can still join and the game can start later.';
            } else {
              msg += '\nLeaving during an active game will close the room for everyone.';
            }
            setLeaveMsg(msg + '\nAre you sure you want to leave?');
            setShowLeaveModal(true);
          }}
          style={{ padding: '8px 16px', height: 'fit-content' }}
        >
          Leave Room
        </button>

        {showLeaveModal && (
          <Modal
            title="Leave Whist Room?"
            message={leaveMsg}
            onConfirm={() => {
              socket.emit('leaveRoom', {
                roomCode,
                userId: user._id || user.id
              });
              setShowLeaveModal(false);
              navigate('/lobby');
            }}
            onCancel={() => setShowLeaveModal(false)}
          />
        )}
      </div>

      {game.status === 'waiting' && (
        <div style={{ 
          padding: '2rem', 
          backgroundColor: '#f0f0f0', 
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3>Waiting for players...</h3>
          <p>{game.players.length}/4 players joined</p>
          <div style={{ marginTop: '1rem' }}>
            {game.players.map((player, idx) => (
              <div key={idx}>✓ {player.email}</div>
            ))}
          </div>
        </div>
      )}

      {game.status === 'auction' && (
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
      )}

      {game.status === 'bidding' && (
        <div style={{ 
          padding: '2rem', 
          backgroundColor: '#e3f2fd', 
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3>Bidding Phase</h3>
          <p>Trump: {getSuitSymbol(game.trumpSuit)}</p>
          
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
      )}

      {game.status === 'playing' && (
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
      )}

      {game.status === 'finished' && (
        <div style={{ 
          padding: '2rem', 
          backgroundColor: '#fff3cd', 
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h2>Game Finished!</h2>
          <h3>Final Scores:</h3>
          {game.scores.sort((a, b) => b.score - a.score).map((score, idx) => (
            <div key={idx} style={{ fontSize: '18px', margin: '0.5rem' }}>
              Player {score.position + 1}: {score.score} points
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
