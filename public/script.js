let audioContext, analyser, dataArray, bufferLength;
let recognition;
let audioQueue = [];
let isSpeaking = false;
let wakeLock = null;
let currentAudio;

async function sendMessage(message, language) {
    if (!message) return;

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
    playAudioQueue();
}

function playAudioQueue() {
    if (audioQueue.length === 0) {
        isSpeaking = false;
        return;
    }

    const currentAudioUrl = audioQueue.shift();
    currentAudio = new Audio(currentAudioUrl);

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
        playAudioQueue();
    };

    currentAudio.onerror = (error) => {
        console.error('Audio playback error:', error);
        playAudioQueue();
    };
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
        const transcript = event.results[0][0].transcript;

        if (isSpeaking) {
            if (transcript.toLowerCase().includes('berhenti')) {
                isSpeaking = false;
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                audioQueue = [];
            }
            return;
        }

        if (transcript.toLowerCase().includes('sayang')) {
            const language = detectLanguage(transcript);
            await sendMessage(transcript, language);
        }
    };

    recognition.onend = () => {
        recognition.start();
    };

    recognition.start();
}

function detectLanguage(transcript) {
    const indonesianKeywords = ['apa', 'siapa', 'di mana', 'kapan', 'kenapa', 'bagaimana', 'tolong', 'saya', 'anda', 'bisa', 'mau', 'ingin', 'suka', 'tidak', 'ya'];
    const englishKeywords = ['what', 'who', 'where', 'when', 'why', 'how', 'please', 'I', 'you', 'can', 'want', 'like', 'no', 'yes', 'hello', 'goodbye', 'thanks', 'sorry'];

    const isIndonesian = indonesianKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(transcript.toLowerCase());
    });

    const isEnglish = englishKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(transcript.toLowerCase());
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
    await requestWakeLock();
    startSpeechRecognition();
    setupAudioContext();
    draw();
};
