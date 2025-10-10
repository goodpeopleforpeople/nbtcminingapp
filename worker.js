// Web Worker untuk NBTC Mining - FULL MATCH dengan Smart Contract
let isWorking = false;
let currentNonce = 0;
let batchCount = 0;

// Import ethers untuk hashing yang sama persis dengan contract
importScripts('https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js');

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
    console.log('🚀 Starting MATCHED mining - Difficulty:', difficulty);
    
    function mine() {
        if (!isWorking) return;
        
        try {
            // HASHING YANG SAMA PERSIS DENGAN CONTRACT
            // Contract: keccak256(abi.encodePacked(currentChallengeID, msg.sender, lastBlockTimestamp, block.chainid, _nonce))
            
            const solutionHash = ethers.utils.solidityKeccak256(
                ['uint256', 'address', 'uint256', 'uint256', 'uint256'],
                [challengeID, address, lastBlockTimestamp, chainId, currentNonce]
            );
            
            // Check difficulty - SAMA PERSIS DENGAN CONTRACT
            const meetsDifficulty = checkDifficulty(solutionHash, difficulty);
            
            if (meetsDifficulty) {
                console.log('🎉 VALID SOLUTION FOUND! Nonce:', currentNonce);
                self.postMessage({
                    nonce: currentNonce,
                    hash: solutionHash,
                    found: true
                });
            } else {
                // Progress reporting
                batchCount++;
                if (batchCount % 10000 === 0) {
                    self.postMessage({
                        nonce: currentNonce,
                        hash: solutionHash,
                        found: false
                    });
                }
                
                currentNonce++;
                
                // Continue immediately
                if (isWorking) {
                    setTimeout(mine, 0);
                }
            }
            
        } catch (error) {
            self.postMessage({ error: error.message });
        }
    }
    
    mine();
}

// Difficulty check - SAMA PERSIS DENGAN CONTRACT
function checkDifficulty(hash, difficulty) {
    // Contract logic: for (uint256 i = 0; i < currentDifficulty; i++) { if (uint8(_hash[i]) != 0x00) return false; }
    const hashBytes = ethers.utils.arrayify(hash);
    
    for (let i = 0; i < difficulty; i++) {
        if (hashBytes[i] !== 0x00) {
            return false;
        }
    }
    return true;
}
