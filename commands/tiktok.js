async function tiktokCommand(sock, from, msg) {
    try {
        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();
        const q = text.replace(/^\.(tiktok|tt)\s+/i, '').trim();

        if (!q || q.startsWith('.')) return await sock.sendMessage(from, { text: "❌ Please provide a TikTok URL." }, { quoted: msg });
        
        const loadEmojis = ['📥', '⏳', '📱'];
        for (const emoji of loadEmojis) {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
        }

        const res = await fetch(`https://tikwm.com/api/?url=${q}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }).then(r => r.json());

        if (res && res.data && res.data.play) {
            const videoUrl = res.data.play;
            await sock.sendMessage(from, { video: { url: videoUrl }, caption: "✅ TIKTOK DOWNLOADED BY LEWZ-MD" }, { quoted: msg });
        } else {
            throw new Error("Invalid response from TikTok API");
        }
    } catch (e) {
        console.error('TikTok error:', e.message);
        await sock.sendMessage(from, { text: "❌ Error downloading TikTok. Make sure the link is valid." }, { quoted: msg });
    }
}

module.exports = tiktokCommand;
