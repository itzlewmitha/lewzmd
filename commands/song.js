const yts = require('yt-search');
const fs = require('fs').promises;
const path = require('path');
const { toAudio } = require('../lib/converter');

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

// EliteProTech API - Primary
async function getEliteProTechDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => 
        fetch(apiUrl, FETCH_OPTIONS).then(r => r.json())
    );
    if (res?.success && res?.downloadURL) {
        return {
            download: res.downloadURL,
            title: res.title
        };
    }
    throw new Error('EliteProTech returned no download');
}

async function getYupraDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => 
        fetch(apiUrl, FETCH_OPTIONS).then(r => r.json())
    );
    if (res?.success && res?.data?.download_url) {
        return {
            download: res.data.download_url,
            title: res.data.title,
            thumbnail: res.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuDownloadByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => 
        fetch(apiUrl, FETCH_OPTIONS).then(r => r.json())
    );
    if (res?.result?.mp3) {
        return {
            download: res.result.mp3,
            title: res.result.title
        };
    }
    throw new Error('Okatsu returned no download');
}

async function songCommand(sock, chatId, message) {
    try {
        const loadEmojis = ['🔄', '⏳', '🎵'];
        for (const emoji of loadEmojis) {
            await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
        }

        const messageContent = message.message?.ephemeralMessage?.message || 
                             message.message?.viewOnceMessage?.message || 
                             message.message?.viewOnceMessageV2?.message || 
                             message.message;
        
        const text = (messageContent.conversation || 
                     messageContent.extendedTextMessage?.text || 
                     messageContent.imageMessage?.caption || 
                     messageContent.videoMessage?.caption || 
                     '').trim();
        
        const query = text.replace(/^\.song\s+/i, '').trim();

        if (!query || query.toLowerCase() === '.song') {
            await sock.sendMessage(chatId, { text: 'Usage: .song <name or YouTube link>' }, { quoted: message });
            return;
        }

        let songUrl = '';
        let songTitle = '';
        let songThumbnail = '';

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            songUrl = query;
            songTitle = 'YouTube Audio';
        } else {
            const { videos } = await yts(query);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: 'No songs found!' }, { quoted: message });
                return;
            }
            songUrl = videos[0].url;
            songTitle = videos[0].title;
            songThumbnail = videos[0].thumbnail;
        }

        await sock.sendMessage(chatId, {
            image: { url: songThumbnail || 'https://i.postimg.cc/y6GV9P3H/file-000000004c307206bc366893b817568c-(1).png' },
            caption: `🎵 Downloading: *${songTitle}*`
        }, { quoted: message });

        let audioData;
        let downloadSuccess = false;
        const apiMethods = [
            { name: 'EliteProTech', method: () => getEliteProTechDownloadByUrl(songUrl) },
            { name: 'Yupra', method: () => getYupraDownloadByUrl(songUrl) },
            { name: 'Okatsu', method: () => getOkatsuDownloadByUrl(songUrl) }
        ];

        for (const apiMethod of apiMethods) {
            try {
                audioData = await apiMethod.method();
                if (audioData.download) {
                    downloadSuccess = true;
                    console.log(`✅ ${apiMethod.name} succeeded for: ${songTitle}`);
                    break;
                }
            } catch (err) {
                console.log(`❌ ${apiMethod.name} failed:`, err.message);
            }
        }

        if (!downloadSuccess) throw new Error('All download sources failed.');

        const audioBuffer = await fetch(audioData.download, FETCH_OPTIONS).then(r => r.buffer());
        const convertedAudio = await toAudio(audioBuffer);

        await sock.sendMessage(chatId, {
            audio: convertedAudio,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${audioData.title.replace(/[^\w\s-]/g, '')}.mp3`,
            caption: `*${audioData.title}*\n\n> *Downloaded by LEWZ MD*`
        }, { quoted: message });

    } catch (error) {
        console.error('Song error:', error);
        await sock.sendMessage(chatId, { text: `❌ Error: ${error.message}` }, { quoted: message });
    }
}

module.exports = songCommand;
