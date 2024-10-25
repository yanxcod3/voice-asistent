let recognition; // Declare recognition at a higher scope
let audio; // Store the audio instance for control
let isSpeaking = false; // Flag to check if AI is currently speaking

// Function to send a message to the server
async function sendMessage(message, language) {
    if (!message) return;
    recognition.stop();

    isSpeaking = true; // Set speaking flag to true

    // Send the message to the server
    const response = await fetch('/api/message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, language }), // Send the message and language
    });

    const data = await response.json();
    audio = new Audio(data.audioUrl);
    audio.play();

    audio.onended = () => {
        isSpeaking = false; // Reset flag after speaking ends
        startSpeechRecognition(); // Resume listening after audio ends
    };

    audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        isSpeaking = false; // Reset flag on error
        startSpeechRecognition(); // Resume listening on error
    };
}

// Function to start speech recognition
function startSpeechRecognition() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'id-ID'; // Set default language to Indonesian
    recognition.interimResults = false;

    recognition.onstart = () => {
        document.getElementById('status').innerText = 'AI is listening...';
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('status').innerText = 'AI is listening...'; // Keep status during listening
        
        // Detect language from user input
        if (transcript.toLowerCase().includes('sayang')) {
            const language = detectLanguage(transcript); // Get language from transcript
            await sendMessage(transcript, language); // Send transcript and language as a message
        }
    };

    recognition.onend = () => {
        document.getElementById('status').innerText = 'AI is speaking...'; // Update status
        // Only restart recognition if not currently speaking
        if (!isSpeaking) {
            startSpeechRecognition(); // Restart recognition if not speaking
        }
    };

    recognition.start(); // Start listening
}

// Function to detect language from the transcript
function detectLanguage(transcript) {
    const indonesianKeywords = [
        'apa', 'siapa', 'di mana', 'kapan', 'kenapa',
        'bagaimana', 'tolong', 'saya', 'anda', 'bisa',
        'mau', 'ingin', 'suka', 'tidak', 'ya'
    ]; // Example keywords for Indonesian

    const englishKeywords = [
        'what', 'who', 'where', 'when', 'why',
        'how', 'please', 'I', 'you', 'can',
        'want', 'like', 'no', 'yes', 'hello',
        'goodbye', 'thanks', 'sorry'
    ]; // Example keywords for English

    if (indonesianKeywords.some(keyword => transcript.toLowerCase().includes(keyword))) {
        return 'id'; // Indonesian code for gTTS
    } else if (englishKeywords.some(keyword => transcript.toLowerCase().includes(keyword))) {
        return 'en'; // English code for gTTS
    }
    return 'id'; // Default to Indonesian
}

// Automatically start speech recognition when the page loads
window.onload = function() {
    startSpeechRecognition(); // Start listening automatically
};
