import { config, validateConfig } from './config.js';
import { startWhatsAppBot } from './whatsapp.js';
import { startWebServer } from './server.js';

function printBanner() {
  console.clear();
  console.log(`
╔═════════════════════════════════════════════════════════════════╗
║                                                                 ║
║              🤖  WHATSAPP AI AUTO-RESPONDER BOT                 ║
║                                                                 ║
║  • Owner: ${config.ownerName.padEnd(52, ' ')}║
║  • AI Provider: ${config.aiProvider.toUpperCase().padEnd(46, ' ')}║
║  • Dashboard: http://localhost:${String(config.port).padEnd(40, ' ')}║
╚═════════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  printBanner();

  // Validate environment configuration
  const issues = validateConfig();
  if (issues.length > 0) {
    console.log('📌 CONFIGURATION NOTICES:');
    issues.forEach((issue) => console.log(`   ${issue}`));
    console.log('');
  }

  // Start Web Dashboard
  try {
    startWebServer();
  } catch (webErr) {
    console.error('⚠️ Could not start Web Dashboard:', webErr.message);
  }

  console.log('🚀 Starting WhatsApp connection service...');
  try {
    await startWhatsAppBot();
  } catch (err) {
    console.error('❌ Fatal error starting WhatsApp bot:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down WhatsApp AI Auto-Responder...');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Unhandled initialization exception:', err);
});
