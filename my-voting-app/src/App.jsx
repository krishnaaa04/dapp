import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);
// Set global font styles for charts
ChartJS.defaults.color = '#475569'; // Slate 600
ChartJS.defaults.font.family = "'Inter', sans-serif";


const API_URL = 'http://127.0.0.1:5000';

// --- Helper Components & Icons ---

const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20V16"/></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const CopyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const AuthIllustration = () => (
    <svg width="100%" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="100" y="50" width="200" height="200" rx="20" fill="#F0FDF4"/>
        <path d="M150 120H250" stroke="#16A34A" strokeWidth="8" strokeLinecap="round"/>
        <path d="M150 155H250" stroke="#16A34A" strokeWidth="8" strokeLinecap="round"/>
        <path d="M150 190H210" stroke="#16A34A" strokeWidth="8" strokeLinecap="round"/>
        <path d="M175 90 L185 100 L175 110" stroke="#16A34A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <rect x="125" y="90" width="40" height="20" rx="10" stroke="#16A34A" strokeWidth="8"/>
    </svg>
);
const EmptyStateIllustration = () => (
    <svg width="150" height="150" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="40" width="120" height="120" rx="10" fill="#F0FDF4"/>
        <path d="M70 70H130" stroke="#16A34A" strokeWidth="6" strokeLinecap="round"/>
        <path d="M70 95H130" stroke="#16A34A" strokeWidth="6" strokeLinecap="round"/>
        <path d="M70 120H110" stroke="#16A34A" strokeWidth="6" strokeLinecap="round"/>
        <circle cx="100" cy="100" r="40" stroke="#16A34A" strokeWidth="6" strokeDasharray="10 5"/>
    </svg>
);


// --- Main App Component ---
export default function App() {
  const [page, setPage] = useState('home');
  const [user, setUser] = useState(null);
  const [activePollId, setActivePollId] = useState(null); 

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setPage(parsedUser.role === 'creator' ? 'creatorDashboard' : 'voterDashboard');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setPage('home');
  };

  const navigateTo = (newPage, pollId = null) => {
    setActivePollId(pollId);
    setPage(newPage);
  };

  const onLoginSuccess = (loggedInUser) => {
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    setPage(loggedInUser.role === 'creator' ? 'creatorDashboard' : 'voterDashboard');
  };

  const renderPage = () => {
    if (user?.role === 'creator') {
        switch (page) {
            case 'creatorDashboard':
                return <CreatorDashboard user={user} navigateTo={navigateTo} />;
            case 'createPoll':
                return <CreatePollForm user={user} navigateTo={navigateTo} />;
            case 'analytics':
                return <PollAnalyticsDashboard pollId={activePollId} navigateTo={navigateTo} />;
            default:
                return <CreatorDashboard user={user} navigateTo={navigateTo} />;
        }
    }
    if (user?.role === 'voter') {
        return <VoterDashboard user={user} />;
    }
    switch (page) {
        case 'login':
            return <AuthPage onLoginSuccess={onLoginSuccess} navigateTo={navigateTo} />;
        case 'signup':
            return <AuthPage isSignup onLoginSuccess={onLoginSuccess} navigateTo={navigateTo} />;
        case 'home':
        default:
            return <HomePage navigateTo={navigateTo} />;
    }
  }

  return (
    <div className="app-wrapper">
      <Navbar user={user} navigateTo={navigateTo} onLogout={handleLogout} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

// --- Components ---

function Navbar({ user, navigateTo, onLogout }) {
  const goHome = () => {
    const homePage = user ? (user.role === 'creator' ? 'creatorDashboard' : 'voterDashboard') : 'home';
    navigateTo(homePage);
  }
  return (
    <header className="navbar">
      <div className="navbar-container">
        <h1 onClick={goHome}>BlockVote</h1>
        <nav>
          {user ? (
            <>
              <span className="welcome-message">Welcome, {user.username}</span>
              <button onClick={onLogout} className="nav-button">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => navigateTo('login')} className="nav-button">Login</button>
              <button onClick={() => navigateTo('signup')} className="nav-button primary">Sign Up</button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function HomePage({ navigateTo }) {
    return (
      <div className="hero">
        <div className="hero-content">
            <h2>Secure & Transparent Voting</h2>
            <p>Your voice, recorded on the blockchain. Create polls or cast your vote with confidence.</p>
            <div className="hero-buttons">
            <button onClick={() => navigateTo('signup')} className="btn btn-primary">Get Started</button>
            </div>
        </div>
      </div>
    );
}
  
function AuthPage({ isSignup, onLoginSuccess, navigateTo }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('creator');
    const [message, setMessage] = useState({ text: '', isError: false });
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      const endpoint = isSignup ? '/signup' : '/login';
      const payload = isSignup ? { username, password, role } : { username, password };
  
      try {
        const response = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
  
        if (!response.ok) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
  
        if (isSignup) {
          setMessage({ text: 'Signup successful! Please log in.', isError: false });
          navigateTo('login');
        } else {
          onLoginSuccess(data.user);
        }
      } catch (error) {
        setMessage({ text: error.message, isError: true });
      }
    };
  
    return (
      <div className="auth-container">
        <div className="auth-illustration">
          <AuthIllustration />
        </div>
        <div className="card auth-form">
          <h2>{isSignup ? 'Create an Account' : 'Welcome Back'}</h2>
          <Message message={message.text} isError={message.isError} />
          <form onSubmit={handleSubmit} className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
  
            {isSignup && (
              <>
                <label>I am a:</label>
                <div className="role-selector">
                  <label>
                    <input type="radio" value="creator" checked={role === 'creator'} onChange={(e) => setRole(e.target.value)} />
                    <span>Poll Creator</span>
                  </label>
                  <label>
                    <input type="radio" value="voter" checked={role === 'voter'} onChange={(e) => setRole(e.target.value)} />
                    <span>Voter</span>
                  </label>
                </div>
              </>
            )}
  
            <button type="submit" className="btn btn-primary full-width">
              {isSignup ? 'Create Account' : 'Login'}
            </button>
          </form>
          <div className="auth-switch">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}
            <button onClick={() => navigateTo(isSignup ? 'login' : 'signup')}>
              {isSignup ? 'Login' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    );
}

function CreatorDashboard({ user, navigateTo }) {
    const [polls, setPolls] = useState([]);
    const [copiedPollId, setCopiedPollId] = useState(null);
  
    const fetchPolls = async () => {
        const response = await fetch(`${API_URL}/my_polls/${user.username}`);
        const data = await response.json();
        setPolls(data);
    };

    useEffect(() => {
      fetchPolls();
    }, [user.username]);
  
    const handleClosePoll = async (pollId) => {
        if (!window.confirm("Are you sure you want to close this poll? This action cannot be undone.")) return;
        try {
            const response = await fetch(`${API_URL}/close_poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ poll_id: pollId, username: user.username }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            alert('Poll closed successfully');
            fetchPolls(); // Refresh the list
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    };
    
    const handleCopy = (pollId) => {
        navigator.clipboard.writeText(pollId);
        setCopiedPollId(pollId);
        setTimeout(() => setCopiedPollId(null), 2000);
    };

    const getStatus = (poll) => {
        const now = new Date();
        const end = new Date(poll.end_time);
        if (!poll.is_active) return { text: 'Closed', color: 'red' };
        if (now > end) return { text: 'Ended', color: 'gray' };
        return { text: 'Active', color: 'green' };
    };

    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Your Polls</h2>
          <button className="btn btn-primary" onClick={() => navigateTo('createPoll')}>+ Create New Poll</button>
        </div>
        
        <div className="card">
          {polls.length > 0 ? (
            <ul className="poll-list">
              {polls.map(poll => {
                const status = getStatus(poll);
                return (
                  <li key={poll.poll_id}>
                    <div className="poll-info">
                      <strong>{poll.question}</strong>
                      <div className="poll-id-container">
                        <span className="poll-id">ID: {poll.poll_id}</span>
                        <button className="copy-button" onClick={() => handleCopy(poll.poll_id)}>
                           {copiedPollId === poll.poll_id ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      </div>
                      <div className="poll-meta">
                        <span>Created: {new Date(poll.start_time).toLocaleString()}</span>
                        <span className={`status-badge ${status.color}`}>{status.text}</span>
                      </div>
                    </div>
                    <div className="poll-actions">
                      <button className="btn" onClick={() => navigateTo('analytics', poll.poll_id)}><ChartIcon /> Analytics</button>
                      {status.text === 'Active' && 
                        <button className="btn btn-danger" onClick={() => handleClosePoll(poll.poll_id)}><CloseIcon/> Close Poll</button>
                      }
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
                <EmptyStateIllustration />
                <h3>No Polls Found</h3>
                <p>You haven't created any polls yet. Click 'Create New Poll' to get started!</p>
            </div>
          )}
        </div>
      </div>
    );
}
  
function CreatePollForm({ user, navigateTo }) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState('');
    const [voterInputMethod, setVoterInputMethod] = useState('manual');
    const [votersText, setVotersText] = useState('');
    const [votersFile, setVotersFile] = useState(null);
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [message, setMessage] = useState({ text: '', isError: false });
  
    const handleCreatePoll = async (e) => {
      e.preventDefault();
  
      const formData = new FormData();
      formData.append('question', question);
      formData.append('options', options);
      formData.append('start_time', new Date(startTime).toISOString());
      formData.append('end_time', new Date(endTime).toISOString());
      formData.append('creator_username', user.username);
      formData.append('voter_input_method', voterInputMethod);

      if (voterInputMethod === 'manual') {
        formData.append('voters_text', votersText);
      } else {
        if (!votersFile) {
            setMessage({ text: 'Please select a CSV file to upload.', isError: true });
            return;
        }
        formData.append('voters_file', votersFile);
      }
  
      try {
        const response = await fetch(`${API_URL}/create_poll`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create poll');
        }
        setMessage({ text: `Poll created successfully! Poll ID: ${data.poll_id}`, isError: false });
        setTimeout(() => navigateTo('creatorDashboard'), 3000);
      } catch (error) {
        setMessage({ text: error.message, isError: true });
      }
    };
  
    return (
      <div className="dashboard-container">
        <button className="btn back-button" onClick={() => navigateTo('creatorDashboard')}>← Back to Dashboard</button>
        <div className="card">
          <h2>Create a New Poll</h2>
          <Message message={message.text} isError={message.isError} />
          <form onSubmit={handleCreatePoll} className="form-group">
            <label>Poll Question</label>
            <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} required />
            
            <label>Options (comma-separated)</label>
            <input type="text" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="e.g., Yes, No, Maybe" required />

            <label>Add Eligible Voters</label>
            <div className="input-method-selector">
                <button type="button" className={voterInputMethod === 'manual' ? 'active' : ''} onClick={() => setVoterInputMethod('manual')}>Manual Entry</button>
                <button type="button" className={voterInputMethod === 'csv' ? 'active' : ''} onClick={() => setVoterInputMethod('csv')}>Upload CSV</button>
            </div>
            
            {voterInputMethod === 'manual' ? (
                <textarea value={votersText} onChange={(e) => setVotersText(e.target.value)} placeholder="Enter Aadhaar numbers, one per line." rows="5"></textarea>
            ) : (
                <div className="file-input-wrapper">
                    <input type="file" id="csv-upload" accept=".csv" onChange={(e) => setVotersFile(e.target.files[0])} />
                    <label htmlFor="csv-upload">{votersFile ? votersFile.name : 'Choose a file...'}</label>
                </div>
            )}

            <div className="time-inputs">
              <div>
                <label>Start Time</label>
                <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div>
                <label>End Time</label>
                <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary full-width">Create Poll</button>
          </form>
        </div>
      </div>
    );
}

function PollAnalyticsDashboard({ pollId, navigateTo }) {
    const [analytics, setAnalytics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            setIsLoading(true);
            const response = await fetch(`${API_URL}/analytics/${pollId}`);
            const data = await response.json();
            setAnalytics(data);
            setIsLoading(false);
        };
        fetchAnalytics();
    }, [pollId]);

    if (isLoading) return <div className="dashboard-container"><p className="loading-text">Loading analytics...</p></div>;
    if (!analytics) return <div className="dashboard-container"><p>Could not load analytics.</p></div>;

    const pieChartData = {
        labels: Object.keys(analytics.results),
        datasets: [{
            data: Object.values(analytics.results),
            backgroundColor: ['#4ade80', '#f87171', '#fbbf24', '#60a5fa', '#c084fc'],
            borderColor: '#fff',
            borderWidth: 2,
        }],
    };
    
    const barChartData = {
        labels: Object.keys(analytics.results),
        datasets: [{
            label: 'Votes',
            data: Object.values(analytics.results),
            backgroundColor: 'rgba(22, 163, 74, 0.7)', // Green
            borderColor: 'rgba(22, 163, 74, 1)',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };
    
    const chartOptions = {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#475569' } } }
    };
    const barChartOptions = { ...chartOptions, indexAxis: 'y', scales: {
        x: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0'} },
        y: { ticks: { color: '#475569' }, grid: { color: '#e2e8f0'} },
    }};


    const handleExport = () => {
        window.open(`${API_URL}/export_results/${pollId}`);
    };

    const participationRate = analytics.total_voters > 0 ? (analytics.total_votes / analytics.total_voters) * 100 : 0;
    const timeLeft = new Date(analytics.end_time) - new Date();
    const durationProgress = Math.max(0, 100 - (timeLeft / (new Date(analytics.end_time) - new Date(analytics.start_time))) * 100);

    return (
        <div className="dashboard-container">
            <button className="btn back-button" onClick={() => navigateTo('creatorDashboard')}>← Back to Dashboard</button>
            <div className="dashboard-header">
                <h2>Analytics for: {analytics.question}</h2>
                <button className="btn" onClick={handleExport}>Export Results (CSV)</button>
            </div>

            <div className="stats-grid">
                <div className="card stat-card">
                    <h4>Total Votes</h4>
                    <p>{analytics.total_votes}</p>
                </div>
                <div className="card stat-card">
                    <h4>Eligible Voters</h4>
                    <p>{analytics.total_voters}</p>
                </div>
                <div className="card stat-card">
                    <h4>Participation Rate</h4>
                    <p>{participationRate.toFixed(1)}%</p>
                </div>
                <div className="card stat-card">
                    <h4>Status</h4>
                    <p className={`status-badge ${analytics.is_active ? 'green' : 'red'}`}>{analytics.is_active ? 'Active' : 'Ended'}</p>
                </div>
            </div>

            {analytics.is_active && (
                <div className="card">
                    <h4>Poll Duration</h4>
                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: `${durationProgress}%` }}></div>
                    </div>
                    <small>Poll ends on {new Date(analytics.end_time).toLocaleString()}</small>
                </div>
            )}

            <div className="charts-grid">
                <div className="card chart-card">
                    <h4>Results Overview</h4>
                    <div className="pie-chart-container">
                        <Pie data={pieChartData} options={chartOptions} />
                    </div>
                </div>
                <div className="card chart-card">
                    <h4>Results Breakdown</h4>
                    <div className="bar-chart-container">
                        <Bar data={barChartData} options={barChartOptions} />
                    </div>
                </div>
            </div>
        </div>
    );
}
  
function VoterDashboard({ user }) {
    const [pollId, setPollId] = useState('');
    const [aadhar, setAadhar] = useState('');
    const [pollData, setPollData] = useState(null);
    const [selectedOption, setSelectedOption] = useState('');
    const [message, setMessage] = useState({ text: '', isError: false });
  
    const handleFetchPoll = async (e) => {
      e.preventDefault();
      setMessage({ text: '', isError: false });
      setPollData(null);
      try {
        const response = await fetch(`${API_URL}/poll_status/${pollId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPollData(data);
      } catch (error) {
        setMessage({ text: error.message, isError: true });
      }
    };
  
    const handleVote = async (e) => {
      e.preventDefault();
      try {
        const response = await fetch(`${API_URL}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poll_id: pollId, aadhar, selection: selectedOption }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setMessage({ text: data.message, isError: false });
        setPollData(null); 
        setPollId('');
        setAadhar('');
      } catch (error) {
        setMessage({ text: error.message, isError: true });
      }
    };
  
    return (
      <div className="dashboard-container">
        <div className="card voter-dashboard">
          <h2>Cast Your Vote</h2>
          <Message message={message.text} isError={message.isError} />
          {!pollData ? (
            <form onSubmit={handleFetchPoll} className="form-group">
              <label>Enter Poll ID</label>
              <input type="text" value={pollId} onChange={(e) => setPollId(e.target.value)} required />
              <button type="submit" className="btn btn-primary full-width">Find Poll</button>
            </form>
          ) : (
            <div>
              <h3>{pollData.question}</h3>
              {pollData.is_active ? (
                <form onSubmit={handleVote} className="form-group">
                  <div className="options-list">
                    {pollData.options.map(option => (
                      <label key={option}>
                        <input
                          type="radio"
                          name="voteOption"
                          value={option}
                          checked={selectedOption === option}
                          onChange={(e) => setSelectedOption(e.target.value)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                  <label>Enter Your Aadhaar Number to Vote</label>
                   <input type="text" value={aadhar} onChange={(e) => setAadhar(e.target.value)} required />
                  <button type="submit" className="btn btn-primary full-width" disabled={!selectedOption || !aadhar}>Submit Vote</button>
                </form>
              ) : (
                <p className="poll-inactive-message">This poll is not currently active for voting.</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
}

function Message({ message, isError }) {
    if (!message) return null;
    return <div className={`message ${isError ? 'error' : 'success'}`}>{message}</div>;
}

