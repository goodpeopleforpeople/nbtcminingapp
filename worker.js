// Web Worker untuk mining - standalone (no external deps)
let isWorking = false;
let currentNonce = 0;

// Simple Keccak-256 implementation untuk mining
class SimpleKeccak {
    constructor() {
        this.KECCAK_PADDING = [0x01, 0x80, 0, 0, 0, 0, 0, 0];
        this.SHIFT = [0, 8, 16, 24];
        this.RC = [
            0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
            0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
            0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
            0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
            0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
            0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008
        ];
    }

    keccak256(message) {
        const blocks = this.padMessage(message);
        let state = new Array(50).fill(0);
        
        for (let i = 0; i < blocks.length; i += 34) {
            const block = blocks.slice(i, i + 34);
            for (let j = 0; j < 17; j++) {
                const word = block.slice(j * 4, j * 4 + 4);
                state[j] ^= this.bytesToLong(word);
            }
            state = this.keccakF(state);
        }
        
        return this.stateToHex(state).substring(0, 64);
    }

    padMessage(message) {
        const msgBytes = new TextEncoder().encode(message);
        const padded = [...msgBytes, ...this.KECCAK_PADDING];
        while (padded.length % 136 !== 0) {
            padded.push(0);
        }
        return padded;
    }

    bytesToLong(bytes) {
        let value = 0;
        for (let i = 0; i < 4; i++) {
            value |= (bytes[i] || 0) << this.SHIFT[i];
        }
        return value;
    }

    keccakF(state) {
        // Simplified Keccak permutation
        for (let round = 0; round < 24; round++) {
            // Theta step
            const C = new Array(5);
            const D = new Array(5);
            for (let x = 0; x < 5; x++) {
                C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
            }
            for (let x = 0; x < 5; x++) {
                D[x] = C[(x + 4) % 5] ^ this.rot(C[(x + 1) % 5], 1);
            }
            for (let x = 0; x < 5; x++) {
                for (let y = 0; y < 5; y++) {
                    state[x + 5 * y] ^= D[x];
                }
            }
        }
        return state;
    }

    rot(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }

    stateToHex(state) {
        return state.map(word => 
            word.toString(16).padStart(8, '0')
        ).join('');
    }
}

const keccak = new SimpleKeccak();

self.onmessage = function(event) {
    const { type, address, challengeID, lastBlockTimestamp, difficulty, chainId } = event.data;
    
    if (type === 'START') {
        isWorking = true;
        currentNonce = Math.floor(Math.random() * 1000000);
        startMining(address, challengeID, lastBlockTimestamp, parseInt(difficulty), chainId);
    } else if (type === 'STOP') {
        isWorking = false;
    }
};

function startMining(address, challengeID, lastBlockTimestamp, difficulty, chainId) {
    function mine() {
        if (!isWorking) return;
        
        try {
            // Create hash data sesuai contract
            const dataString = `${challengeID}-${address}-${lastBlockTimestamp}-${chainId}-${currentNonce}`;
            const hash = '0x' + keccak.keccak256(dataString);
            
            // Check difficulty
            const meetsDifficulty = checkDifficulty(hash, difficulty);
            
            self.postMessage({
                nonce: currentNonce,
                hash: hash,
                found: meetsDifficulty
            });
            
            currentNonce++;
            
            // Continue mining
            if (isWorking) {
                setTimeout(mine, 0);
            }
            
        } catch (error) {
            self.postMessage({
                error: error.message
            });
        }
    }
    
    mine();
}

function checkDifficulty(hash, difficulty) {
    // Remove '0x' prefix
    const hashBytes = hash.substring(2);
    
    // Check if first N bytes are 00
    for (let i = 0; i < difficulty; i++) {
        const byte = hashBytes.substring(i * 2, i * 2 + 2);
        if (byte !== '00') {
            return false;
        }
    }
    
    return true;
}
