// worker.js

// Impor library keccak256
importScripts('https://cdn.jsdelivr.net/npm/js-sha3@0.9.2/src/js-sha3.min.js');

// Fungsi helper untuk padding ke 64 bit (32 byte)
function padHex(hex, length = 64) {
    return hex.length < length ? '0'.repeat(length - hex.length) + hex : hex;
}

// Fungsi helper (hex string ke ArrayBuffer/Bytes)
function hexToBytes(hex) {
    // Hapus 0x jika ada
    if (hex.startsWith('0x')) {
        hex = hex.substring(2);
    }
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

// Fungsi utama yang dipanggil untuk memulai pencarian nonce
self.onmessage = function(e) {
    // Data yang Diharapkan dari main.js (Semua komponen mentah)
    const { 
        challengeID, 
        minerAddress, 
        lastBlockTimestamp, 
        chainId, 
        currentDifficulty 
    } = e.data;

    const targetPrefix = '00'.repeat(currentDifficulty);
    
    // Siapkan data statis (A, B, C, D) dalam format hex tanpa 0x
    const idHex = padHex(parseInt(challengeID).toString(16)); // 32-byte padding
    const minerHex = padHex(minerAddress.slice(2), 40);      // 20-byte address
    const timestampHex = padHex(parseInt(lastBlockTimestamp).toString(16));
    const chainIdHex = padHex(parseInt(chainId).toString(16));
    
    let nonce = 0;
    let hash;

    // Mulai loop hashing
    while (true) {
        // Gabungkan data mentah (A+B+C+D+E) untuk meniru abi.encodePacked
        const nonceHex = padHex(nonce.toString(16));
        
        // Gabungkan SEMUA data mentah yang di-pad (meniru abi.encodePacked)
        const dataToHash = idHex + minerHex + timestampHex + chainIdHex + nonceHex;

        // Hitung Keccak256 (Hanya SATU KALI HASHING)
        hash = sha3.keccak256(hexToBytes(dataToHash));
        
        // Cek kesulitan
        if (hash.startsWith(targetPrefix)) {
            self.postMessage({ nonce, hash: '0x' + hash });
            break; 
        }

        nonce++;

        // Cek periodik
        if (nonce % 100000 === 0) {
            // Anda harus mengirim pesan khusus dari main.js untuk menghentikan worker (misalnya, { stop: true })
            // Karena tidak ada implementasi checkTermination() di sini, kita lewati.
        }
    }
};
