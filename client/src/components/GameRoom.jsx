import React, { useState, useEffect } from 'react';
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

    socket.on('cardPlayed', ({ game }) => {
      setGame(game);
      setSelectedCard(null);
    });

    socket.on('trickComplete', ({ trick, winner, game }) => {
      setGame(game);
      setTimeout(() => {
        // Show trick winner
      }, 2000);
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
    if (myPosition !== game.currentTurn) return;
    
    setSelectedCard(card);
    socket.emit('playCard', { 
      roomCode, 
      userId: user._id || user.id, 
      card 
    });
  };

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
  const isMyTurn = game.currentTurn === myPosition;

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
          onClick={() => navigate('/lobby')}
          style={{ padding: '8px 16px', height: 'fit-content' }}
        >
          Leave Room
        </button>
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

      {game.status === 'playing' && (
        <>
          {/* Scores */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '2rem',
            backgroundColor: '#f9f9f9',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            {game.players.map((player, idx) => (
              <div key={idx} style={{ flex: 1 }}>
                <strong>Player {idx + 1}</strong>
                <div>Tricks: {player.tricksWon}</div>
                <div>Score: {game.scores.find(s => s.position === idx)?.score || 0}</div>
              </div>
            ))}
          </div>

          {/* Current Trick */}
          {game.currentTrick.length > 0 && (
            <div style={{ 
              marginBottom: '2rem',
              padding: '2rem',
              backgroundColor: '#e8f5e9',
              borderRadius: '8px'
            }}>
              <h3>Current Trick</h3>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                {game.currentTrick.map((play, idx) => (
                  <div key={idx} style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '0.5rem', fontSize: '12px' }}>
                      Player {play.position + 1}
                    </div>
                    {renderCard(play.card, null, false)}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  renderCard(card, handlePlayCard, isMyTurn)
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
