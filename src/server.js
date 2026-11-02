import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { botState, toggleAutoReply, resetSession } from './whatsapp.js';
import { clearHistory } from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startWebServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '../public')));

  function formatUptime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  // API Status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      isConnected: botState.isConnected,
      isConnecting: botState.isConnecting,
      isAutoReplyEnabled: botState.isAutoReplyEnabled,
      qrCodeDataUrl: botState.qrCodeDataUrl,
      userPhone: botState.userPhone,
      ownerName: config.ownerName,
      botName: config.botName,
      aiProvider: config.aiProvider,
      aiModel: config.geminiModel,
      uptime: formatUptime(Date.now() - botState.startedAt),
      stats: botState.stats,
      recentLogs: botState.recentLogs,
    });
  });

  // Toggle Auto-responder ON / OFF
  app.post('/api/toggle', (req, res) => {
    const { enabled } = req.body || {};
    const newState = toggleAutoReply(typeof enabled === 'boolean' ? enabled : undefined);
    res.json({ success: true, isAutoReplyEnabled: newState });
  });

  // Force reset session to generate fresh QR
  app.post('/api/reset-session', async (req, res) => {
    await resetSession();
    res.json({ success: true, message: 'Session reset triggered. New QR will appear shortly.' });
  });

  // Clear AI context memory
  app.post('/api/clear-history', (req, res) => {
    clearHistory();
    res.json({ success: true, message: 'AI context memory cleared.' });
  });

  // Fallback to index.html for SPA feel
  app.use((req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  });

  const server = app.listen(config.port, () => {
    console.log(`🌐 [Web Dashboard] Running at: http://localhost:${config.port}`);
  });

  return server;
}
