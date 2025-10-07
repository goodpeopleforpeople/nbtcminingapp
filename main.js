// main.js
const MINING_CHALLENGE_ADDRESS = "ALAMAT_SC_MINING_ANDA"; // Ganti dengan alamat SC Mining Testnet Anda
const NBTC_TOKEN_ADDRESS = "ALAMAT_NBTC_ANDA"; // Ganti dengan alamat SC NBTC Testnet Anda
const TARGET_CHAIN_ID = 97; // BSC Testnet Chain ID

let provider, signer, miningContract, nbtcContract, worker;
let currentAddress = null;
let currentChallenge = {};
const logElement = document.getElementById('log');

// ABI (Application Binary Interface) yang disederhanakan untuk kontrak MiningChallenge
// Anda harus mendapatkan ABI lengkap dari Remix atau BscScan setelah verifikasi.
const MINING_ABI = [
    "function getMiningInfo() view returns (uint256, uint256, uint256, uint256, bool)",
    "function mineBlock(uint256 _nonce) external",
    // Tambahkan view function lainnya yang Anda butuhkan
];

// --- FUNGSI UTAMA ---

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
            return;
        }
        
        document.getElementById('network').textContent = 'BSC Testnet (OK)';
        document.getElementById('address').textContent = currentAddress.substring(0, 6) + '...' + currentAddress.substring(38);
        
        // Inisialisasi Kontrak
        miningContract = new ethers.Contract(MINING_CHALLENGE_ADDRESS, MINING_ABI, signer);
        // nbtcContract = new ethers.Contract(NBTC_TOKEN_ADDRESS, NBTC_ABI, signer); // Tambahkan jika perlu interaksi langsung

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
        // Panggil getMiningInfo() untuk mendapatkan semua data sekaligus
        const [difficulty, challengeID, reward, timeUntilNextHalving, canMine] = await miningContract.getMiningInfo();

        currentChallenge.difficulty = difficulty.toNumber();
        currentChallenge.challengeID = challengeID.toString();
        currentChallenge.reward = ethers.utils.formatUnits(reward, 8); // Format 8 desimal

        document.getElementById('difficulty').textContent = currentChallenge.difficulty;
        document.getElementById('reward').textContent = currentChallenge.reward;
        
        logMessage('info', `Tantangan Baru: ID ${currentChallenge.challengeID}, D: ${currentChallenge.difficulty}, R: ${currentChallenge.reward} NBTC.`);
        
        if (!canMine) {
             // Opsional: Tampilkan countdown cooldown
             logMessage('info', `Cooldown aktif. Coba lagi dalam ${currentChallenge.cooldown} detik.`);
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

    if (!currentAddress || !currentChallenge.challengeID) {
        logMessage('error', 'Gagal memulai mining: Data tantangan belum siap.');
        return;
    }
    
    // Dapatkan data yang diperlukan untuk hashing (harus sama dengan SC)
    // Ini membutuhkan fungsi view di SC untuk mengembalikan data hash yang sudah di-pack
    // Untuk sederhana, kita akan PANGGIL SC DARI MAIN THREAD UNTUK MENDAPATKAN DATA TANTANGAN
    // Anda mungkin perlu menambahkan fungsi di SC seperti getChallengeDataForHashing()
    
    // **ASUMSI SEMENTARA:** Kita akan hardcode data tantangan, atau dapatkan dari API.
    // Paling baik: Tambahkan fungsi view di SC yang mengembalikan bytes32 tantangan.
    // Misalnya: getChallengeDataForHashing()
    
    // Jika data tantangan sudah berhasil didapatkan:
    document.getElementById('miner-status').textContent = 'Mining (Mencari Nonce...)';
    
    // Simulasikan pengiriman data (Anda harus menyesuaikan ini)
    const simulatedChallengeData = "0x" + ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'address', 'uint256', 'uint256'], // ChallengeID, MinerAddress, Timestamp, ChainID
            [currentChallenge.challengeID, currentAddress, 'timestamp_dummy', TARGET_CHAIN_ID]
        )
    );
    
    worker.postMessage({
        challengeData: simulatedChallengeData,
        currentDifficulty: currentChallenge.difficulty
    });
    logMessage('info', 'Web Worker berjalan...');
}


async function handleWorkerMessage(e) {
    const { nonce, hash } = e.data;
    if (nonce) {
        document.getElementById('miner-status').textContent = 'Solusi ditemukan! Mengirim transaksi...';
        logMessage('success', `Nonce ditemukan: ${nonce}. Hash: ${hash.substring(0, 10)}...`);
        
        // Hentikan worker agar tidak menemukan solusi yang tidak relevan lagi
        worker.terminate(); 
        worker = null;
        
        // Kirim transaksi ke smart contract
        try {
            const tx = await miningContract.mineBlock(nonce);
            logMessage('info', `Transaksi terkirim: ${tx.hash}`);
            await tx.wait(); // Tunggu konfirmasi blok
            logMessage('success', 'BLOK DITAMBANG! Hadiah diklaim. Memuat tantangan baru...');

            // Setelah sukses, update status dan restart worker
            await updateMiningStatus();
            startMining(); 

        } catch (error) {
            logMessage('error', `Transaksi GAGAL: ${error.message.substring(0, 150)}...`);
            document.getElementById('miner-status').textContent = 'Gagal. Restart Mining.';
            startMining(); // Coba mining lagi dengan tantangan baru
        }
    }
}

// --- FUNGIONALITAS LAINNYA ---

function logMessage(type, message) {
    const p = document.createElement('p');
    p.className = type;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.prepend(p);
}

function requestFaucet() {
    if (!currentAddress) {
        logMessage('error', 'Harap hubungkan dompet terlebih dahulu.');
        return;
    }
    logMessage('info', `Permintaan BNB Testnet untuk ${currentAddress} dikirim.`);
    // Anda harus mengarahkan pengguna ke platform (Discord/Telegram) Anda 
    // atau menggunakan API backend ringan untuk mentransfer BNB Testnet secara otomatis.
    // Untuk saat ini, informasikan pengguna untuk menghubungi Anda secara manual.
}


// --- EVENT LISTENERS ---

document.getElementById('connect-button').addEventListener('click', connectWallet);
document.getElementById('start-mining-button').addEventListener('click', startMining);
document.getElementById('faucet-button').addEventListener('click', requestFaucet);

// Mulai update status setelah halaman dimuat (untuk menampilkan data awal)
// Note: Panggil updateMiningStatus() hanya setelah Metamask terhubung.
