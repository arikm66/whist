import React, { useState, useEffect } from 'react';
import WaitingUI from './GameRoomUI/WaitingUI';
import FinishedUI from './GameRoomUI/FinishedUI';
import PlayingUI from './GameRoomUI/PlayingUI';
import BiddingUI from './GameRoomUI/BiddingUI';
import AuctionUI from './GameRoomUI/AuctionUI';
import FrishUI from './GameRoomUI/FrishUI';
import RoundSummaryTable from './RoundSummaryTable';
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
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [roundSummaries, setRoundSummaries] = useState([]);
  const [auctionTimeRemaining, setAuctionTimeRemaining] = useState(30);
  const [bidValue, setBidValue] = useState('');
  const [bidTimer, setBidTimer] = useState(null);
  const [bidTimeRemaining, setBidTimeRemaining] = useState(30);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState('');
  const [frishCardsSelected, setFrishCardsSelected] = useState(false);

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

    socket.on('frishCardSelected', ({ userId, frish, game }) => {
      setGame(game);
      // Check if all frish cards have been selected
    });

    // Handle frish phase
    socket.on('frishStarted', ({ game }) => {
      setGame(game);
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

    socket.on('roundEnded', ({ roundSummary, game }) => {
      setGame(game);
      setShowRoundSummary(true);
      setRoundSummaries(prev => [...prev, roundSummary]);
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
        // Redirect to lobby if game is finished due to player leaving
        navigate('/lobby', { replace: true });
    });

    socket.on('error', ({ message }) => {
      alert(message);
    });

    // Listen for roomClosed event to send all players to lobby
    socket.on('roomClosed', ({ roomCode }) => {
      // Only navigate if the closed room is the one this component is showing (from useParams)
      const currentRoomCode = typeof roomCode === 'string' ? roomCode : String(roomCode);
      if (currentRoomCode === (typeof window !== 'undefined' && window.location.pathname.split('/').pop())) {
        navigate('/lobby', { replace: true });
      }
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
      socket.off('frishCardSelected');
      socket.off('frishStarted');
      socket.off('bidPlaced');
      socket.off('nextBidder');
      socket.off('biddingComplete');
      socket.off('cardPlayed');
      socket.off('trickComplete');
      socket.off('nextTrick');
      socket.off('newRound');
      socket.off('roundEnded');
      socket.off('gameFinished');
      socket.off('roomClosed');
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

  const handleSelectFrishCard = (place, card) => {
    socket.emit('selectFrishCard', {
      roomCode,
      userId: user._id || user.id,
      frish: { place, card }
    });
  };

  const handleFrishSelected = () => {
    // Placeholder for frish action
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

  const renderCard = (card, onClick, isPlayable = true, isFrishSelected = false) => {
    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    
    return (
      <div
        key={card}
        onClick={() => isPlayable && onClick && onClick(card)}
        style={{
          width: '60px',
          height: '90px',
          border: isFrishSelected ? '2px solid #2ecc40' : '2px solid #333',
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

  // ...existing code...

  const myPlayer = game.players.find(p => p.position === myPosition);
  const isMyTurn = Number(game.currentTurn) === Number(myPosition);

  if (showRoundSummary && roundSummaries.length > 0) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <RoundSummaryTable
          rounds={roundSummaries}
          players={game.players}
          myPosition={myPosition}
        />
        <button
          style={{ marginTop: 24, padding: '12px 32px', fontSize: 18, borderRadius: 8, background: '#1976D2', color: 'white', border: 'none' }}
          onClick={() => setShowRoundSummary(false)}
        >Continue</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h2>Room: {roomCode}</h2>
          <div>Status: {game.status}</div>
          {game.status === 'playing' && (
            <>
              <div>Round: {game.round}</div>
              <div>Trump: {(!game.trumpSuit || game.trumpSuit === 'NT') ? 'NT' : getSuitSymbol(game.trumpSuit)}</div>
              <div>
                Total Bids: {Array.isArray(game.bids) ? game.bids.reduce((sum, b) => sum + (typeof b === 'number' ? b : 0), 0) : 0}
              </div>
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
        <WaitingUI game={game} />
      )}

      {game.status === 'auction' && (
        <AuctionUI
          game={game}
          myPlayer={myPlayer}
          myPosition={myPosition}
          auctionBid={auctionBid}
          setAuctionBid={setAuctionBid}
          auctionTimeRemaining={auctionTimeRemaining}
          handlePlaceAuctionBid={handlePlaceAuctionBid}
          handlePassAuction={handlePassAuction}
          renderCard={renderCard}
          getSuitSymbol={getSuitSymbol}
        />
      )}

      {game.status === 'frish' && (
        <FrishUI
          game={game}
          myPlayer={myPlayer}
          frishCardsSelected={frishCardsSelected}
          renderCard={renderCard}
          handleFrishSelected={handleFrishSelected}
          handleSelectFrishCard={handleSelectFrishCard}
        />
      )}

      {game.status === 'bidding' && (
        <BiddingUI
          game={game}
          myPlayer={myPlayer}
          myPosition={myPosition}
          bidValue={bidValue}
          bidTimeRemaining={bidTimeRemaining}
          handleSelectBid={handleSelectBid}
          renderCard={renderCard}
        />
      )}

      {game.status === 'playing' && (
        <PlayingUI
          game={game}
          myPlayer={myPlayer}
          myPosition={myPosition}
          trickWinner={trickWinner}
          renderCard={renderCard}
          handlePlayCard={handlePlayCard}
          isMyTurn={isMyTurn}
          isWaitingForNextTrick={isWaitingForNextTrick}
        />
      )}

      {game.status === 'finished' && (
        <FinishedUI game={game} />
      )}
    </div>
  );
}
