const express = require('express');
const request = require('request');
const cors = require('cors');
const bodyParser = require('body-parser');
const { default: axios } = require('axios');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = 3000;
const dataMusic = { title: '', url: ''}
let message, language, result;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.static('playlist'));
app.use(express.static('audio'));
app.use(express.json());

function voiceAI(response, language, res = result) {
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
            response: response,
            audioUrl: [`http://localhost:${PORT}/${fileName}`]
        })
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }, 60000 * 10);
    });
}

async function setPlaylist(title, url, action) {
    const filePath = path.join(__dirname, 'playlist', 'playlist.json');
    try {
        let data = fs.readFileSync(filePath, 'utf8');
        let playlist = data ? JSON.parse(data) : [];

        if (action === 'add') {
            if (!dataMusic || !dataMusic.title) {
                return voiceAI(language === 'id' ? 'Tidak ada musik yang diputar untuk ditambahkan ke dalam playlist' : 'No music to add to the playlist', language);
            }

            console.log(dataMusic)
            const fileName = `${dataMusic.title}.mp3`;
            voiceAI(language === 'id' ? `Musik "${dataMusic.title}" berhasil ditambahkan ke playlist` : `Music "${dataMusic.title}" added to the playlist`, language);
            try {
                const response = await axios.get(dataMusic.url, {
                responseType: 'stream',
                maxRedirects: 5,
                });

                if (response.status === 200) {
                const writer = fs.createWriteStream(path.join(__dirname, 'playlist', fileName));
                response.data.pipe(writer);

                writer.on('finish', () => {
                    console.log('Musik berhasil didownload dan disimpan');
                    dataMusic.url = '/proxy?url=' + encodeURIComponent(`http://localhost:${PORT}/${fileName}`);
                    playlist.push(dataMusic);
                    fs.writeFileSync(filePath, JSON.stringify(playlist, null, 2));
                });

                writer.on('error', (err) => {
                    console.error('Gagal menyimpan musik:', err);
                });
                } else {
                console.error(`Gagal mendownload musik. Status code: ${response.status}`);
                }
            } catch (err) {
                console.error('Gagal mendownload musik:', err);
            }
            return;
        } else if (action === 'remove') {
            const titlesToRemove = playlist.filter(music => music.title.toLowerCase().includes(title.toLowerCase())).map(music => music.title);
            const updatedPlaylist = playlist.filter(music => !music.title.replace(/[^a-zA-Z\s]/g, '').toLowerCase().includes(title.toLowerCase()));

            if (!title) {
                return voiceAI(language === 'id' ? 'Maaf, tolong berikan judul musik yang ingin dihapus dari playlist' : 'Sorry, please provide the title of the music you want to remove from the playlist', language);
            }

            if (updatedPlaylist.length === playlist.length) {
                return voiceAI(language === 'id' ? `Musik "${title}" tidak ada dalam playlist` : `Music "${title}" not found in the playlist`, language);
            }

            titlesToRemove.forEach(title => {
                try {
                    fs.unlinkSync(path.join(__dirname, 'playlist', `${title}.mp3`));
                    console.log(`File ${title} telah dihapus.`);
                } catch (err) {
                    console.error(`Gagal menghapus file ${title}:`, err);
                }
            });

            voiceAI(language === 'id' ? `Berhasil menghapus musik ${titlesToRemove.join(', ')} dari playlist` : `Music ${titlesToRemove.join(', ')} removed from the playlist`, language);
            setTimeout(() => {
                fs.writeFileSync(filePath, JSON.stringify(updatedPlaylist, null, 2), 'utf8');
            }, 2000);
            return;
        } else if (action === 'view') {
            if (playlist.length === 0) {
                return voiceAI(language === 'id' ? 'Playlist kosong' : 'The playlist is empty', language);
            }

            const generateVoiceAI = (text) => new Promise((resolve) => {
                voiceAI(text, language, {
                    json: (data) => resolve(data.audioUrl)
                });
            })

            const formattedPlaylist = playlist.map((music, index) => `${index + 1}. ${music.title}`).join('\n');
            const voice = await generateVoiceAI(language === 'id' ? `Berikut adalah daftar musik dalam playlist:` : `Here is the list of music in the playlist:`);
            return result.json({
                response: formattedPlaylist,
                audioUrl: [voice]
            });
        } else if (action === 'play') {
            if (playlist.length === 0) {
                return voiceAI(language === 'id' ? 'Playlist kosong, tidak ada musik yang dapat diputar.' : 'The playlist is empty, no music to play.', language);
            }

            const generateVoiceAI = (text) => new Promise((resolve) => {
                voiceAI(text, language, {
                    json: (data) => resolve(data.audioUrl)
                });
            })

            let musicUrls = playlist.map(music => music.url);

            if (message.includes('terakhir') || message.includes('last')) {
                musicUrls = playlist.slice().reverse().map(music => music.url);
            } else if (message.includes('acak') || message.includes('random')) {
                musicUrls = playlist.slice().sort(() => Math.random() - 0.5).map(music => music.url);
            }
            
            const [ai1, ai2] = await Promise.all([
                generateVoiceAI(language === 'id' ? `Baik, saya akan memutarkan semua musik dalam playlist` : `Okay, I will play all the music in the playlist`),
                generateVoiceAI(language === 'id' ? 'Musiknya sudah selesai' : 'The music is finished')
            ]);

            return result.json({
                response: 'playlist',
                audioUrl: [ai1, ...musicUrls, ai2]
            });
        }
    } catch (err) {
        console.error('Error:', err);
        return voiceAI(language === 'id' ? 'Terjadi kesalahan dengan file playlist.' : 'Error with the playlist file.', language);
    }
}

app.post('/api/message', async (req, res) => {
    message = req.body.message;
    language = req.body.language;
    result = res;

    try {
        const musicKeywords = ["nyanyikan", "lagu", "musik", "bernyanyi", "putar musik", "sing", "song", "music", "play music"];
        const vokepKeywords = ["video bokep"];
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
                dataMusic.title = music.data.data.info.title;
                dataMusic.url = music.data.data.audio.url;
                return result.json({
                    audioUrl: [ai1, currentAudio, ai2]
                });
            } catch {
                return voiceAI(language === 'id' ? 'Maaf, tolong berikan judul yang sesuai' : 'Sorry, please provide a suitable title', language)
            }
        } else if (message.match(/(tambahkan|masukan).*playlist/)) {
            return setPlaylist('', '', 'add');
        } else if (message.match(/(hapus|remove).*playlist/)) {
            const keyword = ['playlist'].find(kw => message.toLowerCase().includes(kw));
            const title = message.substring(message.indexOf(keyword) + keyword.length).trim();
            return setPlaylist(title, '', 'remove');
        } else if (message.match(/(tampilkan).*playlist/)) {
            return setPlaylist('', '', 'view');
        } else if (message.match(/(putar).*playlist/)) {
            return setPlaylist('', '', 'play');
        } else if (vokepKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
            try {
                const keyword = vokepKeywords.find(kw => message.toLowerCase().includes(kw));
                const title = message.substring(message.indexOf(keyword) + keyword.length).trim();
                
                const titleVokep = await axios.get(`https://api.agatz.xyz/api/xnxx?message=${title}`)
                const vokep = await axios.get(`https://api.agatz.xyz/api/xnxxdown?url=${titleVokep.data.data.result[0].link}`);

                const generateVoiceAI = (text) => new Promise((resolve) => {
                    voiceAI(text, language, {
                        json: (data) => resolve(data.audioUrl)
                    });
                });
                const audio = await generateVoiceAI(language === 'id' ? 'Oke, aku akan memutarkan video bokep untukmu' : 'Okay, I\'ll play you a porn video', language)

                return result.json({
                    response: 'video',
                    audioUrl: [audio],
                    videoUrl: vokep.data.data.files.high
                })
            } catch {
                return voiceAI(language === 'id' ? 'Maaf, tolong berikan judul yang sesuai' : 'Sorry, please provide a suitable title', language)
            }
        } else {
            if (/^s(a{1,2})?y(a{1,2})?n(g{0,1})$/i.test(message)) {
                return voiceAI('hay, aku disini, ada yang bisa saya bantu?', language);
            } 
        
            const asisten = await axios.get(`https://api.chiwa.id/api/ai/chatGPT?text=${message}`);
            return voiceAI(asisten.data.result.replaceAll(/[*#]/g, ''), language);
        }
    } catch (error) {
        console.error('Error processing AI response or generating speech:', error);
        return voiceAI(language === 'id' ? 'Maaf, aku tidak dapat mendengarmu, tolong ulangi lagi' : 'Sorry, I couldn\'t hear you, please repeat that again', language);
    }
});

app.get('/proxy', (req, res) => {
    const url = req.query.url;
    req.pipe(request(url)).pipe(res);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
