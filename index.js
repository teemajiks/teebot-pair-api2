import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";
import yts from "yt-search";
import { formatCommandCatalog, TOTAL_COMMANDS } from "./commands.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = ".";

// Hot-pink TEEBOT 01 logo from your web app
const BOT_LOGO_URL = process.env.BOT_LOGO_URL || "https://teebot2.lovable.app/icons/icon-512.png";

// Store active sockets in memory: phoneNumber -> sock
const activeSockets = new Map();

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "TEEBOT 01 Pairing API",
    commands_loaded: TOTAL_COMMANDS,
    time: new Date().toISOString()
  });
});

/**
 * Initializes and manages a Baileys WhatsApp socket for a specific phone number.
 * If res is passed, it generates and responds with the 8-character pairing code.
 */
async function startSession(cleanNumber, res = null) {
  const sessionDir = path.join("/tmp", `teebot_auth_${cleanNumber}`);

  // If a socket is already active for this number, close it cleanly
  if (activeSockets.has(cleanNumber)) {
    try {
      const oldSock = activeSockets.get(cleanNumber);
      oldSock.ev.removeAllListeners("connection.update");
      oldSock.end(undefined);
    } catch (_) {}
    activeSockets.delete(cleanNumber);
  }

  // If new pairing request (res present), clear any unfinished auth files
  if (res && fs.existsSync(sessionDir)) {
    try {
      const credsPath = path.join(sessionDir, "creds.json");
      const isLinked = fs.existsSync(credsPath) && JSON.parse(fs.readFileSync(credsPath, "utf-8"))?.registered;
      if (!isLinked) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (_) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Fetch the real, live WhatsApp Web protocol version
  let version = [2, 3000, 1042466098];
  try {
    const waVer = await fetchLatestWaWebVersion({});
    if (waVer?.version) version = waVer.version;
  } catch (_) {
    try {
      const bVer = await fetchLatestBaileysVersion();
      if (bVer?.version) version = bVer.version;
    } catch (_) {}
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    // Real Chrome browser signature recognized by WhatsApp companion registration
    browser: ["Ubuntu", "Chrome", "124.0.6367.207"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });

  activeSockets.set(cleanNumber, sock);
  sock.ev.on("creds.update", saveCreds);

  // Attach command handler (.play, .vv, .menu, etc.)
  setupMessageHandlers(sock);

  // CRITICAL: Connection state handler with automatic reconnection
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = !isLoggedOut;

      console.log(`Connection closed for ${cleanNumber} (Status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Automatically reconnect so the socket stays listening while the user types the code!
        setTimeout(() => {
          startSession(cleanNumber, null).catch(console.error);
        }, 2000);
      } else {
        activeSockets.delete(cleanNumber);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (_) {}
      }
    } else if (connection === "open") {
      console.log(`✅ TEEBOT 01 successfully linked to ${cleanNumber}!`);

      // Send Welcome Message + Commands upon linking
      try {
        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        // 1. Logo + Welcome Card
        await sock.sendMessage(userJid, {
          image: { url: BOT_LOGO_URL },
          caption:
            `╔══════════════════════╗\n` +
            `   🤖 *WELCOME TO TEEBOT 01* 🤖\n` +
            `╚══════════════════════╝\n\n` +
            `✨ WhatsApp successfully linked!\n` +
            `⚡ *${TOTAL_COMMANDS}+ active commands* loaded.\n` +
            `🎵 Music Player active (*${PREFIX}play <song name>*)\n` +
            `🔓 Anti-View-Once active (*${PREFIX}vv*)\n\n` +
            `Type *${PREFIX}menu* to see all commands anytime.`
        });

        // 2. Full Command Catalog
        await sock.sendMessage(userJid, {
          text: formatCommandCatalog(PREFIX)
        });
      } catch (err) {
        console.error("Failed to send welcome message:", err);
      }
    }
  });

  // Request the 8-character pairing code if this is a new link request
  if (res) {
    setTimeout(async () => {
      try {
        if (!sock.authState.creds.registered) {
          const code = await sock.requestPairingCode(cleanNumber);
          if (!res.headersSent) {
            return res.json({
              ok: true,
              code,
              number: cleanNumber,
              message: "Pairing code generated successfully"
            });
          }
        } else {
          if (!res.headersSent) {
            return res.json({
              ok: true,
              message: "Device is already linked!"
            });
          }
        }
      } catch (err) {
        console.error(`Pairing code error for ${cleanNumber}:`, err);
        if (!res.headersSent) {
          return res.status(500).json({
            error: "Failed to generate pairing code",
            details: err.message
          });
        }
      }
    }, 3000);
  }
}

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

  try {
    await startSession(cleanNumber, res);
  } catch (err) {
    console.error("Route error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start pairing session", details: err.message });
    }
  }
});

// Command dispatcher
function setupMessageHandlers(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const chatId = msg.key.remoteJid;
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      const trimmed = body.trim();
      const command = trimmed.split(" ")[0].toLowerCase();
      const args = trimmed.split(" ").slice(1);

      // 1. MUSIC PLAYER (.play / .song)
      if ([".play", "!play", ".song", "!song"].includes(command)) {
        const query = args.join(" ");
        if (!query) {
          await sock.sendMessage(chatId, {
            text: `⚠️ *Usage:* \`${PREFIX}play <song name>\`\n*Example:* \`${PREFIX}play Calm Down Rema\``
          }, { quoted: msg });
          continue;
        }

        try {
          const search = await yts(query);
          const video = search.videos[0];

          if (!video) {
            await sock.sendMessage(chatId, {
              text: `❌ *No song found for:* "${query}"`
            }, { quoted: msg });
            continue;
          }

          // Send song info card with thumbnail
          await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption:
              `🎶 *TEEBOT 01 MUSIC PLAYER* 🎶\n\n` +
              `📌 *Title:* ${video.title}\n` +
              `👤 *Artist:* ${video.author.name}\n` +
              `⏱️ *Duration:* ${video.timestamp}\n` +
              `👁️ *Views:* ${video.views.toLocaleString()}\n\n` +
              `⏳ *Sending audio file now...*`
          }, { quoted: msg });

          const dlApi = `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`;
          const dlRes = await fetch(dlApi);
          const dlJson = await dlRes.json();
          const audioUrl = dlJson.data?.dl || dlJson.result?.download || dlJson.download;

          if (audioUrl) {
            await sock.sendMessage(chatId, {
              audio: { url: audioUrl },
              mimetype: "audio/mp4",
              fileName: `${video.title}.mp3`,
              contextInfo: {
                externalAdReply: {
                  title: video.title,
                  body: `${video.author.name} • ${video.timestamp}`,
                  thumbnailUrl: video.thumbnail,
                  mediaType: 2,
                  mediaUrl: video.url,
                  sourceUrl: video.url,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: msg });
          } else {
            await sock.sendMessage(chatId, {
              text: `⚠️ *Audio stream busy.* Listen directly:\n🔗 ${video.url}`
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Music command error:", err);
          await sock.sendMessage(chatId, {
            text: "❌ *Could not download music. Please try again.*"
          }, { quoted: msg });
        }
      }

      // 2. REVEAL VIEW-ONCE (.vv / .rvo / .reveal)
      if ([".vv", "!vv", ".rvo", ".reveal", ".antiviewonce"].includes(command)) {
        try {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(chatId, {
              text: "❌ *Reply to a view-once photo, video, or voice note with .vv*"
            }, { quoted: msg });
            continue;
          }

          const actualMsg =
            quoted.viewOnceMessageV2?.message ||
            quoted.viewOnceMessage?.message ||
            quoted.viewOnceMessageV2Extension?.message ||
            quoted;

          const isImage = !!actualMsg.imageMessage;
          const isVideo = !!actualMsg.videoMessage;
          const isAudio = !!actualMsg.audioMessage;

          if (!isImage && !isVideo && !isAudio) {
            await sock.sendMessage(chatId, {
              text: "⚠️ *The quoted message is not view-once media.*"
            }, { quoted: msg });
            continue;
          }

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
              ptt: true
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Reveal error:", err);
          await sock.sendMessage(chatId, {
            text: "❌ *Failed to reveal media.*"
          }, { quoted: msg });
        }
      }

      // 3. FULL MENU (.menu / .help)
      if ([".menu", "!menu", ".help", "!help"].includes(command)) {
        await sock.sendMessage(chatId, {
          image: { url: BOT_LOGO_URL },
          caption: formatCommandCatalog(PREFIX)
        }, { quoted: msg });
      }

      // 4. PING (.ping / .alive)
      if ([".ping", "!ping", ".alive"].includes(command)) {
        await sock.sendMessage(chatId, {
          text: `⚡ *TEEBOT 01 is Online*\n🤖 Total Commands: ${TOTAL_COMMANDS}\n⏱️ Uptime: ${Math.floor(process.uptime())}s`
        }, { quoted: msg });
      }
    }
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TEEBOT 01 listening on port ${PORT}`);
});
            
