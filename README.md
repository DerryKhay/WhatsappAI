# 🤖 WhatsApp AI Auto-Responder & Control Dashboard

An intelligent, context-aware WhatsApp auto-responder bot and live web dashboard built with Node.js, [Baileys](https://github.com/WhiskeySockets/Baileys), and powered by **Google Gemini** or **OpenAI**.

It links directly to your personal WhatsApp account via QR code, listens for incoming personal messages, remembers conversation context, and allows you to **toggle the bot ON/OFF anytime 24/7** from either the **Web Dashboard** or directly via **WhatsApp chat commands**.

---

## 🌟 Key Features

- **🌐 Live Web Dashboard**: Interactive browser control panel at `http://localhost:3000` with an instant ON/OFF toggle switch, real-time message activity feed, connected phone info, and browser QR code viewer.
- **📱 WhatsApp Remote Chat Commands**: Toggle auto-replies directly from your phone by texting `!bot on`, `!bot off`, or `!bot status`.
- **🔗 Personal Account Linking**: Connects directly via WhatsApp Multi-Device (QR code scan). No Meta Business verification or credit card required.
- **🧠 Smart AI Brain**: Powered by **Google Gemini** (Gemini 3.5 Flash Lite) with full conversational context memory.
- **⚡ Message Debounce & Batching**: If a contact sends multiple messages in a row, the bot aggregates them and replies with a single cohesive answer.
- **✍️ Realistic Presence**: Shows WhatsApp "typing..." status while generating answers.
- **🛡️ Anti-Spam & Privacy**: Ignores group chats, self-messages, and status broadcasts automatically.

---

## 🚀 Quick Start

### 1. Configure Your Settings

Open `.env` in the project folder:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 2. Start the Application

```bash
npm start
```

### 3. Open the Web Dashboard or Scan QR in Terminal

- **In Your Browser**: Open [http://localhost:3000](http://localhost:3000) to view the live dashboard and scan the QR code directly from your screen.
- **In WhatsApp**: On your phone, go to **Settings** (iOS) or **⋮ Menu** (Android) -> **Linked Devices** -> **Link a Device**, and scan the QR code.

---

## 🔘 How to Toggle the Bot 24/7

You have two instant ways to toggle the auto-responder:

### Option A: From the Web Dashboard
1. Open `http://localhost:3000`.
2. Click the **Master Toggle Switch** to immediately switch between:
   - 🟢 **ACTIVE**: Auto-responding intelligently to all incoming messages.
   - 🔴 **PAUSED**: Listening silently without sending any automated replies.

### Option B: From WhatsApp Chat
Send these commands from your own phone (or another phone):
- `!bot off` — Immediately pauses the auto-responder.
- `!bot on` — Immediately resumes the auto-responder.
- `!bot status` — Displays live bot status, AI provider, and message stats.
- `!clear` — Clears conversation context memory for that specific contact.

---

## ☁️ Hosting 24/7 (Why Not Netlify?)

> [!IMPORTANT]
> **Why Netlify cannot host WhatsApp bots:**
> Netlify is a **serverless platform**. Serverless functions shut down automatically after 10–26 seconds and do not allow persistent TCP/WebSocket connections. A WhatsApp bot must maintain an **unbroken, continuous WebSocket connection 24/7** and requires a persistent disk folder (`auth_info/`) to preserve your WhatsApp login keys.

Here are the two best ways to run your bot 24/7:

---

### Option 1: 24/7 Local Background Service on Mac (Easiest & Free)

Using **PM2** (Process Manager), the bot will run in the background 24/7 without needing any terminal window open, and will automatically restart if your Mac reboots:

1. Install PM2:
   ```bash
   npm install -g pm2
   ```
2. Start the bot with PM2:
   ```bash
   pm2 start src/index.js --name "whatsapp-bot"
   ```
3. Set it to auto-launch on startup:
   ```bash
   pm2 save
   pm2 startup
   ```
4. Useful commands:
   - View live logs: `pm2 logs whatsapp-bot`
   - View dashboard: Open `http://localhost:3000`
   - Stop bot: `pm2 stop whatsapp-bot`
   - Restart bot: `pm2 restart whatsapp-bot`

---

### Option 2: 24/7 Cloud Hosting (Render or Railway)

If you want the bot to run even when your Mac is shut down or sleeping, deploy it to a persistent cloud container:

#### Deploying on Render (Free / Inexpensive Web Service)
1. Push this project folder to your GitHub repository.
2. Sign up at [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Select your repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm ci`
   - **Start Command**: `node src/index.js`
5. Add your Environment Variables in the Render dashboard:
   - `GEMINI_API_KEY`: *(your key)*
   - `GEMINI_MODEL`: `gemini-3.5-flash-lite`
   - `AI_PROVIDER`: `gemini`
   - `PORT`: `3000`
6. Add a **Persistent Disk** on Render mounted at `/app/auth_info` (so your WhatsApp login stays linked across reboots).
7. Deploy! You can then open your Render public URL to view the Web Dashboard and scan the QR code to link your account.

#### Deploying on Railway
1. Push to GitHub and connect repository to [Railway.app](https://railway.app).
2. Add a **Persistent Volume** mounted at `/app/auth_info`.
3. Set your environment variables in the Railway dashboard.
4. Railway will automatically build using the included [`Dockerfile`](file:///Users/derrykhay/Desktop/AI_Chats/Dockerfile).

---

## ⚙️ Configuration Reference (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Web Dashboard |
| `AI_PROVIDER` | `gemini` | `gemini` or `openai` |
| `GEMINI_API_KEY` | *(your key)* | Your Google Gemini API key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model name |
| `OWNER_NAME` | `Derry` | Name used in system persona |
| `AUTO_REPLY_GROUPS` | `false` | Set `true` to auto-respond in group chats |
| `DEBOUNCE_DELAY_MS` | `2500` | Aggregation delay in ms for rapid incoming texts |
| `ENABLE_TYPING_INDICATOR` | `true` | Show 'typing...' status in WhatsApp |
| `ALLOWED_NUMBERS` | *(empty)* | Optional comma-separated whitelist |
| `BLOCKED_NUMBERS` | *(empty)* | Optional comma-separated blacklist |
