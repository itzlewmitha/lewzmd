/**
 * APK Downloader Command
 * Fetches APK details & downloads the file using NexOracle API.
 */
async function apkCommand(sock, chatId, message) {
  try {
    // Extract the user message
    const userMessage =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      '';
    const appName = userMessage.split(' ').slice(1).join(' ');

    if (!appName) {
      await sock.sendMessage(
        chatId,
        { text: '⚠️ Please provide an app name. Example: `.apk whatsapp`' },
        { quoted: message }
      );
      return;
    }

    // React with hourglass while processing
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    // API call to NexOracle using fetch
    const apiUrl = 'https://api.nexoracle.com/downloader/apk';
    const params = new URLSearchParams({
      apikey: 'free_key@maher_apis',
      q: appName,
    });

    const response = await fetch(`${apiUrl}?${params}`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.status !== 200 || !data.result) {
      await sock.sendMessage(
        chatId,
        { text: '❌ Unable to find the APK. Please try again later.' },
        { quoted: message }
      );
      return;
    }

    const { name, lastup, package: pkgName, size, icon, dllink } = data.result;

    // Send thumbnail preview
    await sock.sendMessage(
      chatId,
      {
        image: { url: icon },
        caption: `📦 *Downloading ${name}... Please wait.*`,
      },
      { quoted: message }
    );

    // Download APK file using fetch
    const apkResponse = await fetch(dllink, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!apkResponse.ok) {
      throw new Error(`Failed to download APK: ${apkResponse.status}`);
    }

    const apkBuffer = await apkResponse.buffer();

    if (!apkBuffer || apkBuffer.length === 0) {
      await sock.sendMessage(
        chatId,
        { text: '❌ Failed to download the APK. Please try again later.' },
        { quoted: message }
      );
      return;
    }

    // Format message with details
    const details = `📦 *APK Details* 📦\n\n` +
      `🔖 *Name*: ${name}\n` +
      `📅 *Last Update*: ${lastup}\n` +
      `📦 *Package*: ${pkgName}\n` +
      `📏 *Size*: ${size}\n\n` +
      `> © POWERED BY LEWZ MD`;

    // Send APK as document
    await sock.sendMessage(
      chatId,
      {
        document: apkBuffer,
        mimetype: 'application/vnd.android.package-archive',
        fileName: `${name}.apk`,
        caption: details
      },
      { quoted: message }
    );

    // Success reaction
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

  } catch (error) {
    console.error('❌ Error in apkCommand:', error);

    await sock.sendMessage(
      chatId,
      { text: '❌ Unable to fetch APK details. Please try again later.' },
      { quoted: message }
    );

    // Failure reaction
    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
  }
}

module.exports = apkCommand;
