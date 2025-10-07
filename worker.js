// worker.js

// Impor library keccak256 (Penting: harus menggunakan library yang kompatibel)
// Kita gunakan CDN 'js-sha3' yang lebih ringkas dari ethers.js untuk worker.
importScripts('https://cdn.jsdelivr.net/npm/js-sha3@0.9.2/src/js-sha3.min.js');

// Fungsi utama yang dipanggil untuk memulai pencarian nonce
self.onmessage = function(e) {
    const { challengeData, currentDifficulty } = e.data;
    const challengeDataHex = challengeData.slice(2); // Hapus '0x'
    
    // Target hash: string yang berisi sejumlah nol (misal: "00", "0000")
    const targetPrefix = '00'.repeat(currentDifficulty); 

    let nonce = 0;
    let hash;

    // Mulai loop hashing (brute force)
    while (true) {
        // Gabungkan challengeData dan nonce
        const nonceHex = nonce.toString(16).padStart(64, '0'); // Nonce 64-bit
        const dataToHash = challengeDataHex + nonceHex;

        // Hitung Keccak256 (menggunakan sha3.keccak256 dari js-sha3)
        hash = sha3.keccak256(hexToBytes(dataToHash));
        
        // Cek apakah hash memenuhi target kesulitan
        if (hash.startsWith(targetPrefix)) {
            // Solusi ditemukan! Kirim kembali ke main thread.
            self.postMessage({ nonce, hash: '0x' + hash });
            break; 
        }

        nonce++;

        // Tambahkan cek periodik agar browser tidak crash/hang
        if (nonce % 100000 === 0) {
            // Memberikan kesempatan thread utama untuk update UI
            // dan menerima pesan berhenti/restart
            if (!checkTermination()) break;
        }
    }
};

// Fungsi helper (hex string ke ArrayBuffer/Bytes)
function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

// Logika ini harus disinkronkan dengan _getSolutionHash di SC MiningChallenge.sol
// Pastikan cara Anda menggabungkan data (abi.encodePacked) sama dengan di sini.
// Di kontrak: keccak256(abi.encodePacked(challengeID, miner, lastTimestamp, chainId, nonce))
// Di worker: challengeData sudah mencakup 4 data pertama yang di-pack dan di-hash, lalu digabung dengan nonce.
// Karena kita tidak bisa mendapatkan pack/hash yang sama di JS, kita harus mengambil data hash tantangan dari SC sebagai 'challengeData'.

// CATATAN PENTING: Untuk kesederhanaan, worker ini mengasumsikan challengeData 
// dikirim dalam bentuk satu hex string. Di main.js, Anda harus mendapatkan hash 
// yang dihasilkan dari 4 variabel pertama di SC dan mengirimkannya ke worker.
