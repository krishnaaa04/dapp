import React, { useState } from 'react';

// --- Reusable Components ---

const Message = ({ text, isError }) => {
  if (!text) return null;
  const messageClass = isError ? 'message error' : 'message success';
  return (
    <div className={messageClass}>
      {text}
    </div>
  );
};

const ResultsDisplay = ({ resultsData }) => {
  const { question, results, total_votes, is_active } = resultsData;
  return (
    <div className="card results-display">
      <h3>{question}</h3>
      <p className="status-text">
        Status: {is_active ? 'Active' : 'Ended'} | Total Votes: {total_votes}
      </p>
      <div className="results-list">
        {Object.entries(results).map(([option, votes]) => {
          const percentage = total_votes > 0 ? ((votes / total_votes) * 100).toFixed(1) : 0;
          return (
            <div key={option} className="result-item">
              <div className="result-info">
                <span>{option}</span>
                <span className="vote-count">{votes} votes ({percentage}%)</span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${percentage}%` }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Main App Component ---

function App() {
  const API_URL = 'http://127.0.0.1:5000';

  // State Management
  const [view, setView] = useState('creator');
  const [message, setMessage] = useState({ text: '', isError: false });

  // Creator state
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [voters, setVoters] = useState('');
  const [creatorInfo, setCreatorInfo] = useState(null);
  const [managePollId, setManagePollId] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [creatorResults, setCreatorResults] = useState(null);

  // Voter state
  const [voterPollId, setVoterPollId] = useState('');
  const [voterId, setVoterId] = useState('');
  const [pollData, setPollData] = useState(null);
  const [voterResults, setVoterResults] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');

  const clearMessages = () => {
    setMessage({ text: '', isError: false });
    setCreatorInfo(null);
    setCreatorResults(null);
    setVoterResults(null);
    setPollData(null);
  }

  const handleSetView = (newView) => {
    clearMessages();
    setView(newView);
  }

  // --- API Functions ---
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    clearMessages();
    try {
      const res = await fetch(`${API_URL}/create_poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options, voters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create poll.');
      setCreatorInfo(data);
      setManagePollId(data.poll_id);
      setCreatorId(data.creator_id);
    } catch (error) {
      setMessage({ text: error.message, isError: true });
    }
  };
  
  const handleManageAction = async (action) => {
    clearMessages();
    const body = { poll_id: managePollId, creator_id: creatorId };
    const endpoint = action === 'end' ? '/end_poll' : '/results';
    
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || `Failed to ${action} poll.`);
        
        if (action === 'end') {
            setMessage({ text: data.message, isError: false });
        } else {
            setCreatorResults(data);
        }
    } catch (error) {
        setMessage({ text: error.message, isError: true });
    }
  };

  const handleAccessPoll = async (e) => {
    e.preventDefault();
    clearMessages();
    try {
        const res = await fetch(`${API_URL}/poll_status/${voterPollId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not fetch poll status.');
        
        if (data.is_active) {
            setPollData(data);
        } else {
            setMessage({ text: 'This poll has ended. Fetching results...', isError: false });
            const resultsRes = await fetch(`${API_URL}/results`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ poll_id: voterPollId })
            });
            const resultsData = await resultsRes.json();
            if(!resultsRes.ok) throw new Error(resultsData.error || 'Could not fetch results.');
            setVoterResults(resultsData);
        }
    } catch (error) {
        setMessage({ text: error.message, isError: true });
    }
  };

  const handleVote = async () => {
    clearMessages();
    if (!selectedOption) {
        setMessage({ text: 'Please select an option to vote.', isError: true });
        return;
    }
    try {
        const res = await fetch(`${API_URL}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_id: voterPollId, voter_id: voterId, selection: selectedOption })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to cast vote.');
        setPollData(null); // Hide voting options
        setMessage({ text: data.message, isError: false });
    } catch (error) {
        setMessage({ text: error.message, isError: true });
    }
  };

  // --- Render Logic ---

  return (
    <div className="app-container">
      <div className="main-panel">
        <div className="header">
          <h1>Blockchain Voting System</h1>
          <p>A decentralized and transparent way to vote.</p>
        </div>

        <div className="tab-container">
          <button
            className={`tab-button ${view === 'creator' ? 'active' : ''}`}
            onClick={() => handleSetView('creator')}
          >
            I'm a Creator
          </button>
          <button
            className={`tab-button ${view === 'voter' ? 'active' : ''}`}
            onClick={() => handleSetView('voter')}
          >
            I'm a Voter
          </button>
        </div>

        {view === 'creator' && (
          <div className="view-container">
            <div className="card">
              <h2>1. Create a New Poll</h2>
              <form onSubmit={handleCreatePoll} className="form-group">
                <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll Question" className="form-input" required />
                <textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Enter options, separated by commas" className="form-textarea" rows="3" required />
                <textarea value={voters} onChange={(e) => setVoters(e.target.value)} placeholder="Enter eligible voter IDs, separated by commas" className="form-textarea" rows="3" required />
                <button type="submit" className="btn btn-primary">Create Poll</button>
              </form>
              {creatorInfo && (
                <div className="creator-info">
                  <p><strong>Poll Created! Save these details:</strong></p>
                  <p><strong>Poll ID:</strong> {creatorInfo.poll_id}</p>
                  <p><strong>Creator ID:</strong> {creatorInfo.creator_id}</p>
                </div>
              )}
            </div>
            <div className="card">
                <h2>2. Manage Your Poll</h2>
                <div className="form-group">
                    <input type="text" value={managePollId} onChange={e => setManagePollId(e.target.value)} placeholder="Poll ID" className="form-input" required />
                    <input type="text" value={creatorId} onChange={e => setCreatorId(e.target.value)} placeholder="Your Secret Creator ID" className="form-input" required />
                    <div className="button-group">
                         <button onClick={() => handleManageAction('end')} className="btn btn-danger">End Poll</button>
                         <button onClick={() => handleManageAction('results')} className="btn btn-success">Get Results</button>
                    </div>
                </div>
            </div>
          </div>
        )}

        {view === 'voter' && (
          <div className="view-container">
            {!pollData && !voterResults && (
              <div className="card">
                <h2>Access a Poll to Vote</h2>
                <form onSubmit={handleAccessPoll} className="form-group">
                    <input type="text" value={voterPollId} onChange={e => setVoterPollId(e.target.value)} placeholder="Poll ID" className="form-input" required />
                    <input type="text" value={voterId} onChange={e => setVoterId(e.target.value)} placeholder="Your Voter ID" className="form-input" required />
                    <button type="submit" className="btn btn-primary">Access Poll</button>
                </form>
              </div>
            )}
            
            {pollData && (
                <div className="card">
                    <h3>{pollData.question}</h3>
                    <div className="options-list">
                        {pollData.options.map(option => (
                            <label key={option} className="option-label">
                                <input type="radio" name="vote-option" value={option} checked={selectedOption === option} onChange={() => setSelectedOption(option)} />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                    <button onClick={handleVote} className="btn btn-primary">Cast Your Vote</button>
                </div>
            )}

            {voterResults && <ResultsDisplay resultsData={voterResults} />}
          </div>
        )}
        
        <Message text={message.text} isError={message.isError} />
        {creatorResults && <ResultsDisplay resultsData={creatorResults} />}
      </div>
    </div>
  );
}

export default App;
