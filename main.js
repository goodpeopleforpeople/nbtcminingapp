// Konfigurasi
const CONTRACT_ADDRESS = "0x8f6868373aAe040E7F41a34F5Ea4E9Eb812DA334"; // MiningChallenge address
const ABI = [
    // Mining functions
    "function mineBlock(uint256 _nonce) external",
    "function claimReward() external",
    "function canClaimReward(address user) external view returns (bool)",
    "function getPendingReward(address user) external view returns (uint256)",
    
    // View functions  
    "function getMiningInfo() external view returns (uint256 difficulty, uint256 challengeID, uint256 currentReward, uint256 timeUntilNextHalving, bool canMine, uint256 yourPendingRewards, uint256 minClaimAmount)",
    "function getContractBalance() external view returns (uint256)",
    "function currentDifficulty() external view returns (uint256)",
    "function currentChallengeID() external view returns (uint256)",
    "function lastBlockTimestamp() external view returns (uint256)",
    "function DEPLOYMENT_TIMESTAMP() external view returns (uint256)",
    "function lastMineTime(address) external view returns (uint256)",
    
    // Events
    "event BlockMined(address indexed miner, uint256 reward, uint256 challengeID, uint256 difficulty, bytes32 hash)",
    "event RewardClaimed(address indexed miner, uint256 amount)"
];

// Global Variables
let provider;
let signer;
let contract;
let minerWorker;
let isMining = false;

// DOM Elements
const networkStatus = document.getElementById('networkStatus');
const walletStatus = document.getElementById('walletStatus');
const activityLog = document.getElementById('activityLog');
const connectBtn = document.getElementById('connectBtn');
const mineBtn = document.getElementById('mineBtn');
const faucetBtn = document.getElementById('faucetBtn');

// Mining info elements
const difficultyElement = document.getElementById('difficulty');
const challengeIDElement = document.getElementById('challengeID');
const rewardElement = document.getElementById('reward');
const halvingDaysElement = document.getElementById('halvingDays');
const minerStatusElement = document.getElementById('minerStatus');

// Initialize
window.addEventListener('load', async () => {
    await initializeApp();
});

async function initializeApp() {
    try {
        // Cek apakah Metamask terinstall
        if (typeof window.ethereum === 'undefined') {
            logActivity('❌ Metamask tidak terdeteksi. Silakan install Metamask.');
            return;
        }

        provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Event listeners untuk Metamask
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            window.location.reload();
        });

        // Cek koneksi existing
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            await connectWallet();
        }

        await updateNetworkInfo();
        logActivity('✅ Aplikasi siap! Hubungkan Metamask untuk mulai mining.');

    } catch (error) {
        logActivity('❌ Error inisialisasi: ' + error.message);
        console.error(error);
    }
}

async function connectWallet() {
    try {
        logActivity('🔄 Menghubungkan ke Metamask...');
        
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        signer = provider.getSigner();
        const address = await signer.getAddress();
        
        contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        
        // Update UI
        document.getElementById('address').textContent = `${address.substring(0, 6)}...${address.substring(38)}`;
        walletStatus.className = 'status-box connected';
        connectBtn.textContent = 'Terhubung';
        connectBtn.disabled = true;
        mineBtn.disabled = false;
        
        await updateMiningInfo();
        logActivity(`✅ Berhasil terhubung: ${address}`);
        
    } catch (error) {
        logActivity('❌ Gagal menghubungkan dompet: ' + error.message);
    }
}

function disconnectWallet() {
    if (isMining) stopMining();
    
    signer = null;
    contract = null;
    document.getElementById('address').textContent = 'Belum terhubung';
    walletStatus.className = 'status-box disconnected';
    connectBtn.textContent = 'Hubungkan Metamask';
    connectBtn.disabled = false;
    mineBtn.disabled = true;
    
    // Reset mining info
    difficultyElement.textContent = 'N/A';
    challengeIDElement.textContent = 'N/A';
    rewardElement.textContent = 'N/A';
    halvingDaysElement.textContent = 'N/A';
    minerStatusElement.textContent = 'Siap Memulai';
    
    logActivity('🔌 Dompet terputus');
}

async function updateNetworkInfo() {
    try {
        if (!provider) return;
        
        const network = await provider.getNetwork();
        const chainId = network.chainId;
        
        let networkName = 'Unknown';
        if (chainId === 56) networkName = 'BSC Mainnet';
        else if (chainId === 97) networkName = 'BSC Testnet';
        else if (chainId === 1) networkName = 'Ethereum Mainnet';
        
        document.getElementById('network').textContent = `${networkName} (${chainId})`;
        networkStatus.className = chainId === 97 ? 'status-box connected' : 'status-box disconnected';
        
        if (chainId !== 97) {
            logActivity('⚠️ Harus menggunakan BSC Testnet (97). Silakan ganti network di Metamask.');
        }
        
    } catch (error) {
        document.getElementById('network').textContent = 'Error';
        networkStatus.className = 'status-box disconnected';
    }
}

async function updateMiningInfo() {
    try {
        if (!contract) return;
        
        const miningData = await contract.getMiningInfo();
        const difficulty = miningData.difficulty.toString();
        const reward = ethers.utils.formatUnits(miningData.currentReward, 8);
        const canMine = miningData.canMine;
        const challengeID = miningData.challengeID.toString();
        const timeUntilHalving = Math.floor(miningData.timeUntilNextHalving / 86400);
        const pendingRewards = ethers.utils.formatUnits(miningData.yourPendingRewards, 8);
        
        // Update UI
        difficultyElement.textContent = difficulty;
        challengeIDElement.textContent = challengeID;
        rewardElement.textContent = reward;
        halvingDaysElement.textContent = timeUntilHalving;
        minerStatusElement.textContent = canMine ? 'Siap Mining' : 'Cooldown';
        
        // Log jika ada pending rewards
        if (parseFloat(pendingRewards) > 0) {
            logActivity(`💰 Pending rewards: ${pendingRewards} NBTC`);
        }
        
    } catch (error) {
        logActivity('❌ Error update mining info: ' + error.message);
        console.error('Update mining error:', error);
    }
}

// Event listeners
connectBtn.addEventListener('click', connectWallet);
mineBtn.addEventListener('click', toggleMining);
faucetBtn.addEventListener('click', requestTestnetBNB);

function toggleMining() {
    if (isMining) {
        stopMining();
    } else {
        startMining();
    }
}

function startMining() {
    if (!contract || !signer) {
        logActivity('❌ Harap hubungkan dompet terlebih dahulu');
        return;
    }
    
    // Cek network
    provider.getNetwork().then(network => {
        if (network.chainId !== 97) {
            logActivity('❌ Harus menggunakan BSC Testnet (ChainID: 97)');
            return;
        }
    });
    
    isMining = true;
    mineBtn.textContent = 'Berhenti Mining';
    mineBtn.classList.add('mining');
    minerStatusElement.textContent = 'Mining...';
    
    // Start Web Worker
    minerWorker = new Worker('worker.js');
    
    minerWorker.onmessage = async function(event) {
        const { nonce, hash, found, error } = event.data;
        
        if (error) {
            logActivity('❌ Worker error: ' + error);
            return;
        }
        
        if (found) {
            logActivity(`🎉 Solution found! Nonce: ${nonce}`);
            logActivity(`🔑 Hash: ${hash}`);
            
            try {
                // Submit ke blockchain
                const tx = await contract.mineBlock(nonce);
                logActivity(`📝 Transaksi dikirim: ${tx.hash}`);
                
                const receipt = await tx.wait();
                logActivity(`✅ Block mined! Gas used: ${receipt.gasUsed.toString()}`);
                
                await updateMiningInfo();
                
            } catch (error) {
                if (error.message.includes('cooldown')) {
                    logActivity('⏳ Cooldown active, tunggu 30 detik');
                } else if (error.message.includes('Invalid hash')) {
                    logActivity('❌ Hash tidak valid, terus mining...');
                } else {
                    logActivity('❌ Mining error: ' + error.message);
                }
            }
        } else {
            // Progress log
            if (nonce % 10000 === 0) {
                logActivity(`⛏️ Testing nonce: ${nonce}...`);
            }
        }
    };
    
    // Get mining data untuk worker
    getMiningDataForWorker();
    logActivity('⛏️ Memulai mining...');
}

function stopMining() {
    if (minerWorker) {
        minerWorker.terminate();
        minerWorker = null;
    }
    
    isMining = false;
    mineBtn.textContent = 'Mulai Mining';
    mineBtn.classList.remove('mining');
    minerStatusElement.textContent = 'Dihentikan';
    logActivity('⏹️ Mining dihentikan');
}

async function getMiningDataForWorker() {
    try {
        const address = await signer.getAddress();
        const challengeID = await contract.currentChallengeID();
        const lastBlockTimestamp = await contract.lastBlockTimestamp();
        const difficulty = await contract.currentDifficulty();
        const chainId = (await provider.getNetwork()).chainId;
        
        minerWorker.postMessage({
            type: 'START',
            address: address,
            challengeID: challengeID.toString(),
            lastBlockTimestamp: lastBlockTimestamp.toString(),
            difficulty: difficulty.toString(),
            chainId: chainId.toString()
        });
        
    } catch (error) {
        logActivity('❌ Error getting mining data: ' + error.message);
    }
}

function requestTestnetBNB() {
    if (!signer) {
        logActivity('❌ Harap hubungkan dompet terlebih dahulu');
        return;
    }
    
    window.open('https://testnet.bnbchain.org/faucet-smart', '_blank');
    logActivity('🔗 Membuka BSC Testnet Faucet...');
}

function logActivity(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}\n`;
    activityLog.textContent += logEntry;
    activityLog.scrollTop = activityLog.scrollHeight;
}

// Auto-update setiap 30 detik
setInterval(() => {
    if (contract && signer) {
        updateMiningInfo();
    }
}, 30000);
