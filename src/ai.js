import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from './config.js';

// Per-chat conversation history: Map<chatId, Array<{ role: 'user' | 'assistant', text: string, timestamp: number }>>
const conversationStore = new Map();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Lazy-initialized AI clients
let geminiClient = null;
let openaiClient = null;

function getGeminiClient() {
  if (!geminiClient && config.geminiApiKey) {
    geminiClient = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return geminiClient;
}

function getOpenAIClient() {
  if (!openaiClient && config.openaiApiKey) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

/**
 * Retrieves and cleans up conversation history for a given chat ID.
 */
function getChatHistory(chatId) {
  const now = Date.now();
  let history = conversationStore.get(chatId) || [];

  // Filter out messages older than 2 hours to keep context relevant
  history = history.filter((msg) => now - msg.timestamp < TWO_HOURS_MS);

  // Keep up to maxHistoryTurns
  if (history.length > config.maxHistoryTurns * 2) {
    history = history.slice(-config.maxHistoryTurns * 2);
  }

  conversationStore.set(chatId, history);
  return history;
}

/**
 * Appends a message to the conversation history.
 */
function appendHistory(chatId, role, text) {
  const history = getChatHistory(chatId);
  history.push({
    role,
    text,
    timestamp: Date.now(),
  });
  conversationStore.set(chatId, history);
}

/**
 * Clears conversation history for a specific chat.
 */
export function clearHistory(chatId) {
  conversationStore.delete(chatId);
}

/**
 * Fallback response when no AI provider API key is configured.
 */
function getFallbackReply(senderName, userMessage) {
  return (
    `👋 Hi ${senderName || 'there'}! This is an automated message from ${config.ownerName}'s WhatsApp.\n\n` +
    `${config.ownerName} is currently away and has received your message: "${userMessage}". ` +
    `They will get back to you as soon as possible!\n\n` +
    `🤖 *Status:* Setup mode active. To enable AI-powered chat replies, please add your GEMINI_API_KEY to the .env file.`
  );
}

/**
 * Generate response using Google Gemini
 */
async function generateGeminiReply(chatId, senderName, userMessage) {
  const client = getGeminiClient();
  if (!client) {
    return getFallbackReply(senderName, userMessage);
  }

  const history = getChatHistory(chatId);

  // Convert to Gemini format
  const geminiHistory = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.text }],
  }));

  const callModel = async (modelName) => {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction:
        `${config.systemPrompt}\n\n` +
        `Additional context:\n` +
        `- The contact messaging is: ${senderName || 'Unknown Contact'}.\n` +
        `- Keep responses formatted cleanly for WhatsApp mobile chat.`,
    });

    const chat = model.startChat({
      history: geminiHistory,
    });

    const result = await chat.sendMessage(userMessage);
    const responseText = result.response.text();
    return responseText ? responseText.trim() : null;
  };

  try {
    return await callModel(config.geminiModel);
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('404')) {
      console.warn(
        `⚠️  Model "${config.geminiModel}" returned 404. Falling back to "gemini-3.5-flash-lite"...`
      );
      return await callModel('gemini-3.5-flash-lite');
    }
    throw err;
  }
}

/**
 * Generate response using OpenAI
 */
async function generateOpenAIReply(chatId, senderName, userMessage) {
  const client = getOpenAIClient();
  if (!client) {
    return getFallbackReply(senderName, userMessage);
  }

  const history = getChatHistory(chatId);

  const messages = [
    {
      role: 'system',
      content:
        `${config.systemPrompt}\n\n` +
        `Context: The person speaking to you is ${senderName || 'Unknown Contact'}. ` +
        `Format your response naturally for WhatsApp mobile messaging.`,
    },
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages,
    max_tokens: 600,
    temperature: 0.7,
  });

  const reply = completion.choices[0]?.message?.content;
  return reply ? reply.trim() : null;
}

/**
 * Main AI reply entry point
 */
export async function getAiReply({ chatId, senderName, messageText }) {
  try {
    let reply = null;

    if (config.aiProvider === 'openai') {
      reply = await generateOpenAIReply(chatId, senderName, messageText);
    } else {
      // Default: Gemini
      reply = await generateGeminiReply(chatId, senderName, messageText);
    }

    if (reply) {
      // Save both the user prompt and assistant response to history
      appendHistory(chatId, 'user', messageText);
      appendHistory(chatId, 'assistant', reply);
    }

    return reply;
  } catch (error) {
    console.error(`[AI Error for ${chatId}]:`, error.message);

    // If quota or API key issue, provide a helpful graceful response
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid_api_key')) {
      return `⚠️ Automated reply: The AI API key in .env appears invalid. Please check your API key in .env!`;
    }
    if (error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('429')) {
      return `👋 Hi! I received your message. ${config.ownerName} will get back to you shortly! (AI rate limit temporarily reached).`;
    }

    // Generic safe reply
    return `👋 Hi! This is an automated reply from ${config.ownerName}'s assistant. I received your message and ${config.ownerName} will reply as soon as possible!`;
  }
}
