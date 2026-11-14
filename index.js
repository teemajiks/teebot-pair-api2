import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import yts from "yt-search";
import { formatCommandCatalog, TOTAL_COMMANDS } from "./commands.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = ".";

// Hot-pink TEEBOT 01 logo from your web app
const BOT_LOGO_URL = process.env.BOT_LOGO_URL || "https://teebot2.lovable.app/icons/icon-512.png";

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
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on("creds.update", saveCreds);

    // Setup listener for incoming commands (.play, .vv, .menu, etc.)
    setupMessageHandlers(sock);

    // Setup connection state listener
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed (${statusCode}), reconnecting: ${shouldReconnect}`);
      } else if (connection === "open") {
        console.log(`✅ TEEBOT 01 linked to ${cleanNumber}!`);

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
              `✨ WhatsApp successfully linked!\n` +
              `⚡ *${TOTAL_COMMANDS}+ active commands* loaded.\n` +
              `🎵 Music Player active (*.play <song name>*)\n` +
              `🔓 Anti-View-Once active (*.vv*)\n\n` +
              `Type *${PREFIX}menu* to see all commands anytime.`
          });

          // 2. Send Full Command Catalog text
          await sock.sendMessage(userJid, {
            text: formatCommandCatalog(PREFIX)
          });
        } catch (err) {
          console.error("Failed to send welcome message:", err);
        }
      }
    });

    // Wait 2 seconds for socket initialization, then request pairing code
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

// Command dispatcher
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
      const parts = trimmed.split(/\s+/);
      const command = parts[0].toLowerCase();
      const query = parts.slice(1).join(" ");

      // ==========================================
      // 1. MUSIC PLAYER WITH THUMBNAIL (.play / .song / .mp3)
      // ==========================================
      if ([".play", "!play", ".song", "!song", ".mp3"].includes(command)) {
        if (!query) {
          await sock.sendMessage(chatId, {
            text: "🎵 *Please enter a song name!*\n\n*Example:* `.play Burna Boy City Boys`"
          }, { quoted: msg });
          continue;
        }

        try {
          // 1. Search YouTube for the song
          const search = await yts(query);
          const video = search.videos[0];

          if (!video) {
            await sock.sendMessage(chatId, {
              text: `❌ *No song found for:* "${query}"`
            }, { quoted: msg });
            continue;
          }

          // 2. Send the Thumbnail Preview Card first
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

          // 3. Download MP3 stream from free audio endpoint
          const dlApi = `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`;
          const dlRes = await fetch(dlApi);
          const dlJson = await dlRes.json();
          const audioUrl = dlJson.data?.dl || dlJson.result?.download || dlJson.download;

          if (audioUrl) {
            // 4. Send audio with thumbnail preview in WhatsApp audio bubble
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
              text: `⚠️ *Audio server busy.* Stream directly here:\n🔗 ${video.url}`
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Music command error:", err);
          await sock.sendMessage(chatId, {
            text: "❌ *Could not download music. Please try again.*"
          }, { quoted: msg });
        }
      }

      // ==========================================
      // 2. REVEAL VIEW-ONCE (.vv / .rvo / .reveal)
      // ==========================================
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

      // ==========================================
      // 3. FULL MENU (.menu / .help)
      // ==========================================
      if ([".menu", "!menu", ".help", "!help"].includes(command)) {
        await sock.sendMessage(chatId, {
          image: { url: BOT_LOGO_URL },
          caption: formatCommandCatalog(PREFIX)
        }, { quoted: msg });
      }

      // ==========================================
      // 4. PING (.ping / .alive)
      // ==========================================
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
        
