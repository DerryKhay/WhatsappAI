import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseList(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((item) => item.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
}

export const config = {
  // AI Settings
  aiProvider: (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase(),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim(),
  openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
  openaiModel: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),

  // Bot & Owner identity
  ownerName: process.env.OWNER_NAME || 'Derry',
  botName: process.env.BOT_NAME || "Derry's Assistant",
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    `You are a personal WhatsApp AI assistant replying on behalf of ${process.env.OWNER_NAME || 'Derry'}. ` +
      `${process.env.OWNER_NAME || 'Derry'} is currently away or busy. ` +
      `Respond in a friendly, polite, natural, and helpful manner. ` +
      `Keep messages concise and formatted nicely for WhatsApp (use short paragraphs and occasional emojis). ` +
      `If someone leaves an urgent message, assure them that their message is noted and will be reviewed as soon as possible.`,

  // Behavior
  autoReplyGroups: process.env.AUTO_REPLY_GROUPS === 'true',
  debounceDelayMs: parseInt(process.env.DEBOUNCE_DELAY_MS || '2500', 10),
  cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS || '0', 10),
  enableTypingIndicator: process.env.ENABLE_TYPING_INDICATOR !== 'false',
  maxHistoryTurns: parseInt(process.env.MAX_HISTORY_TURNS || '10', 10),

  // Number Filters
  allowedNumbers: parseList(process.env.ALLOWED_NUMBERS),
  blockedNumbers: parseList(process.env.BLOCKED_NUMBERS),

  // Storage & Web Server
  sessionDir: path.resolve(__dirname, '../auth_info'),
  port: parseInt(process.env.PORT || '3000', 10),
};

export function validateConfig() {
  const issues = [];
  const hasGemini = Boolean(config.geminiApiKey);
  const hasOpenai = Boolean(config.openaiApiKey);

  if (config.aiProvider === 'gemini' && !hasGemini) {
    issues.push(
      '⚠️  GEMINI_API_KEY is not set in .env. Bot will respond in fallback/setup mode until a key is added. (Get free key at: https://aistudio.google.com)'
    );
  } else if (config.aiProvider === 'openai' && !hasOpenai) {
    issues.push(
      '⚠️  OPENAI_API_KEY is not set in .env. Bot will respond in fallback/setup mode until a key is added. (Get key at: https://platform.openai.com)'
    );
  }

  return issues;
}
