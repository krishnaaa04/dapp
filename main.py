import hashlib
import json
import sqlite3
from time import time
from datetime import datetime
from uuid import uuid4
from flask import Flask, jsonify, request
from flask_cors import CORS

# --- Database Setup ---
DATABASE_FILE = 'voting.db'

def get_db():
    """Establishes a connection to the database."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row  # This allows accessing columns by name
    return conn

def init_db():
    """Initializes the database and creates tables if they don't exist."""
    print("Initializing database...")
    conn = get_db()
    cursor = conn.cursor()
    
    # Create polls table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id TEXT NOT NULL UNIQUE,
            creator_id TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,          -- Stored as a JSON string
            eligible_voters TEXT NOT NULL,  -- Stored as a JSON string
            active BOOLEAN NOT NULL
        )
    ''')
    
    # Create a simple key-value table for the blockchain
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blockchain_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Check if the blockchain has been initialized (genesis block)
    chain_row = cursor.execute('SELECT value FROM blockchain_data WHERE key = ?', ('chain',)).fetchone()
    if not chain_row:
        print("No blockchain found, creating genesis block...")
        temp_blockchain = Blockchain() # Create a temporary instance to get the genesis block
        # Insert the initial chain with the genesis block
        cursor.execute('INSERT INTO blockchain_data (key, value) VALUES (?, ?)',
                     ('chain', json.dumps([b for b in temp_blockchain.chain])))
        # Insert empty current transactions
        cursor.execute('INSERT INTO blockchain_data (key, value) VALUES (?, ?)',
                     ('current_transactions', json.dumps([])))
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

# --- Blockchain Core Logic (Unchanged) ---
class Blockchain:
    def __init__(self):
        # Note: This is now just for the methods. The actual data will be loaded from DB.
        self.chain = []
        self.current_transactions = []
        if not self.chain: # If chain is empty (on initial creation)
             self.new_block(previous_hash='1', proof=100) # Genesis block

    def new_block(self, proof, previous_hash=None):
        block = {
            'index': len(self.chain) + 1,
            'timestamp': str(datetime.now()),
            'transactions': self.current_transactions,
            'proof': proof,
            'previous_hash': previous_hash or self.hash(self.chain[-1]),
        }
        self.current_transactions = []
        self.chain.append(block)
        return block

    def new_transaction(self, voter_id, poll_id, selection):
        self.current_transactions.append({
            'voter_id': voter_id,
            'poll_id': poll_id,
            'selection': selection,
            'timestamp': str(datetime.now())
        })
        return self.last_block['index'] + 1
    
    @staticmethod
    def hash(block):
        block_string = json.dumps(block, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()

    @property
    def last_block(self):
        return self.chain[-1]

    def proof_of_work(self, last_proof):
        proof = 0
        while self.valid_proof(last_proof, proof) is False:
            proof += 1
        return proof

    @staticmethod
    def valid_proof(last_proof, proof):
        guess = f'{last_proof}{proof}'.encode()
        guess_hash = hashlib.sha256(guess).hexdigest()
        return guess_hash[:4] == "0000"

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app)

# --- Global In-Memory Data Stores ---
# These will be populated from the database on startup.
polls = {}
blockchain = Blockchain()

def load_data_from_db():
    """Loads all polls and blockchain data from SQLite into memory."""
    global polls, blockchain
    print("Loading data from database into memory...")
    conn = get_db()
    
    # Load polls
    db_polls = conn.execute('SELECT * FROM polls').fetchall()
    for poll_row in db_polls:
        poll_id = poll_row['poll_id']
        polls[poll_id] = {
            'question': poll_row['question'],
            'options': json.loads(poll_row['options']),
            'eligible_voters': set(json.loads(poll_row['eligible_voters'])),
            'creator_id': poll_row['creator_id'],
            'active': bool(poll_row['active'])
        }
    print(f"Loaded {len(polls)} polls.")
    
    # Load blockchain data
    chain_data = conn.execute('SELECT value FROM blockchain_data WHERE key = ?', ('chain',)).fetchone()
    transactions_data = conn.execute('SELECT value FROM blockchain_data WHERE key = ?', ('current_transactions',)).fetchone()
    
    if chain_data:
        blockchain.chain = json.loads(chain_data['value'])
    if transactions_data:
        blockchain.current_transactions = json.loads(transactions_data['value'])
    print(f"Loaded blockchain with {len(blockchain.chain)} blocks.")
    
    conn.close()

# --- API Endpoints (Modified for DB interaction) ---

@app.route('/create_poll', methods=['POST'])
def create_poll():
    values = request.get_json()
    required = ['question', 'options', 'voters']
    if not all(k in values for k in required):
        return 'Missing values', 400

    poll_id = str(uuid4()).replace('-', '')
    creator_id = str(uuid4()).replace('-', '')
    
    options = [opt.strip() for opt in values['options'].split(',') if opt.strip()]
    voters = [v.strip() for v in values['voters'].split(',') if v.strip()]

    # 1. Update in-memory store
    polls[poll_id] = {
        'question': values['question'],
        'options': options,
        'eligible_voters': set(voters),
        'creator_id': creator_id,
        'active': True
    }
    
    # 2. Persist to database
    conn = get_db()
    conn.execute('''
        INSERT INTO polls (poll_id, creator_id, question, options, eligible_voters, active)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (poll_id, creator_id, values['question'], json.dumps(options), json.dumps(voters), True))
    conn.commit()
    conn.close()
    
    response = {'message': 'Poll created successfully.', 'poll_id': poll_id, 'creator_id': creator_id}
    return jsonify(response), 201

@app.route('/vote', methods=['POST'])
def vote():
    values = request.get_json()
    # ... (validation logic is the same as before) ...
    poll_id = values['poll_id']
    voter_id = values['voter_id']
    selection = values['selection']

    if poll_id not in polls: return jsonify({'error': 'Poll not found.'}), 404
    poll = polls[poll_id]
    if not poll['active']: return jsonify({'error': 'This poll has ended.'}), 403
    if voter_id not in poll['eligible_voters']: return jsonify({'error': 'You are not eligible to vote.'}), 403
    if selection not in poll['options']: return jsonify({'error': 'Invalid selection.'}), 400
    for block in blockchain.chain:
        for tx in block['transactions']:
            if tx['poll_id'] == poll_id and tx['voter_id'] == voter_id:
                return jsonify({'error': 'You have already voted in this poll.'}), 403

    # 1. Update in-memory blockchain
    blockchain.new_transaction(voter_id, poll_id, selection)
    last_block = blockchain.last_block
    last_proof = last_block['proof']
    proof = blockchain.proof_of_work(last_proof)
    blockchain.new_block(proof, blockchain.hash(last_block))

    # 2. Persist updated blockchain to database
    conn = get_db()
    conn.execute('UPDATE blockchain_data SET value = ? WHERE key = ?',
                 (json.dumps(blockchain.chain), 'chain'))
    conn.execute('UPDATE blockchain_data SET value = ? WHERE key = ?',
                 (json.dumps(blockchain.current_transactions), 'current_transactions'))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Your vote has been successfully cast and recorded.'}), 201

@app.route('/end_poll', methods=['POST'])
def end_poll():
    values = request.get_json()
    required = ['poll_id', 'creator_id']
    if not all(k in values for k in required): return 'Missing values', 400
    poll_id = values['poll_id']
    creator_id = values['creator_id']
    if poll_id not in polls: return jsonify({'error': 'Poll not found.'}), 404
    if polls[poll_id]['creator_id'] != creator_id: return jsonify({'error': 'Invalid creator ID.'}), 403

    # 1. Update in-memory store
    polls[poll_id]['active'] = False
    
    # 2. Persist to database
    conn = get_db()
    conn.execute('UPDATE polls SET active = ? WHERE poll_id = ?', (False, poll_id))
    conn.commit()
    conn.close()

    return jsonify({'message': f'Poll {poll_id} has been closed.'}), 200

# --- Read-only endpoints (no changes needed) ---
@app.route('/poll_status/<poll_id>', methods=['GET'])
def poll_status(poll_id):
    if poll_id not in polls:
        return jsonify({'error': 'Poll not found.'}), 404
    poll = polls[poll_id]
    response = {'question': poll['question'], 'options': poll['options'], 'is_active': poll['active']}
    return jsonify(response), 200

@app.route('/results', methods=['POST'])
def get_results():
    values = request.get_json()
    poll_id = values.get('poll_id')
    creator_id = values.get('creator_id') 
    if not poll_id: return 'Missing poll_id', 400
    if poll_id not in polls: return jsonify({'error': 'Poll not found.'}), 404
    poll = polls[poll_id]

    if poll['active'] and poll['creator_id'] != creator_id:
        return jsonify({'error': 'Results are not public yet. The poll is still active.'}), 403

    results = {option: 0 for option in poll['options']}
    total_votes = 0
    for block in blockchain.chain:
        for tx in block['transactions']:
            if tx['poll_id'] == poll_id:
                if tx['selection'] in results:
                    results[tx['selection']] += 1
                    total_votes += 1
    
    response = {
        'question': poll['question'],
        'results': results,
        'total_votes': total_votes,
        'is_active': poll['active']
    }
    return jsonify(response), 200

# --- Main Execution ---
if __name__ == '__main__':
    init_db()  # Ensure DB and tables exist
    load_data_from_db()  # Load all data into memory
    app.run(host='0.0.0.0', port=5000, debug=True)

