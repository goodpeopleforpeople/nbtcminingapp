// Web Worker untuk Proof-of-Work mining
let isWorking = false;
let currentNonce = 0;

// Import ethers (untuk hashing)
importScripts('https://cdn.ethers.io/lib/ethers-5.7.umd.min.js');

self.onmessage = function(event) {
    const { type, address, challengeID, lastBlockTimestamp, difficulty, chainId } = event.data;
    
    if (type === 'START') {
        isWorking = true;
        currentNonce = Math.floor(Math.random() * 1000000); // Start dari random nonce
        startMining(address, challengeID, lastBlockTimestamp, difficulty, chainId);
    } else if (type === 'STOP') {
        isWorking = false;
    }
};

function startMining(address, challengeID, lastBlockTimestamp, difficulty, chainId) {
    function mine() {
        if (!isWorking) return;
        
        try {
            // Encode data sesuai dengan kontrak
            const challengeData = ethers.utils.solidityKeccak256(
                ['uint256', 'address', 'uint256'],
                [challengeID, address, lastBlockTimestamp]
            );
            
            // Hash final dengan nonce dan chainId
            const solutionHash = ethers.utils.solidityKeccak256(
                ['bytes32', 'uint256'],
                [challengeData, currentNonce]
            );
            
            // Cek kesulitan
            const meetsDifficulty = checkDifficulty(solutionHash, parseInt(difficulty));
            
            // Kirim hasil ke main thread
            self.postMessage({
                nonce: currentNonce,
                hash: solutionHash,
                found: meetsDifficulty
            });
            
            currentNonce++;
            
            // Lanjut mining (gunakan setTimeout untuk avoid blocking)
            setTimeout(mine, 0);
            
        } catch (error) {
            self.postMessage({
                error: error.message
            });
        }
    }
    
    mine();
}

function checkDifficulty(hash, difficulty) {
    // Hilangkan '0x' prefix
    const hashBytes = hash.substring(2);
    
    // Cek apakah N byte pertama adalah 0
    for (let i = 0; i < difficulty; i++) {
        const byte = hashBytes.substring(i * 2, i * 2 + 2);
        if (byte !== '00') {
            return false;
        }
    }
    
    return true;
}
