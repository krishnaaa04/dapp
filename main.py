import hashlib
import json
from time import time
from datetime import datetime
from uuid import uuid4
from flask import Flask, jsonify, request
from flask_cors import CORS

# --- Blockchain Core Logic ---

class Blockchain:
    def __init__(self):
        self.chain = []
        self.current_transactions = []
        # Create the genesis block
        self.new_block(previous_hash='1', proof=100)

    def new_block(self, proof, previous_hash=None):
        """
        Creates a new Block and adds it to the chain
        :param proof: <int> The proof given by the Proof of Work algorithm
        :param previous_hash: (Optional) <str> Hash of previous Block
        :return: <dict> New Block
        """
        block = {
            'index': len(self.chain) + 1,
            'timestamp': str(datetime.now()),
            'transactions': self.current_transactions,
            'proof': proof,
            'previous_hash': previous_hash or self.hash(self.chain[-1]),
        }

        # Reset the current list of transactions
        self.current_transactions = []
        self.chain.append(block)
        return block

    def new_transaction(self, voter_id, poll_id, selection):
        """
        Adds a new transaction to the list of transactions
        :param voter_id: <str> ID of the Voter
        :param poll_id: <str> ID of the Poll
        :param selection: <str> The selected option
        :return: <int> The index of the Block that will hold this transaction
        """
        self.current_transactions.append({
            'voter_id': voter_id,
            'poll_id': poll_id,
            'selection': selection,
            'timestamp': str(datetime.now())
        })
        return self.last_block['index'] + 1
    
    @staticmethod
    def hash(block):
        """
        Creates a SHA-256 hash of a Block
        :param block: <dict> Block
        :return: <str>
        """
        block_string = json.dumps(block, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()

    @property
    def last_block(self):
        return self.chain[-1]

    def proof_of_work(self, last_proof):
        """
        Simple Proof of Work Algorithm:
         - Find a number 'proof' such that hash(last_proof, proof) contains leading 4 zeroes.
        """
        proof = 0
        while self.valid_proof(last_proof, proof) is False:
            proof += 1
        return proof

    @staticmethod
    def valid_proof(last_proof, proof):
        """
        Validates the proof: Does hash(last_proof, proof) contain 4 leading zeroes?
        """
        guess = f'{last_proof}{proof}'.encode()
        guess_hash = hashlib.sha256(guess).hexdigest()
        return guess_hash[:4] == "0000"

# --- Flask App Setup ---

app = Flask(__name__)
CORS(app) # Enable Cross-Origin Resource Sharing

# Instantiate the Blockchain
blockchain = Blockchain()

# In-memory storage for polls
polls = {}

# --- API Endpoints ---

@app.route('/create_poll', methods=['POST'])
def create_poll():
    values = request.get_json()
    required = ['question', 'options', 'voters']
    if not all(k in values for k in required):
        return 'Missing values', 400

    poll_id = str(uuid4()).replace('-', '')
    creator_id = str(uuid4()).replace('-', '') # Secret key for the creator
    
    # Ensure options and voters are lists
    options = [opt.strip() for opt in values['options'].split(',') if opt.strip()]
    voters = [v.strip() for v in values['voters'].split(',') if v.strip()]

    polls[poll_id] = {
        'question': values['question'],
        'options': options,
        'eligible_voters': set(voters), # Use a set for efficient lookup
        'creator_id': creator_id,
        'active': True
    }
    
    response = {
        'message': 'Poll created successfully.',
        'poll_id': poll_id,
        'creator_id': creator_id
    }
    return jsonify(response), 201

@app.route('/vote', methods=['POST'])
def vote():
    values = request.get_json()
    required = ['poll_id', 'voter_id', 'selection']
    if not all(k in values for k in required):
        return 'Missing values', 400

    poll_id = values['poll_id']
    voter_id = values['voter_id']
    selection = values['selection']

    if poll_id not in polls:
        return jsonify({'error': 'Poll not found.'}), 404
    
    poll = polls[poll_id]

    if not poll['active']:
        return jsonify({'error': 'This poll has ended.'}), 403

    if voter_id not in poll['eligible_voters']:
        return jsonify({'error': 'You are not eligible to vote in this poll.'}), 403

    if selection not in poll['options']:
        return jsonify({'error': 'Invalid selection.'}), 400

    # Check if voter has already voted by scanning the entire blockchain for this poll
    for block in blockchain.chain:
        for tx in block['transactions']:
            if tx['poll_id'] == poll_id and tx['voter_id'] == voter_id:
                return jsonify({'error': 'You have already voted in this poll.'}), 403

    # Add the vote transaction
    blockchain.new_transaction(voter_id, poll_id, selection)
    
    # "Mine" a new block to confirm the vote
    last_block = blockchain.last_block
    last_proof = last_block['proof']
    proof = blockchain.proof_of_work(last_proof)
    blockchain.new_block(proof, blockchain.hash(last_block))

    return jsonify({'message': 'Your vote has been successfully cast and recorded on the blockchain.'}), 201

@app.route('/poll_status/<poll_id>', methods=['GET'])
def poll_status(poll_id):
    if poll_id not in polls:
        return jsonify({'error': 'Poll not found.'}), 404
    
    poll = polls[poll_id]
    response = {
        'question': poll['question'],
        'options': poll['options'],
        'is_active': poll['active']
    }
    return jsonify(response), 200

@app.route('/results', methods=['POST'])
def get_results():
    values = request.get_json()
    required = ['poll_id']
    if not all(k in values for k in required):
        return 'Missing values', 400
        
    poll_id = values.get('poll_id')
    creator_id = values.get('creator_id') # Optional

    if poll_id not in polls:
        return jsonify({'error': 'Poll not found.'}), 404
        
    poll = polls[poll_id]

    # Access control: allow if poll is inactive OR if a valid creator_id is provided
    if poll['active'] and poll['creator_id'] != creator_id:
        return jsonify({'error': 'Results are not public yet. The poll is still active.'}), 403

    # Tally votes from the blockchain
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

@app.route('/end_poll', methods=['POST'])
def end_poll():
    values = request.get_json()
    required = ['poll_id', 'creator_id']
    if not all(k in values for k in required):
        return 'Missing values', 400

    poll_id = values['poll_id']
    creator_id = values['creator_id']

    if poll_id not in polls:
        return jsonify({'error': 'Poll not found.'}), 404

    if polls[poll_id]['creator_id'] != creator_id:
        return jsonify({'error': 'Invalid creator ID. You do not have permission to end this poll.'}), 403

    polls[poll_id]['active'] = False
    return jsonify({'message': f'Poll {poll_id} has been closed.'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
