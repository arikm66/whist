import React from 'react';

export default function RoundSummaryTable({ rounds, players, myPosition }) {
  return (
    <div style={{ margin: '2rem 0', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px #eee' }}>
      <h2>Round Summaries</h2>
      {rounds.length === 0 ? (
        <div>No rounds played yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '2px solid #ccc', padding: 8 }}>Round</th>
              {players.map((p, idx) => (
                <th key={idx} style={{ borderBottom: '2px solid #ccc', padding: 8 }}>
                  Player {idx + 1} {idx === myPosition && '(You)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round, rIdx) => (
              <React.Fragment key={rIdx}>
                {round.tricks.map((trick, tIdx) => (
                  <tr key={tIdx}>
                    {/* Round number only for first trick row of each round */}
                    {tIdx === 0 ? (
                      <td rowSpan={round.tricks.length + 1} style={{ padding: 8, fontWeight: 500, background: '#f5f5f5', verticalAlign: 'top', textAlign: 'center' }}>
                        {rIdx + 1}
                      </td>
                    ) : null}
                    {trick.map((play, pIdx) => (
                      <td key={pIdx} style={{ padding: 8, textAlign: 'center' }}>
                        {play.card} {play.won ? '🏆' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Scores Row */}
                <tr>
                  {/* Only show the round number cell if there are no tricks */}
                  {round.tricks.length === 0 ? (
                    <td style={{ padding: 8, fontWeight: 500, background: '#f5f5f5', textAlign: 'center' }}>{rIdx + 1}</td>
                  ) : null}
                  {round.scores.map((score, pIdx) => (
                    <td
                      key={pIdx}
                      style={{
                        padding: 8,
                        color: score.matchedBid ? 'green' : 'black',
                        fontWeight: score.matchedBid ? 'bold' : 'normal',
                        background: '#f9f9f9',
                        textAlign: 'center',
                      }}
                    >
                      {score.value}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
