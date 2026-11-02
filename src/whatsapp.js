import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import { config } from './config.js';
import { getAiReply, clearHistory } from './ai.js';

// Live Bot State exposed to Web Dashboard & WhatsApp
export const botState = {
  isConnected: false,
  isConnecting: false,
  isAutoReplyEnabled: true,
  qrCodeDataUrl: null,
  qrCodeRaw: null,
  userPhone: null,
  startedAt: Date.now(),
  stats: {
    totalReceived: 0,
    totalReplied: 0,
  },
  recentLogs: [],
};

export function addLog(type, text) {
  const item = {
    id: Date.now() + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type, // 'info' | 'incoming' | 'reply' | 'warn' | 'error'
    text,
  };
  botState.recentLogs.unshift(item);
  if (botState.recentLogs.length > 50) {
    botState.recentLogs.pop();
  }
}

export function toggleAutoReply(forcedState) {
  if (typeof forcedState === 'boolean') {
    botState.isAutoReplyEnabled = forcedState;
  } else {
    botState.isAutoReplyEnabled = !botState.isAutoReplyEnabled;
  }
  const statusStr = botState.isAutoReplyEnabled ? 'ACTIVE (ON)' : 'PAUSED (OFF)';
  console.log(`🔘 [Toggle] Auto-responder is now ${statusStr}`);
  addLog('info', `Auto-responder turned ${statusStr}`);
  return botState.isAutoReplyEnabled;
}

// Global active socket
let sock = null;

// Debounce queue for incoming messages per sender
const messageQueue = new Map();

// Cooldown tracker per sender
const cooldownTracker = new Map();

/**
 * Extracts plain text from WhatsApp message object
 */
export function extractMessageText(msg) {
  if (!msg.message) return null;
  const message = msg.message;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    null
  );
}

/**
 * Checks if a phone number is permitted to receive auto-replies
 */
function isNumberAllowed(remoteJid) {
  const cleanNumber = remoteJid.replace(/[^0-9]/g, '');

  if (config.blockedNumbers.length > 0) {
    if (config.blockedNumbers.some((num) => cleanNumber.includes(num))) {
      return false;
    }
  }

  if (config.allowedNumbers.length > 0) {
    return config.allowedNumbers.some((num) => cleanNumber.includes(num));
  }

  return true;
}

/**
 * Handles admin control commands sent by the account owner
 */
async function handleAdminCommands(msg, text) {
  const trimmed = text.trim().toLowerCase();
  const remoteJid = msg.key.remoteJid;

  if (trimmed === '!bot off') {
    toggleAutoReply(false);
    await sock.sendMessage(remoteJid, {
      text: '🛑 *WhatsApp AI Auto-Responder is now PAUSED.* Send `!bot on` or use the Web Dashboard to resume.',
    });
    return true;
  }

  if (trimmed === '!bot on') {
    toggleAutoReply(true);
    await sock.sendMessage(remoteJid, {
      text: '🟢 *WhatsApp AI Auto-Responder is now ACTIVE.*',
    });
    return true;
  }

  if (trimmed === '!bot status') {
    const statusText =
      `📊 *Bot Status Report*\n` +
      `• Auto-reply active: *${botState.isAutoReplyEnabled ? 'YES' : 'NO'}*\n` +
      `• AI Provider: *${config.aiProvider.toUpperCase()}*\n` +
      `• AI Model: *${config.geminiModel}*\n` +
      `• Total Replied: *${botState.stats.totalReplied}*\n` +
      `• Groups allowed: *${config.autoReplyGroups ? 'YES' : 'NO'}*\n` +
      `• Typing indicator: *${config.enableTypingIndicator ? 'ON' : 'OFF'}*`;
    await sock.sendMessage(remoteJid, { text: statusText });
    return true;
  }

  if (trimmed === '!clear') {
    clearHistory(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: '🧹 *Conversation memory cleared for this chat.*',
    });
    return true;
  }

  return false;
}

/**
 * Processes the accumulated messages for a sender and replies via AI
 */
async function processDebouncedMessages(remoteJid) {
  const queued = messageQueue.get(remoteJid);
  if (!queued) return;
  messageQueue.delete(remoteJid);

  const { texts, lastMsg, senderName } = queued;
  const combinedText = texts.join('\n').trim();
  if (!combinedText) return;

  const displaySender = senderName ? `${senderName} (+${remoteJid.split('@')[0]})` : `+${remoteJid.split('@')[0]}`;
  console.log(`\n📩 [Message Received] from ${displaySender}:`);
  console.log(`   "${combinedText}"`);
  addLog('incoming', `From ${displaySender}: "${combinedText.substring(0, 80)}${combinedText.length > 80 ? '...' : ''}"`);

  // Show typing indicator in WhatsApp
  if (config.enableTypingIndicator) {
    try {
      await sock.sendPresenceUpdate('composing', remoteJid);
    } catch (err) {}
  }

  console.log(`🤖 [AI Generating] thinking with ${config.aiProvider.toUpperCase()}...`);
  const replyText = await getAiReply({
    chatId: remoteJid,
    senderName,
    messageText: combinedText,
  });

  // Stop typing presence
  if (config.enableTypingIndicator) {
    try {
      await sock.sendPresenceUpdate('paused', remoteJid);
    } catch (err) {}
  }

  if (replyText) {
    console.log(`📤 [Sending Auto-Reply] to ${displaySender}:`);
    console.log(`   "${replyText.replace(/\n/g, ' ')}"`);
    addLog('reply', `To ${displaySender}: "${replyText.substring(0, 80)}${replyText.length > 80 ? '...' : ''}"`);

    try {
      await sock.sendMessage(remoteJid, { text: replyText }, { quoted: lastMsg });
      botState.stats.totalReplied++;
      cooldownTracker.set(remoteJid, Date.now());
    } catch (sendErr) {
      console.error(`❌ [Failed to send message to ${remoteJid}]:`, sendErr.message);
      addLog('error', `Failed sending reply to ${displaySender}: ${sendErr.message}`);
    }
  }
}

/**
 * Disconnects and resets session to force a fresh QR code
 */
export async function resetSession() {
  addLog('warn', 'Session reset requested. Clearing auth folder and reconnecting...');
  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (e) {}

  try {
    fs.rmSync(config.sessionDir, { recursive: true, force: true });
  } catch (e) {}

  setTimeout(() => {
    startWhatsAppBot();
  }, 2000);
}

/**
 * Initializes and starts the WhatsApp Baileys connection
 */
export async function startWhatsAppBot() {
  botState.isConnecting = true;

  // Ensure session directory exists
  if (!fs.existsSync(config.sessionDir)) {
    fs.mkdirSync(config.sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestWaWebVersion().catch(() => ({
    version: [2, 3000, 1052621268],
  }));

  console.log(`📡 Connecting to WhatsApp Web protocol v${version.join('.')}...`);
  addLog('info', `Connecting to WhatsApp Web protocol v${version.join('.')}...`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
  });

  // Save updated credentials
  sock.ev.on('creds.update', saveCreds);

  // Connection Lifecycle
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botState.qrCodeRaw = qr;
      try {
        botState.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
      } catch (qrErr) {
        console.error('Failed generating QR DataURL:', qrErr);
      }

      console.log('\n============================================================');
      console.log('📱 SCAN THIS QR CODE WITH WHATSAPP TO LINK YOUR ACCOUNT:');
      console.log('   1. Open WhatsApp on your phone');
      console.log('   2. Tap Settings (iOS) or 3 Dots (Android) -> Linked Devices');
      console.log('   3. Tap "Link a Device" and point your camera at the QR code');
      console.log(`   (Or view the Web Dashboard at: http://localhost:${config.port})`);
      console.log('============================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
      addLog('warn', 'New QR Code generated. Scan with WhatsApp to link device.');
    }

    if (connection === 'open') {
      botState.isConnected = true;
      botState.isConnecting = false;
      botState.qrCodeDataUrl = null;
      botState.qrCodeRaw = null;

      const userPhone = sock.user?.id ? sock.user.id.split(':')[0] : 'Unknown';
      botState.userPhone = userPhone;

      console.log('\n============================================================');
      console.log(`🎉 WhatsApp Auto-Responder is ONLINE and READY!`);
      console.log(`👤 Connected as: +${userPhone}`);
      console.log(`🤖 AI Provider: ${config.aiProvider.toUpperCase()}`);
      console.log(`🌐 Web Dashboard: http://localhost:${config.port}`);
      console.log('============================================================\n');
      console.log('Listening for incoming messages...\n');
      addLog('info', `WhatsApp connected successfully as +${userPhone}`);
    }

    if (connection === 'close') {
      botState.isConnected = false;
      botState.isConnecting = false;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `⚠️ Connection closed (status: ${statusCode || 'unknown'}). Reconnecting: ${shouldReconnect}`
      );
      addLog('warn', `Connection closed (status ${statusCode || 'unknown'}). Reconnecting: ${shouldReconnect}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Device was logged out from WhatsApp. Resetting session...');
        addLog('error', 'Device was unlinked/logged out from WhatsApp. Resetting session.');
        try {
          fs.rmSync(config.sessionDir, { recursive: true, force: true });
        } catch (e) {}
        console.log('Please restart or visit the Web Dashboard to scan a fresh QR code.');
      } else {
        // Reconnect after 5 seconds delay
        setTimeout(() => {
          startWhatsAppBot();
        }, 5000);
      }
    }
  });

  // Handle Incoming Messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const remoteJid = msg.key?.remoteJid;
      if (!remoteJid) continue;

      const messageText = extractMessageText(msg);
      if (!messageText) continue;

      // Handle Admin commands from the bot owner (even if sent from own device)
      if (msg.key.fromMe) {
        if (messageText.startsWith('!')) {
          await handleAdminCommands(msg, messageText);
        }
        continue;
      }

      botState.stats.totalReceived++;

      // If auto-reply is currently paused by admin command or web toggle, ignore
      if (!botState.isAutoReplyEnabled) {
        continue;
      }

      // Ignore Status / Story broadcasts
      if (remoteJid === 'status@broadcast' || remoteJid.includes('@newsletter')) {
        continue;
      }

      // Ignore group chats unless specifically enabled
      const isGroup = remoteJid.endsWith('@g.us');
      if (isGroup && !config.autoReplyGroups) {
        continue;
      }

      // Check allowed / blocked number filters
      if (!isNumberAllowed(remoteJid)) {
        continue;
      }

      // Check contact cooldown if configured
      if (config.cooldownSeconds > 0) {
        const lastReplied = cooldownTracker.get(remoteJid) || 0;
        const elapsed = (Date.now() - lastReplied) / 1000;
        if (elapsed < config.cooldownSeconds) {
          console.log(
            `⏳ [Cooldown] Skipping message from ${remoteJid} (${Math.round(config.cooldownSeconds - elapsed)}s remaining)`
          );
          continue;
        }
      }

      const senderName = msg.pushName || '';

      // Debounce rapid messages from the same sender
      const existingQueue = messageQueue.get(remoteJid);
      if (existingQueue) {
        clearTimeout(existingQueue.timer);
        existingQueue.texts.push(messageText);
        existingQueue.lastMsg = msg;
        existingQueue.timer = setTimeout(() => {
          processDebouncedMessages(remoteJid);
        }, config.debounceDelayMs);
      } else {
        const timer = setTimeout(() => {
          processDebouncedMessages(remoteJid);
        }, config.debounceDelayMs);

        messageQueue.set(remoteJid, {
          texts: [messageText],
          lastMsg: msg,
          senderName,
          timer,
        });
      }
    }
  });

  return sock;
}
