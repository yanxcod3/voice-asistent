const express = require('express');
const request = require('request');
const cors = require('cors');
const bodyParser = require('body-parser');
const { default: axios } = require('axios');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.static('audio'));
app.use(express.json());

function voiceAI(response, language, res) {
    const randomNumber = Math.floor(Math.random() * 1000);
    const fileName = `output${randomNumber}.mp3`;
    const filePath = path.join(__dirname, 'audio', fileName);

    const gtts = new gTTS(response, language);
    gtts.save(filePath, (err) => {
        if (err) {
            console.error('Failed to generate speech:', err);
            return res.status(500).send('Failed to generate speech');
        }
        res.json({ 
            audioUrl: [`http://localhost:${PORT}/${fileName}`]
        })
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }, 60000 * 10);
    });
}

app.post('/api/message', async (req, res) => {
    const message = req.body.message;
    const language = req.body.language;

    try {
        const musicKeywords = ["nyanyikan", "lagu", "musik", "bernyanyi", "putar musik", "sing", "song", "music", "play music"];
        if (musicKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            try {
                const keyword = musicKeywords.find(kw => message.toLowerCase().includes(kw));
                const title = message.substring(message.indexOf(keyword) + keyword.length).trim();
                
                const music = await axios.get(`https://api.agatz.xyz/api/ytplay?message=${title}`);

                const generateVoiceAI = (text) => new Promise((resolve) => {
                    voiceAI(text, language, {
                        json: (data) => resolve(data.audioUrl)
                    });
                })
                
                const [ai1, ai2] = await Promise.all([
                    generateVoiceAI(language === 'id' ? `Baik, saya akan memutarkan musik yang berjudul ${music.data.data.info.title}` : `Okay, I'm going to play the music called ${music.data.data.info.title}`),
                    generateVoiceAI(language === 'id' ? 'Musiknya sudah selesai' : 'The music is finished')
                ]);

                const currentAudio = '/proxy?url=' + encodeURIComponent(music.data.data.audio.url);

                return res.json({
                    audioUrl: [ai1, currentAudio, ai2]
                })
            } catch {
                return voiceAI(language === 'id' ? 'Maaf, tolong berikan judul musik yang sesuai' : 'Sorry, please provide a suitable music title', language, res)
            }
        } else {
            if (/^s(a{1,2})?y(a{1,2})?n(g{0,1})$/i.test(message)) {
                return voiceAI('hay, aku disini, ada yang bisa saya bantu?', language, res);
            } 
        
            const asisten = await axios.get(`https://api.chiwa.id/api/ai/chatGPT?text=${message}`);
            return voiceAI(asisten.data.result.replaceAll(/[*#]/g, ''), language, res);
        }
    } catch (error) {
        console.error('Error processing AI response or generating speech:', error);
        return voiceAI(language === 'id' ? 'Maaf, aku tidak dapat mendengarmu, tolong ulangi lagi' : 'Sorry, I couldn\'t hear you, please repeat that again', language, res);
    }
});

app.get('/proxy', (req, res) => {
    const url = req.query.url;
    req.pipe(request(url)).pipe(res);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
