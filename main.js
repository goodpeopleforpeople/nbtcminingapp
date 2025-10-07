// main.js - DApp Frontend Logic for NBTC PoW Mining

// --- Konfigurasi Kontrak dan Jaringan ---
// PASTIKAN ALAMAT INI BENAR
const MINING_CHALLENGE_ADDRESS = "0x604799aDB2d80B75FE1F9C1FC817D866f883dD0c";
const TARGET_CHAIN_ID = 97; // BSC Testnet Chain ID

let provider, signer, miningContract, worker;
let currentAddress = null;
let currentChallenge = {}; // Menyimpan difficulty, challengeID, reward, dan lastBlockTimestamp
const logElement = document.getElementById('log');

// --- ABI yang Diperbarui ---
const MINING_ABI = [
    // Fungsi Utama Mining
    "function mineBlock(uint256 _nonce) external",
    // Fungsi View untuk Status
    "function getMiningInfo() view returns (uint256, uint256, uint256, uint256, bool)",
    // Fungsi View Baru: Wajib Ditambahkan di Kontrak Solidity
    "function getLastBlockTimestamp() view returns (uint256)", 
];

// ----------------------
// --- FUNGSI UTAMA ---
// ----------------------

async function connectWallet() {
    if (!window.ethereum) {
        logMessage('error', 'Metamask tidak terdeteksi. Silakan instal!');
        return;
    }

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        currentAddress = await signer.getAddress();
        
        // Cek Jaringan
        const { chainId } = await provider.getNetwork();
        if (chainId !== TARGET_CHAIN_ID) {
            logMessage('error', `Harap ganti ke BSC Testnet (Chain ID: ${TARGET_CHAIN_ID})`);
            document.getElementById('network').textContent = `Salah (${chainId})`;
            // Meminta Metamask untuk switch ke jaringan yang benar (opsional, tapi disarankan)
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(TARGET_CHAIN_ID) }],
            });
            // Setelah switch, koneksi harus diulang atau Metamask akan me-reload
            return;
        }
        
        document.getElementById('network').textContent = 'BSC Testnet (OK)';
        document.getElementById('address').textContent = currentAddress.substring(0, 6) + '...' + currentAddress.substring(38);
        
        // Inisialisasi Kontrak
        miningContract = new ethers.Contract(MINING_CHALLENGE_ADDRESS, MINING_ABI, signer);

        document.getElementById('start-mining-button').disabled = false;
        logMessage('success', 'Dompet terhubung & Kontrak siap.');

        await updateMiningStatus();

    } catch (error) {
        logMessage('error', `Koneksi gagal: ${error.message}`);
    }
}

async function updateMiningStatus() {
    if (!miningContract) return;

    try {
        // Panggil getMiningInfo() untuk status umum
        const [difficulty, challengeID, reward, timeUntilNextHalving, canMine] = await miningContract.getMiningInfo();
        
        // Panggil getLastBlockTimestamp() untuk data hashing KRITIS
        const lastBlockTimestamp = await miningContract.getLastBlockTimestamp();

        currentChallenge.difficulty = difficulty.toNumber();
        currentChallenge.challengeID = challengeID.toString();
        currentChallenge.reward = ethers.utils.formatUnits(reward, 8); // Format 8 desimal
        currentChallenge.lastBlockTimestamp = lastBlockTimestamp.toString(); // Penting untuk hashing worker

        document.getElementById('difficulty').textContent = currentChallenge.difficulty;
        document.getElementById('reward').textContent = currentChallenge.reward;
        
        logMessage('info', `Tantangan Baru: ID ${currentChallenge.challengeID}, D: ${currentChallenge.difficulty}, R: ${currentChallenge.reward} NBTC.`);
        
        if (!canMine) {
             // Tampilkan countdown cooldown (bisa ditambahkan logika di sini)
             logMessage('info', `Cooldown aktif. Coba lagi sebentar.`);
             document.getElementById('miner-status').textContent = 'Cooldown Aktif';
        } else {
             document.getElementById('miner-status').textContent = 'Siap Memulai';
        }

    } catch (error) {
        logMessage('error', `Gagal memuat status mining: ${error.message}`);
    }
}


function startMining() {
    if (!worker) {
        worker = new Worker('worker.js');
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (e) => logMessage('error', `Worker Error: ${e.message}`);
    }

    if (!currentAddress || !currentChallenge.challengeID || !currentChallenge.lastBlockTimestamp) {
        logMessage('error', 'Gagal memulai mining: Data tantangan belum siap.');
        return;
    }
    
    document.getElementById('miner-status').textContent = 'Mining (Mencari Nonce...)';
    
    // Kirim SEMUA komponen data mentah ke worker untuk meniru abi.encodePacked
    worker.postMessage({
        challengeID: currentChallenge.challengeID,
        minerAddress: currentAddress,
        lastBlockTimestamp: currentChallenge.lastBlockTimestamp, 
        chainId: TARGET_CHAIN_ID,
        currentDifficulty: currentChallenge.difficulty
    });

    logMessage('info', 'Web Worker berjalan...');
}


async function handleWorkerMessage(e) {
    const { nonce, hash } = e.data;
    if (nonce) {
        document.getElementById('miner-status').textContent = 'Solusi ditemukan! Mengirim transaksi...';
        logMessage('success', `Nonce ditemukan: ${nonce}. Hash: ${hash.substring(0, 10)}...`);
        
        // Hentikan worker
        worker.terminate(); 
        worker = null;
        
        // Kirim transaksi mineBlock ke smart contract
        try {
            const tx = await miningContract.mineBlock(nonce);
            logMessage('info', `Transaksi terkirim: ${tx.hash}`);
            await tx.wait(); // Tunggu konfirmasi blok
            logMessage('success', 'BLOK DITAMBANG! Hadiah diklaim. Memuat tantangan baru...');

            // Setelah sukses, update status dan RESTART mining
            await updateMiningStatus();
            startMining(); 

        } catch (error) {
            // Tangkap error Metamask (misalnya, gas tidak cukup, atau nonce salah)
            let errorMessage = error.message || "Transaksi gagal.";
            if (errorMessage.includes("cooldown")) {
                errorMessage = "Mining cooldown in effect. Coba sebentar lagi.";
            } else if (errorMessage.includes("invalid nonce")) {
                errorMessage = "Nonce sudah kadaluarsa (Block lain lebih cepat). Restarting...";
            }
            
            logMessage('error', `Transaksi GAGAL: ${errorMessage.substring(0, 150)}`);
            document.getElementById('miner-status').textContent = 'Gagal. Restarting...';
            
            // Perbarui status sebelum memulai lagi
            await updateMiningStatus(); 
            startMining();
        }
    }
}

// ----------------------------
// --- FUNGIONALITAS LAINNYA ---
// ----------------------------

function logMessage(type, message) {
    const p = document.createElement('p');
    p.className = type;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.prepend(p);
    // Batasi log agar tidak terlalu panjang
    while (logElement.children.length > 50) {
        logElement.removeChild(logElement.lastChild);
    }
}

function requestFaucet() {
    if (!currentAddress) {
        logMessage('error', 'Harap hubungkan dompet terlebih dahulu.');
        return;
    }
    logMessage('info', `Akses Faucet Testnet: Kunjungi situs resmi Faucet BNB Testnet.`);
    // Opsi: Anda bisa mengarahkan pengguna ke tautan Faucet
    window.open("https://testnet.bnbchain.org/faucet-48", "_blank");
}


// --- EVENT LISTENERS ---

document.getElementById('connect-button').addEventListener('click', connectWallet);
document.getElementById('start-mining-button').addEventListener('click', startMining);
document.getElementById('faucet-button').addEventListener('click', requestFaucet);

// Note: Tidak memanggil updateMiningStatus() di luar, karena membutuhkan Metamask.
