let audioContext, analyser, dataArray, bufferLength;
let recognition;
let audioQueue = [];
let currentTrackIndex = 0; // Indeks track yang sedang diputar
let isSpeaking = false;
let isPlaylist = false;
let wakeLock = null;
let currentAudio;
let volumeLevel = 0.3;
let isWaitingForCommand = false;
let commandTimeout;

async function sendMessage(message, language) {
    if (!message) return;
    
    currentAudio = new Audio('./notify.mp3');
    currentAudio.volume = volumeLevel;
    await currentAudio.play();

    isSpeaking = true;
    document.getElementById('status').innerText = 'AI is searching...'

    const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, language }),
    });

    const data = await response.json();
    audioQueue = data.audioUrl;
    if (data.response === "hay, aku disini, ada yang bisa saya bantu?") {
        isWaitingForCommand = true; // Aktifkan mode menunggu perintah tanpa kata pemicu
    }
    if (data.response === "playlist") {
        isPlaylist = true; // Aktifkan mode menunggu perintah tanpa kata pemicu
        currentTrackIndex = 0; 
    }
    if (data.response === "video") {
        currentAudio = new Audio(data.audioUrl);
        currentAudio.volume = volumeLevel;
        await currentAudio.play();
        setTimeout(() => {
            playVideo(data);
        }, 4000);
        document.getElementById('status').innerHTML = '&nbsp;';
        return;
    }
    playAudio();
    return data;
}

function playAudio() {
    if (audioQueue.length === 0) {
        isSpeaking = false;
        if (isWaitingForCommand) {
            startCommandTimer(); // Mulai pengatur waktu untuk menunggu perintah dari pengguna
        }
        return;
    }
    recognition.stop();

    if (isPlaylist) {
        currentAudio = new Audio(audioQueue[currentTrackIndex]);
    } else {
        currentAudio = new Audio(audioQueue.shift());
    }
    currentAudio.volume = volumeLevel;
    document.getElementById('status').innerHTML = '&nbsp;';
     
    currentAudio.addEventListener('canplay', () => {
        if (!isSpeaking) {
            return;
        }
        const source = audioContext.createMediaElementSource(currentAudio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        currentAudio.play();
        draw();
    });

    currentAudio.onended = () => {
        if (isPlaylist) {
            currentTrackIndex++; 
            if (currentTrackIndex < audioQueue.length) {
                playAudio();
            } else {
                isSpeaking = false;
                isPlaylist = false;
            }
        } else {
            playAudio();
        }
    };
    

    currentAudio.onerror = (error) => {
        console.error('Audio playback error:', error);
        playAudio();
    };
}

function playVideo(data) {
    const videoPlayer = document.getElementById('videoPlayer');
    document.getElementById('videoModal').classList.remove('hidden');
    document.getElementById('videoSource').src = data.videoUrl;
    videoPlayer.volume = volumeLevel;
    videoPlayer.load();
    videoPlayer.play(); // Memutar video
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock berhasil diaktifkan');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            await wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock berhasil dinonaktifkan');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await requestWakeLock();
    } else {
        await releaseWakeLock();
    }
});

function startSpeechRecognition() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.interimResults = false;

    recognition.onstart = () => {};

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log(transcript)

        if (transcript.match(/(atur|setting).*volume/)) {
            const volumeMatch = transcript.match(/(\d{1,3})%?/); // Cari angka dalam perintah
            if (volumeMatch) {
                const volumeValue = parseInt(volumeMatch[1], 10);
                if (volumeValue >= 0 && volumeValue <= 100) {
                    await setVolume(volumeValue / 100); // Ubah volume dalam skala 0-1
                    console.log(`Volume diatur ke ${volumeValue}%`);
                    return;
                }
            }
        } else if (transcript.match(/(tambahkan|naikkan|besarkan).*volume|lebih keras|increase|turn up|make it louder/)) {
            const volumeMatch = transcript.match(/(\d{1,3})%?/); // Cari angka dalam perintah
            if (volumeMatch) {
                const volumeValue = parseInt(volumeMatch[1], 10);
                if (Math.round(volumeLevel * 100) >= volumeValue) return;
                if (volumeValue >= 0 && volumeValue <= 100) {
                    await setVolume(volumeValue / 100); // Ubah volume dalam skala 0-1
                    console.log(`Volume diatur ke ${volumeValue}%`);
                    return;
                }
            } else {
                await setVolume(Math.max(volumeLevel + 0.1, 0)); // Turunkan volume 10%
            }
            console.log(`Volume diatur ke ${volumeLevel}%`);
            return;
        } else if (transcript.match(/(kurangi|turunkan|kecilkan).*volume|lebih pelan|decrease|turn down|make it quieter/)) {
            const volumeMatch = transcript.match(/(\d{1,3})%?/); // Cari angka dalam perintah
            if (volumeMatch) {
                const volumeValue = parseInt(volumeMatch[1], 10);
                if (Math.round(volumeLevel * 100) <= volumeValue) return;
                if (volumeValue >= 0 && volumeValue <= 100) {
                    await setVolume(volumeValue / 100); // Ubah volume dalam skala 0-1
                    console.log(`Volume diatur ke ${volumeValue}%`);
                    return;
                }
            } else {
                await setVolume(Math.max(volumeLevel - 0.1, 0)); // Turunkan volume 10%
            }
            console.log(`Volume diatur ke ${volumeLevel}%`);
            return;
        }

        if (transcript.match(/(tambahkan|masukan).*playlist/)) {
            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
            return;
        } else if (transcript.match(/(hapus).*playlist/)) {
            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
            return;
        } else if (transcript.match(/(tampilkan).*playlist/)) {
            const language = detectLanguage(transcript);
            const text = await sendMessage(transcript, language);
            document.getElementById('notepadModal').classList.remove('hidden');
            document.getElementById('notepadContent').value = text.response;
            return;
        } else if (transcript.match(/(putar).*playlist/)) {
            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
            return;
        }

        if (document.getElementById('videoModal').classList.contains('hidden') === false) {
            if (transcript.match(/(tutup|close).*video/)) {
                isSpeaking = false;
                const videoPlayer = document.getElementById('videoPlayer');
                videoPlayer.pause(); // Hentikan pemutaran video
                videoPlayer.currentTime = 0; // Kembalikan ke awal
                document.getElementById('videoModal').classList.add('hidden');
                return;
            }
        }
        if (document.getElementById('notepadModal').classList.contains('hidden') === false) {
            if (transcript.match(/(tutup|close).*playlist/)) {
                document.getElementById('notepadModal').classList.add('hidden');
                document.getElementById('notepadContent').value = '';
                return;
            }
        }

        if (isSpeaking) {
            if (isPlaylist) {
                if (transcript.match(/(skip|lewatkan).*audio|track|lagu/)) {
                    if (currentTrackIndex < audioQueue.length - 1) {
                        currentAudio.pause(); // Hentikan audio yang sedang diputar
                        currentAudio.currentTime = 0; // Reset waktu pemutaran
                        currentTrackIndex++;
                        playAudio(); // Mainkan track berikutnya
                    } else {
                        console.log('Ini adalah track terakhir.');
                    }
                    return;
                } else if (transcript.match(/(sebelumnya|previous).*audio|track|lagu/)) {
                    if (currentTrackIndex > 0) {
                        currentAudio.pause(); // Hentikan audio yang sedang diputar
                        currentAudio.currentTime = 0; // Reset waktu pemutaran
                        currentTrackIndex--;
                        playAudio(); // Mainkan track sebelumnya
                    } else {
                        console.log('Ini adalah track pertama.');
                    }
                    return;
                }                
            }
            if (['berhenti', 'stop'].some(keyword => transcript.includes(keyword))) {
                if (document.getElementById('videoModal').classList.contains('hidden') === false) {
                    document.getElementById('videoPlayer').pause(); // Hentikan pemutaran video
                    return;
                } else {
                    isSpeaking = false;
                    isPlaylist = false;
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio.currentTime = 0;
                    }
                    audioQueue = [];
                }
            } else if (transcript.match(/(lanjutkan).*video|lanjutkan/)) {
                document.getElementById('videoPlayer').play(); // Hentikan pemutaran video
                return;
            } else if (transcript.match(/(atur|setting).*durasi/)) {
                const timeMatch = transcript.match(/(\d+)(\s?(detik|menit))/); // Cari angka dan satuan waktu dalam perintah
                if (timeMatch) {
                    let timeValue = parseInt(timeMatch[1], 10); // Ambil angka waktu
                    const timeUnit = timeMatch[2]; // Ambil satuan waktu (detik/menit)
                    if (timeUnit.includes('menit')) {
                        timeValue *= 60; // Jika satuan waktu menit, konversi ke detik
                    }
                    const videoPlayer = document.getElementById('videoPlayer');
                    videoPlayer.currentTime = timeValue; // Atur waktu pemutaran video
                    console.log(`Waktu video diatur ke ${timeValue} detik`);
                    return;
                }
            }
            return;
        }

        // Jika sedang dalam mode menunggu perintah setelah "Hay, aku di sini"
        if (isWaitingForCommand) {
            clearTimeout(commandTimeout); // Reset timer ketika ada perintah
            isWaitingForCommand = false;

            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
            return;
        } else if (transcript.includes('sayang')) {
            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
            return;
        }
    };

    recognition.onend = () => {
        if (isWaitingForCommand) {
            // Tambahkan jeda sebelum memulai mendengarkan lagi
            setTimeout(() => {
                recognition.start();
            }, 4000); // Jeda 2 detik sebelum AI mulai mendengarkan lagi
        } else {
            recognition.start(); // Jika tidak menunggu perintah, langsung mulai lagi
        }
    };

    recognition.start();
}

function startCommandTimer() {
    // Set waktu tunggu 3 detik setelah AI merespon
    commandTimeout = setTimeout(() => {
        isWaitingForCommand = false; // Nonaktifkan mode menunggu perintah
    }, 5000); // 3000 ms = 3 detik
}

function detectLanguage(transcript) {
    const indonesianKeywords = ['apa', 'siapa', 'di mana', 'kapan', 'kenapa', 'bagaimana', 'tolong', 'saya', 'anda', 'bisa', 'mau', 'ingin', 'suka', 'tidak', 'ya'];
    const englishKeywords = ['what', 'who', 'where', 'when', 'why', 'how', 'please', 'I', 'you', 'can', 'want', 'like', 'no', 'yes', 'hello', 'goodbye', 'thanks', 'sorry'];

    const isIndonesian = indonesianKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(transcript);
    });

    const isEnglish = englishKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(transcript);
    });

    if (isIndonesian) {
        return 'id';
    } else if (isEnglish) {
        return 'en';
    } else {
        return 'id';
    }
}

// Setup Audio Context dan Analyser
function setupAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function setVolume(level) {
    if (currentAudio) {
        volumeLevel = Math.max(0, Math.min(level, 1)); // Pastikan nilai antara 0 dan 1
        document.getElementById('volumeLevel').style.width = Math.round(volumeLevel * 100) + '%'
        document.getElementById('volumePercentage').innerText = 'volume ' + Math.round(volumeLevel * 100) + '%'
        document.getElementById('videoPlayer').volume = volumeLevel
        currentAudio.volume = volumeLevel;
    }
}

// Fungsi untuk menggambar visualizer
function draw() {
    const canvas = document.getElementById('audioVisualizer');
    const canvasCtx = canvas.getContext('2d');

    requestAnimationFrame(draw);  // Pastikan draw terus dijalankan
    analyser.getByteTimeDomainData(dataArray);  // Ambil data frekuensi audio

    // Hapus pengisian canvas atau set transparan
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);  // Membersihkan canvas tanpa mengisi dengan warna solid

    // Mengatur warna dan ketebalan garis
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)';  // Tetap dengan warna hitam atau ubah jika diperlukan

    canvasCtx.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

window.onload = async function() {
    currentAudio = new Audio('');
    await requestWakeLock();
    await startSpeechRecognition();
    await setupAudioContext();
    await draw();
};
