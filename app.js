const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { default: axios } = require('axios');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.json());

async function voiceAI(aiResponseText, userLanguage, res) {
    const randomNumber = Math.floor(Math.random() * 1000);
    const fileName = `output${randomNumber}.mp3`;
    const filePath = path.join(__dirname, 'public', fileName);

    const gtts = new gTTS(aiResponseText, userLanguage);
    gtts.save(filePath, (err) => {
        if (err) {
            console.error('Failed to generate speech:', err);
            return res.status(500).send('Failed to generate speech');
        }
        res.json({ 
            audioUrl: `http://localhost:${PORT}/${fileName}`
        });
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }, 1000);
    });
}

app.post('/api/message', async (req, res) => {
    const userMessage = req.body.message;
    const userLanguage = req.body.language;
    try {
        const musicKeywords = ["nyanyikan", "lagu", "musik", "bernyanyi", "putar musik", "sing", "song", "music", "play music", "play a song"];
        if (musicKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
            try {
                const keywords = ['music', 'musik', 'lagu', 'song', 'sing'];
                const keyword = keywords.find(kw => userMessage.includes(kw));
                const title = userMessage.substring(userMessage.indexOf(keyword) + keyword.length).trim();
                const music = await axios.get(`https://api.agatz.xyz/api/ytplay?message=${title}`);
                return res.json({ 
                    audioUrl: music.data.data.audio.url
                });
            } catch {
                return voiceAI(userLanguage === 'id' ? 'Maaf, tolong berikan judul musik yang sesuai' : 'Sorry, please provide a suitable music title', userLanguage, res)
            }
        } else {
            const asisten = await axios.get(`https://api.chiwa.id/api/ai/chatGPT?text=${userMessage}`);
            const aiResponseText = asisten.data.result.replaceAll('*', '');
            return voiceAI(aiResponseText, userLanguage, res)
        }

    } catch (error) {
        console.error('Error processing AI response or generating speech:', error);
        return voiceAI(userLanguage === 'id' ? 'Maaf, aku tidak dapat mendengarmu, tolong ulangi lagi' : 'Sorry, I couldn\'t hear you, please repeat that again', userLanguage, res)
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
