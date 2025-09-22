import hashlib
import json
import sqlite3
import csv
import io
from time import time
from datetime import datetime
from uuid import uuid4
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# --- Database Setup ---
DB_NAME = 'voting_app.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('creator', 'voter'))
    )
    ''')
    # Polls table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS polls (
        poll_id TEXT PRIMARY KEY,
        creator_username TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (creator_username) REFERENCES users (username)
    )
    ''')
    # Voters table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS voters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id TEXT NOT NULL,
        aadhar_hash TEXT NOT NULL,
        has_voted INTEGER DEFAULT 0,
        FOREIGN KEY (poll_id) REFERENCES polls (poll_id)
    )
    ''')
    # Blockchain table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS blockchain_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_data TEXT NOT NULL
    )
    ''')
    conn.commit()
    conn.close()

# --- Blockchain Class ---
class Blockchain:
    def __init__(self):
        self.conn = sqlite3.connect(DB_NAME, check_same_thread=False) 
        self.cursor = self.conn.cursor()
        self.chain = self.load_chain()
        if not self.chain:
            self.new_block(previous_hash='1', proof=100)

    def load_chain(self):
        try:
            self.cursor.execute("SELECT block_data FROM blockchain_data ORDER BY id ASC")
            rows = self.cursor.fetchall()
            return [json.loads(row[0]) for row in rows]
        except sqlite3.OperationalError:
            # Table might not exist yet if init_db() hasn't run in this session
            return []


    def save_block(self, block):
        self.cursor.execute("INSERT INTO blockchain_data (block_data) VALUES (?)", (json.dumps(block, sort_keys=True),))
        self.conn.commit()

    def new_block(self, proof, previous_hash=None):
        block = {
            'index': len(self.chain) + 1,
            'timestamp': time(),
            'transactions': [], 
            'proof': proof,
            'previous_hash': previous_hash or self.hash(self.chain[-1]),
        }
        self.chain.append(block)
        self.save_block(block)
        return block

    def new_transaction(self, poll_id, voter_hash, selection):
        if not self.chain: return None
        
        transaction = {
            'poll_id': poll_id,
            'voter_hash': voter_hash,
            'selection': selection,
            'timestamp': time()
        }
        # Get current block, add transaction, then update it
        current_block = self.chain[-1]
        current_block['transactions'].append(transaction)
        
        self.cursor.execute("UPDATE blockchain_data SET block_data = ? WHERE id = ?", 
                            (json.dumps(current_block, sort_keys=True), current_block['index']))
        self.conn.commit()
        # Update the in-memory chain as well
        self.chain[-1] = current_block
        return self.last_block['index']

    @property
    def last_block(self):
        return self.chain[-1]

    @staticmethod
    def hash(block):
        block_string = json.dumps(block, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()

# --- Flask App ---
app = Flask(__name__)
CORS(app)

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

# --- User Authentication Routes ---
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    if not all([username, password, role]):
        return jsonify({'error': 'Missing data'}), 400
    if role not in ['creator', 'voter']:
        return jsonify({'error': 'Invalid role specified'}), 400

    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if user:
        conn.close()
        return jsonify({'error': 'Username already exists'}), 409
    
    password_hash = generate_password_hash(password)
    conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', 
                 (username, password_hash, role))
    conn.commit()
    conn.close()
    return jsonify({'message': 'User created successfully'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Missing username or password'}), 400
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()

    if user and check_password_hash(user['password_hash'], password):
        return jsonify({
            'message': 'Login successful',
            'user': {
                'username': user['username'],
                'role': user['role']
            }
        }), 200
    
    return jsonify({'error': 'Invalid username or password'}), 401

# --- Creator Routes ---
@app.route('/create_poll', methods=['POST'])
def create_poll():
    creator_username = request.form.get('creator_username')
    question = request.form.get('question')
    options_str = request.form.get('options')
    start_time = request.form.get('start_time')
    end_time = request.form.get('end_time')
    voter_input_method = request.form.get('voter_input_method')

    if not all([creator_username, question, options_str, start_time, end_time, voter_input_method]):
        return jsonify({'error': 'Missing required form fields'}), 400
    
    poll_id = str(uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        user = cursor.execute('SELECT role FROM users WHERE username = ?', (creator_username,)).fetchone()
        if not user or user['role'] != 'creator':
            return jsonify({'error': 'User is not authorized to create polls'}), 403

        cursor.execute('INSERT INTO polls (poll_id, creator_username, question, options, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
                     (poll_id, creator_username, question, options_str, start_time, end_time))
        
        voters = []
        if voter_input_method == 'manual':
            voters_text = request.form.get('voters_text', '')
            voters = [v.strip() for v in voters_text.splitlines() if v.strip()]
        elif voter_input_method == 'csv':
            if 'voters_file' not in request.files:
                return jsonify({'error': 'No voter file part'}), 400
            file = request.files['voters_file']
            if file.filename == '':
                return jsonify({'error': 'No selected file'}), 400
            
            stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.reader(stream)
            voters = [row[0].strip() for row in csv_reader if row and row[0].strip()]

        if not voters:
            return jsonify({'error': 'Voter list cannot be empty'}), 400

        for aadhar in voters:
            aadhar_hash = hashlib.sha256(aadhar.encode()).hexdigest()
            cursor.execute('INSERT INTO voters (poll_id, aadhar_hash) VALUES (?, ?)', (poll_id, aadhar_hash))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'An error occurred: {e}'}), 500
    finally:
        conn.close()
    
    return jsonify({'message': 'Poll created successfully', 'poll_id': poll_id}), 201

@app.route('/my_polls/<username>', methods=['GET'])
def get_my_polls(username):
    conn = get_db_connection()
    polls = conn.execute('SELECT * FROM polls WHERE creator_username = ? ORDER BY start_time DESC', (username,)).fetchall()
    conn.close()
    return jsonify([dict(poll) for poll in polls]), 200

@app.route('/close_poll', methods=['POST'])
def close_poll():
    data = request.get_json()
    poll_id = data.get('poll_id')
    username = data.get('username')

    conn = get_db_connection()
    poll = conn.execute('SELECT creator_username FROM polls WHERE poll_id = ?', (poll_id,)).fetchone()
    if not poll or poll['creator_username'] != username:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403

    conn.execute('UPDATE polls SET is_active = 0, end_time = ? WHERE poll_id = ?', (datetime.utcnow().isoformat(), poll_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Poll closed successfully'}), 200


# --- Voter Routes ---
@app.route('/poll_status/<poll_id>', methods=['GET'])
def get_poll_status(poll_id):
    conn = get_db_connection()
    poll = conn.execute('SELECT * FROM polls WHERE poll_id = ?', (poll_id,)).fetchone()
    conn.close()

    if not poll:
        return jsonify({'error': 'Poll not found'}), 404

    now = datetime.utcnow()
    start = datetime.fromisoformat(poll['start_time'].replace('Z', '+00:00')).replace(tzinfo=None)
    end = datetime.fromisoformat(poll['end_time'].replace('Z', '+00:00')).replace(tzinfo=None)
    
    is_active_by_time = start <= now <= end
    
    return jsonify({
        'question': poll['question'],
        'options': [o.strip() for o in poll['options'].split(',')],
        'is_active': poll['is_active'] and is_active_by_time
    }), 200

@app.route('/vote', methods=['POST'])
def vote():
    data = request.get_json()
    poll_id = data.get('poll_id')
    aadhar = data.get('aadhar')
    selection = data.get('selection')

    if not all([poll_id, aadhar, selection]):
        return jsonify({'error': 'Missing data'}), 400
    
    aadhar_hash = hashlib.sha256(aadhar.encode()).hexdigest()
    
    conn = get_db_connection()
    poll = conn.execute('SELECT * FROM polls WHERE poll_id = ?', (poll_id,)).fetchone()
    if not poll:
        conn.close()
        return jsonify({'error': 'Poll not found'}), 404
        
    now = datetime.utcnow()
    start = datetime.fromisoformat(poll['start_time'].replace('Z', '+00:00')).replace(tzinfo=None)
    end = datetime.fromisoformat(poll['end_time'].replace('Z', '+00:00')).replace(tzinfo=None)

    if not (poll['is_active'] and start <= now <= end):
        conn.close()
        return jsonify({'error': 'Voting period for this poll is not active'}), 403

    voter = conn.execute('SELECT * FROM voters WHERE poll_id = ? AND aadhar_hash = ?', (poll_id, aadhar_hash)).fetchone()
    
    if not voter:
        conn.close()
        return jsonify({'error': 'You are not eligible to vote in this poll'}), 403
    if voter['has_voted'] == 1:
        conn.close()
        return jsonify({'error': 'You have already voted in this poll'}), 409
        
    blockchain.new_transaction(poll_id, aadhar_hash, selection)
    conn.execute('UPDATE voters SET has_voted = 1 WHERE id = ?', (voter['id'],))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Vote successfully cast and recorded on the blockchain'}), 201

# --- Analytics and Results Helper Function ---
def _get_poll_analytics_data(poll_id):
    conn = get_db_connection()
    poll = conn.execute('SELECT * FROM polls WHERE poll_id = ?', (poll_id,)).fetchone()
    if not poll:
        conn.close()
        return None
    
    voters = conn.execute('SELECT COUNT(*) as count FROM voters WHERE poll_id = ?', (poll_id,)).fetchone()
    conn.close()
    
    options = [o.strip() for o in poll['options'].split(',')]
    results = {option: 0 for option in options}
    total_votes = 0

    chain = blockchain.load_chain()
    for block in chain:
        for tx in block.get('transactions', []):
            if tx.get('poll_id') == poll_id:
                if tx['selection'] in results:
                    results[tx['selection']] += 1
                    total_votes += 1
    
    now = datetime.utcnow()
    start_str = poll['start_time'].replace('Z', '+00:00')
    end_str = poll['end_time'].replace('Z', '+00:00')
    start = datetime.fromisoformat(start_str).replace(tzinfo=None)
    end = datetime.fromisoformat(end_str).replace(tzinfo=None)
    is_active_by_time = start <= now <= end
    
    return {
        'question': poll['question'],
        'results': results,
        'total_votes': total_votes,
        'total_voters': voters['count'],
        'start_time': poll['start_time'],
        'end_time': poll['end_time'],
        'is_active': poll['is_active'] and is_active_by_time
    }

# --- Analytics and Results Routes ---
@app.route('/analytics/<poll_id>', methods=['GET'])
def get_analytics(poll_id):
    analytics_data = _get_poll_analytics_data(poll_id)
    if not analytics_data:
        return jsonify({'error': 'Poll not found'}), 404
    return jsonify(analytics_data), 200

@app.route('/export_results/<poll_id>')
def export_results(poll_id):
    analytics_data = _get_poll_analytics_data(poll_id)
    if not analytics_data:
        return jsonify({'error': 'Poll not found'}), 404

    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(['Poll Question:', analytics_data['question']])
    writer.writerow(['Total Votes:', analytics_data['total_votes']])
    writer.writerow([])
    writer.writerow(['Option', 'Vote Count'])
    for option, count in analytics_data['results'].items():
        writer.writerow([option, count])
        
    output.seek(0)
    
    return Response(output, mimetype="text/csv", headers={"Content-Disposition":f"attachment;filename=poll_results_{poll_id}.csv"})


if __name__ == '__main__':
    init_db()
    blockchain = Blockchain()
    app.run(debug=True, port=5000)

