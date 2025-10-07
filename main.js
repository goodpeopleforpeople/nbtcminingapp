// Konfigurasi
const CONTRACT_ADDRESS = "0x604799aDB2d80B75FE1F9C1FC817D866f883dD0c";
const ABI = [
    "function mineBlock(uint256 _nonce) external",
    "function getMiningInfo() public view returns (uint256 difficulty, uint256 challengeID, uint256 currentReward, uint256 timeUntilNextHalving, bool canMine)",
    "function verifySolution(address miner, uint256 nonce) public view returns (bool isValid, bytes32 hash)",
    "function getContractBalance() public view returns (uint256)",
    "function currentDifficulty() external view returns (uint256)",
    "function currentChallengeID() external view returns (uint256)",
    "function lastBlockTimestamp() external view returns (uint256)",
    "function DEPLOYMENT_TIMESTAMP() external view returns (uint256)",
    "function lastMineTime(address) external view returns (uint256)",
    "event BlockMined(address indexed miner, uint256 rewardAmount, uint256 challengeID, uint256 newDifficulty, bytes32 solutionHash)"
];

// Global Variables
let provider;
let signer;
let contract;
let minerWorker;
let isMining = false;

// DOM Elements - FIXED IDs sesuai HTML
const networkStatus = document.getElementById('networkStatus');
const walletStatus = document.getElementById('walletStatus');
const activityLog = document.getElementById('activityLog');
const connectBtn = document.getElementById('connectBtn');
const mineBtn = document.getElementById('mineBtn');
const faucetBtn = document.getElementById('faucetBtn');

// Element untuk mining info - FIXED
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

        // Buat provider dari Metamask
        provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Listen untuk account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });

        // Listen untuk chain changes
        window.ethereum.on('chainChanged', (chainId) => {
            window.location.reload();
        });

        // Cek apakah sudah connected
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            await connectWallet();
        }

        await updateNetworkInfo();
        
        logActivity('✅ Aplikasi siap! Hubungkan Metamask untuk mulai mining.');

    } catch (error) {
        logActivity('❌ Error inisialisasi: ' + error.message);
    }
}

async function connectWallet() {
    try {
        logActivity('🔄 Menghubungkan ke Metamask...');
        
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Dapatkan signer
        signer = provider.getSigner();
        const address = await signer.getAddress();
        
        // Buat contract instance
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
        if (chainId === 56) networkName = 'BNB Smart Chain';
        else if (chainId === 97) networkName = 'BNB Testnet';
        else if (chainId === 1) networkName = 'Ethereum Mainnet';
        else if (chainId === 5) networkName = 'Goerli Testnet';
        
        document.getElementById('network').textContent = `${networkName} (${chainId})`;
        networkStatus.className = chainId === 97 ? 'status-box connected' : 'status-box disconnected';
        
        if (chainId !== 97) {
            logActivity('⚠️ Harus menggunakan BNB Testnet (97). Silakan ganti network di Metamask.');
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
        const timeUntilHalving = Math.floor(miningData.timeUntilNextHalving / 86400); // Convert to days
        
        // Update elements - FIXED
        difficultyElement.textContent = difficulty;
        challengeIDElement.textContent = challengeID;
        rewardElement.textContent = reward;
        halvingDaysElement.textContent = timeUntilHalving;
        minerStatusElement.textContent = canMine ? 'Siap Mining' : 'Cooldown';
        
        logActivity(`📊 Mining info updated: Difficulty ${difficulty}, Reward ${reward} NBTC`);
        
    } catch (error) {
        logActivity('❌ Error update mining info: ' + error.message);
        console.error('Update mining error:', error);
    }
}

// Event listeners untuk buttons
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
            logActivity('❌ Harus menggunakan BNB Testnet (ChainID: 97)');
            return;
        }
    });
    
    isMining = true;
    mineBtn.textContent = 'Berhenti Mining';
    mineBtn.classList.add('mining');
    minerStatusElement.textContent = 'Mining...';
    
    // Start Web Worker untuk mining
    minerWorker = new Worker('worker.js');
    
    minerWorker.onmessage = async function(event) {
        const { nonce, hash, found, error } = event.data;
        
        if (error) {
            logActivity('❌ Worker error: ' + error);
            return;
        }
        
        if (found) {
            logActivity(`🎉 Nonce ditemukan: ${nonce}`);
            logActivity(`🔑 Hash: ${hash}`);
            
            try {
                // Verifikasi dulu di on-chain
                const address = await signer.getAddress();
                const verification = await contract.verifySolution(address, nonce);
                
                if (verification.isValid) {
                    logActivity('✅ Nonce valid! Mengirim transaksi...');
                    
                    // Eksekusi mining di blockchain
                    const tx = await contract.mineBlock(nonce);
                    logActivity(`📝 Transaksi dikirim: ${tx.hash}`);
                    
                    const receipt = await tx.wait();
                    logActivity(`✅ Block berhasil ditambang! Gas used: ${receipt.gasUsed.toString()}`);
                    
                    // Update info
                    await updateMiningInfo();
                    
                } else {
                    logActivity('❌ Nonce tidak valid di on-chain');
                }
            } catch (error) {
                logActivity('❌ Error mining: ' + error.message);
                console.error('Mining error:', error);
            }
        } else {
            // Log progress setiap 5000 nonce
            if (nonce % 5000 === 0) {
                logActivity(`⛏️ Mencoba nonce: ${nonce} - Hash: ${hash.substring(0, 16)}...`);
            }
        }
    };
    
    // Dapatkan data untuk worker
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
        
        // Kirim data ke worker
        minerWorker.postMessage({
            type: 'START',
            address: address,
            challengeID: challengeID.toString(),
            lastBlockTimestamp: lastBlockTimestamp.toString(),
            difficulty: difficulty.toString(),
            chainId: chainId.toString()
        });
        
        logActivity(`📊 Mining data: Difficulty ${difficulty}, ChallengeID ${challengeID}`);
        
    } catch (error) {
        logActivity('❌ Error mendapatkan data mining: ' + error.message);
        console.error('Get mining data error:', error);
    }
}

function requestTestnetBNB() {
    if (!signer) {
        logActivity('❌ Harap hubungkan dompet terlebih dahulu');
        return;
    }
    
    // Buka faucet BNB Testnet
    window.open('https://testnet.bnbchain.org/faucet-smart', '_blank');
    logActivity('🔗 Membuka BNB Testnet Faucet...');
}

function logActivity(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}\n`;
    activityLog.textContent += logEntry;
    activityLog.scrollTop = activityLog.scrollHeight;
    console.log(message);
}

// Auto-update mining info setiap 30 detik
setInterval(() => {
    if (contract && signer) {
        updateMiningInfo();
    }
}, 30000);
