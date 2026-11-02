// Dashboard Client App
const connectionPill = document.getElementById('connection-pill');
const connectionText = document.getElementById('connection-text');
const uptimeVal = document.getElementById('uptime-val');
const masterCard = document.getElementById('master-card');
const masterTitle = document.getElementById('master-status-title');
const masterDesc = document.getElementById('master-status-desc');
const autoReplyToggle = document.getElementById('auto-reply-toggle');
const userPhoneVal = document.getElementById('user-phone');
const statReplied = document.getElementById('stat-replied');
const statModel = document.getElementById('stat-model');
const qrSection = document.getElementById('qr-section');
const qrImage = document.getElementById('qr-image');
const activityFeed = document.getElementById('activity-feed');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnRePair = document.getElementById('btn-re-pair');

let isUpdatingToggle = false;

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    renderState(data);
  } catch (err) {
    console.error('Failed fetching status:', err);
    connectionPill.className = 'status-pill offline';
    connectionText.textContent = 'Server Offline';
  }
}

function renderState(data) {
  // 1. Connection Status Pill
  if (data.isConnected) {
    connectionPill.className = 'status-pill online';
    connectionText.textContent = 'Online & Active';
  } else if (data.qrCodeDataUrl) {
    connectionPill.className = 'status-pill connecting';
    connectionText.textContent = 'Scan QR to Link';
  } else if (data.isConnecting) {
    connectionPill.className = 'status-pill connecting';
    connectionText.textContent = 'Connecting...';
  } else {
    connectionPill.className = 'status-pill offline';
    connectionText.textContent = 'Disconnected';
  }

  uptimeVal.textContent = data.uptime || '0s';

  // 2. Master Toggle Card
  if (!isUpdatingToggle) {
    autoReplyToggle.checked = Boolean(data.isAutoReplyEnabled);
  }

  if (data.isAutoReplyEnabled) {
    masterCard.classList.remove('paused');
    masterTitle.textContent = 'Auto-Responder is ACTIVE';
    masterDesc.textContent = 'Intelligently replying to personal WhatsApp messages with context memory.';
  } else {
    masterCard.classList.add('paused');
    masterTitle.textContent = 'Auto-Responder is PAUSED';
    masterDesc.textContent = 'Listening silently. Automated replies are temporarily suspended.';
  }

  // 3. QR Code Display
  if (!data.isConnected && data.qrCodeDataUrl) {
    qrSection.style.display = 'block';
    if (qrImage.src !== data.qrCodeDataUrl) {
      qrImage.src = data.qrCodeDataUrl;
    }
  } else {
    qrSection.style.display = 'none';
  }

  // 4. Stats Grid
  userPhoneVal.textContent = data.userPhone ? `+${data.userPhone}` : (data.isConnected ? 'Connected' : 'Not Linked');
  statReplied.textContent = data.stats?.totalReplied ?? 0;
  statModel.textContent = data.aiModel ? data.aiModel.replace('gemini-', 'Gemini ').replace('-lite', ' Lite') : 'Gemini 3.5 Flash';

  // 5. Activity Feed
  if (data.recentLogs && data.recentLogs.length > 0) {
    activityFeed.innerHTML = data.recentLogs
      .map(
        (log) => `
        <div class="feed-item ${log.type || 'info'}">
          <span class="feed-time">${log.timestamp}</span>
          <div class="feed-body">${escapeHtml(log.text)}</div>
        </div>
      `
      )
      .join('');
  } else {
    activityFeed.innerHTML = '<div class="empty-state">Waiting for incoming WhatsApp messages...</div>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Handle Master Switch Toggle
autoReplyToggle.addEventListener('change', async (e) => {
  isUpdatingToggle = true;
  const enabled = e.target.checked;
  try {
    const res = await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const result = await res.json();
    if (result.success) {
      autoReplyToggle.checked = result.isAutoReplyEnabled;
      fetchStatus();
    }
  } catch (err) {
    console.error('Failed toggling auto-responder:', err);
  } finally {
    isUpdatingToggle = false;
  }
});

// Clear AI History
btnClearHistory.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear the conversation context memory?')) return;
  try {
    const res = await fetch('/api/clear-history', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'AI history memory cleared!');
    fetchStatus();
  } catch (err) {
    alert('Error clearing history');
  }
});

// Reset Session / Re-pair QR
btnRePair.addEventListener('click', async () => {
  if (!confirm('This will unlink your current WhatsApp session and generate a new QR code to scan. Continue?')) {
    return;
  }
  try {
    const res = await fetch('/api/reset-session', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Session reset triggered.');
    fetchStatus();
  } catch (err) {
    alert('Error resetting session');
  }
});

// Start real-time polling every 2.5s
fetchStatus();
setInterval(fetchStatus, 2500);
