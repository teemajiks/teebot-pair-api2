import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";
import { formatCommandCatalog, TOTAL_COMMANDS } from "./commands.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = ".";

// Hosted logo URL (hot-pink TEEBOT 01 robot)
const BOT_LOGO_URL = process.env.BOT_LOGO_URL || "https://teebot2.lovable.app/icons/icon-512.png";

let activeSocket = null;
let activeAuthState = null;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "TEEBOT 01 Pairing API",
    commands_loaded: TOTAL_COMMANDS,
    time: new Date().toISOString()
  });
});

// Pairing code endpoint called by your Lovable website
app.get(["/code", "/pair"], async (req, res) => {
  const rawNumber = req.query.number || req.query.phone;
  if (!rawNumber) {
    return res.status(400).json({ error: "Missing 'number' parameter" });
  }

  const cleanNumber = String(rawNumber).replace(/\D/g, "");
  if (cleanNumber.length < 8 || cleanNumber.length > 15) {
    return res.status(400).json({ error: "Phone number must be between 8 and 15 digits" });
  }

  const sessionDir = path.join("/tmp", `teebot_auth_${cleanNumber}`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    activeAuthState = { state, saveCreds, sessionDir };
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    activeSocket = sock;
    sock.ev.on("creds.update", saveCreds);

    // Setup listener for incoming commands (.vv, .menu, etc.)
    setupMessageHandlers(sock);

    // Setup connection state listener
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed (code ${statusCode}), reconnect: ${shouldReconnect}`);
      } else if (connection === "open") {
        console.log(`✅ TEEBOT 01 successfully linked to ${cleanNumber}!`);

        // Send Welcome Message + Commands to linked user
        try {
          const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

          // 1. Send Logo + Welcome Card
          await sock.sendMessage(userJid, {
            image: { url: BOT_LOGO_URL },
            caption:
              `╔══════════════════════╗\n` +
              `   🤖 *WELCOME TO TEEBOT 01* 🤖\n` +
              `╚══════════════════════╝\n\n` +
              `✨ Your WhatsApp has been successfully paired!\n` +
              `⚡ *${TOTAL_COMMANDS}+ active commands* loaded.\n` +
              `🔓 Anti-View-Once enabled! (Reply to any view-once with *.vv*)\n\n` +
              `Type *${PREFIX}menu* to view all commands anytime.\n\n` +
              `_Sending full command list below..._`
          });

          // 2. Send Full Command Catalog text
          await sock.sendMessage(userJid, {
            text: formatCommandCatalog(PREFIX)
          });

          console.log(`Sent welcome banner and catalog to ${userJid}`);
        } catch (err) {
          console.error("Failed to send welcome message:", err);
        }
      }
    });

    // Wait a brief moment for socket initialization, then request pairing code
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const code = await sock.requestPairingCode(cleanNumber);

    return res.json({
      ok: true,
      code,
      number: cleanNumber,
      message: "Pairing code generated successfully"
    });
  } catch (err) {
    console.error("Error generating pairing code:", err);
    return res.status(500).json({
      error: "Failed to generate pairing code",
      details: err.message
    });
  }
});

// Command dispatcher: executes .vv, .menu, .ping, etc.
function setupMessageHandlers(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const chatId = msg.key.remoteJid;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      const trimmed = text.trim();
      const command = trimmed.split(/\s+/)[0].toLowerCase();

      // ==========================================
      // 1. REVEAL / ANTI-VIEW-ONCE COMMAND (.vv)
      // ==========================================
      if ([".vv", "!vv", ".rvo", ".reveal", ".antiviewonce"].includes(command)) {
        try {
          const quotedContext = msg.message?.extendedTextMessage?.contextInfo;
          const quotedMsg = quotedContext?.quotedMessage;

          if (!quotedMsg) {
            await sock.sendMessage(chatId, {
              text: "❌ *Reply to a view-once photo, video, or voice note with .vv to reveal it.*"
            }, { quoted: msg });
            continue;
          }

          // Unwrap Baileys view-once wrappers
          const actualMsg =
            quotedMsg.viewOnceMessageV2?.message ||
            quotedMsg.viewOnceMessage?.message ||
            quotedMsg.viewOnceMessageV2Extension?.message ||
            quotedMsg;

          const isImage = !!actualMsg.imageMessage;
          const isVideo = !!actualMsg.videoMessage;
          const isAudio = !!actualMsg.audioMessage;

          if (!isImage && !isVideo && !isAudio) {
            await sock.sendMessage(chatId, {
              text: "⚠️ *The quoted message is not view-once media.*"
            }, { quoted: msg });
            continue;
          }

          // Download media buffer
          const buffer = await downloadMediaMessage(
            { message: actualMsg },
            "buffer",
            {},
            { logger: pino({ level: "silent" }) }
          );

          if (isImage) {
            await sock.sendMessage(chatId, {
              image: buffer,
              caption: actualMsg.imageMessage.caption
                ? `🔓 *Revealed:* ${actualMsg.imageMessage.caption}`
                : "🔓 *Revealed View-Once Photo*"
            }, { quoted: msg });
          } else if (isVideo) {
            await sock.sendMessage(chatId, {
              video: buffer,
              caption: actualMsg.videoMessage.caption
                ? `🔓 *Revealed:* ${actualMsg.videoMessage.caption}`
                : "🔓 *Revealed View-Once Video*"
            }, { quoted: msg });
          } else if (isAudio) {
            await sock.sendMessage(chatId, {
              audio: buffer,
              mimetype: actualMsg.audioMessage.mimetype || "audio/mp4",
              ptt: true // resend as playable voice note
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Failed to reveal view-once:", err);
          await sock.sendMessage(chatId, {
            text: "❌ *Failed to reveal media. The message might have expired or been purged.*"
          }, { quoted: msg });
        }
      }

      // ==========================================
      // 2. FULL MENU COMMAND (.menu / .help)
      // ==========================================
      if ([".menu", "!menu", ".help", "!help", ".list"].includes(command)) {
        await sock.sendMessage(chatId, {
          image: { url: BOT_LOGO_URL },
          caption: formatCommandCatalog(PREFIX)
        }, { quoted: msg });
      }

      // ==========================================
      // 3. PING / STATUS COMMAND (.ping / .alive)
      // ==========================================
      if ([".ping", "!ping", ".alive"].includes(command)) {
        await sock.sendMessage(chatId, {
          text: `⚡ *Pong! TEEBOT 01 is active & online.*\n🤖 Loaded Commands: ${TOTAL_COMMANDS}\n⏱️ Uptime: ${Math.floor(process.uptime())}s`
        }, { quoted: msg });
      }
    }
  });
}

app.listen(PORT, () => {
  console.log(`TEEBOT 01 server listening on port ${PORT}`);
  console.log(`Total commands registered: ${TOTAL_COMMANDS}`);
});
            
