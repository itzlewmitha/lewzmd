/**
 * .jid - Get chat/channel JID
 * Works everywhere: Private chats, Groups, Channels
 */
async function jidCommand(sock, from, msg) {
    try {
        const jid = from;
        
        await sock.sendMessage(from, { 
            text: `📋 JID:\n${jid}

Use with .csong:
.csong ${jid} despacito` 
        });

    } catch (error) {
        console.error('JID error:', error);
        await sock.sendMessage(from, { text: '❌ Error' }, { quoted: msg });
    }
}

module.exports = jidCommand;