const yts = require('yt-search');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

/**
 * .csong - Send YouTube audio to channel as OPUS voice message
 * With timeout and retry logic
 */
async function csongCommand(sock, from, msg) {
    try {
        const messageContent = msg.message?.ephemeralMessage?.message || 
                             msg.message?.viewOnceMessage?.message || 
                             msg.message?.viewOnceMessageV2?.message || 
                             msg.message;
        
        const text = (messageContent.conversation || 
                     messageContent.extendedTextMessage?.text || '').trim();
        
        const parts = text.replace(/^\.csong\s+/i, '').trim().split(/\s+/);
        
        if (parts.length < 2) {
            await sock.sendMessage(from, { 
                text: `❌ Usage:
.csong <channel_jid> <song_name>

Example:
.csong 120363417811742014@newsletter despacito` 
            }, { quoted: msg });
            return;
        }

        const targetJid = parts[0];
        const query = parts.slice(1).join(' ');

        if (!targetJid.includes('@')) {
            await sock.sendMessage(from, { 
                text: '❌ Invalid JID' 
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

        // Search YouTube
        const { videos } = await yts(query);
        if (!videos || videos.length === 0) {
            await sock.sendMessage(from, { 
                text: `❌ No videos found for: "${query}"` 
            }, { quoted: msg });
            return;
        }

        const video = videos[0];
        const videoUrl = video.url;
        const videoTitle = video.title;
        const thumbnail = video.thumbnail;

        // Send thumbnail
        await sock.sendMessage(targetJid, {
            image: { url: thumbnail },
            caption: `🎵 ${videoTitle}`
        });

        // Download audio with retry
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

        let downloadUrl = null;

        // Try EliteProTech
        try {
            const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(videoUrl)}&format=mp3`;
            const res = await Promise.race([
                fetch(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                }).then(r => r.json()),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 15000)
                )
            ]);

            if (res?.success && res?.downloadURL) {
                downloadUrl = res.downloadURL;
            }
        } catch (e) {
            console.log('EliteProTech failed:', e.message);
        }

        // Try Yupra fallback
        if (!downloadUrl) {
            try {
                const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`;
                const res = await Promise.race([
                    fetch(apiUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    }).then(r => r.json()),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 15000)
                    )
                ]);

                if (res?.success && res?.data?.download_url) {
                    downloadUrl = res.data.download_url;
                }
            } catch (e) {
                console.log('Yupra failed:', e.message);
            }
        }

        if (!downloadUrl) {
            await sock.sendMessage(from, { 
                text: '❌ Failed to get download link' 
            }, { quoted: msg });
            return;
        }

        // Download MP3 file with retry (3 attempts)
        await sock.sendMessage(from, { react: { text: '📥', key: msg.key } });

        let mp3Buf = null;
        let attempts = 0;

        while (!mp3Buf && attempts < 3) {
            attempts++;
            try {
                console.log(`Download attempt ${attempts}/3...`);
                
                const audioRes = await Promise.race([
                    fetch(downloadUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Download timeout')), 30000)
                    )
                ]);

                const arrayBuf = await audioRes.arrayBuffer();
                mp3Buf = Buffer.from(arrayBuf);

                if (!mp3Buf || mp3Buf.length === 0) {
                    throw new Error('Empty buffer');
                }

                console.log(`✅ Downloaded ${mp3Buf.length} bytes`);
            } catch (err) {
                console.error(`Attempt ${attempts} failed:`, err.message);
                if (attempts < 3) {
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2 sec before retry
                }
            }
        }

        if (!mp3Buf) {
            await sock.sendMessage(from, { 
                text: '❌ Download failed after 3 attempts' 
            }, { quoted: msg });
            return;
        }

        // Convert MP3 to OPUS
        await sock.sendMessage(from, { react: { text: '🔄', key: msg.key } });

        let opusBuf = null;

        try {
            const tempDir = '/tmp';
            const timestamp = Date.now();
            const mp3File = path.join(tempDir, `audio_${timestamp}.mp3`);
            const opusFile = path.join(tempDir, `audio_${timestamp}.opus`);

            await fs.writeFile(mp3File, mp3Buf);

            try {
                await execPromise(`ffmpeg -i "${mp3File}" -c:a libopus -b:a 128k -vn -y "${opusFile}" 2>/dev/null`);
                const opusData = await fs.readFile(opusFile);
                opusBuf = Buffer.from(opusData);

                await fs.unlink(mp3File).catch(() => {});
                await fs.unlink(opusFile).catch(() => {});

                console.log('✅ Converted to OPUS');
            } catch (ffmpegErr) {
                console.error('FFmpeg error:', ffmpegErr.message);
                opusBuf = mp3Buf;
                await fs.unlink(mp3File).catch(() => {});
            }
        } catch (convertErr) {
            console.error('Convert error:', convertErr.message);
            opusBuf = mp3Buf;
        }

        // Send as voice message
        await sock.sendMessage(from, { react: { text: '📤', key: msg.key } });

        try {
            await sock.sendMessage(targetJid, {
                audio: opusBuf,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                fileName: `${videoTitle.replace(/[^\w\s-]/g, '')}.opus`
            });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            await sock.sendMessage(from, { 
                text: `✅ Voice message sent!\n\n🎵 ${videoTitle}` 
            }, { quoted: msg });

            console.log(`✅ csong: ${videoTitle} → ${targetJid}`);

        } catch (sendErr) {
            console.error('Send error:', sendErr.message);
            await sock.sendMessage(from, { 
                text: `❌ Send error: ${sendErr.message}` 
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('csong error:', error);
        await sock.sendMessage(from, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: msg });
    }
}

module.exports = csongCommand;