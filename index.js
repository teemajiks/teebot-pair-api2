import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
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

// In-memory cache for incoming view-once media so .reveal works even if already opened on phone
const viewOnceCache = new Map();

async function bufferFromStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "TEEBOT 01 Pairing API",
    commands_loaded: TOTAL_COMMANDS,
    time: new Date().toISOString()
  });
});

async function startSession(cleanNumber, res = null) {
  const sessionDir = path.join("/tmp", `teebot_auth_${cleanNumber}`);

  if (activeSockets.has(cleanNumber)) {
    try {
      const oldSock = activeSockets.get(cleanNumber);
      oldSock.ev.removeAllListeners();
      oldSock.end?.();
    } catch (_) {}
    activeSockets.delete(cleanNumber);
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version = [2, 3000, 1042466098];
  try {
    const liveVer = await fetchLatestWaWebVersion();
    if (liveVer && liveVer.version) version = liveVer.version;
  } catch (_) {
    try {
      const baileysVer = fetchLatestBaileysVersion();
      if (baileysVer && baileysVer.version) version = baileysVer.version;
    } catch (_) {}
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "124.0.6367.207"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000
  });

  activeSockets.set(cleanNumber, sock);
  sock.ev.on("creds.update", saveCreds);

  setupMessageHandlers(sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = !isLoggedOut;

      console.log(`Connection closed for ${cleanNumber} (Status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
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

      try {
        const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        await sock.sendMessage(userJid, {
          image: { url: BOT_LOGO_URL },
          caption:
            `╔══════════════════════╗\n` +
            `   🤖 *WELCOME TO TEEBOT 01* 🤖\n` +
            `╚══════════════════════╝\n\n` +
            `✨ WhatsApp successfully linked!\n` +
            `⚡ *${TOTAL_COMMANDS}+ active commands* loaded.\n` +
            `🎵 Music Player (*${PREFIX}play <song name>*)\n` +
            `🔓 Anti-View-Once (*${PREFIX}reveal* / *${PREFIX}vv*)\n` +
            `🤖 AI Assistant (*${PREFIX}ai <question>*)\n\n` +
            `Type *${PREFIX}menu* to view all commands.`
        });

        await sock.sendMessage(userJid, {
          text: formatCommandCatalog(PREFIX)
        });
      } catch (err) {
        console.error("Failed to send welcome message:", err);
      }
    }
  });

  if (res && !res.headersSent) {
    let codeSent = false;
    const timeoutHandle = setTimeout(() => {
      if (!codeSent && !res.headersSent) {
        res.status(504).json({ error: "Timed out generating pair code from WhatsApp" });
      }
    }, 25000);

    const tryPairing = async () => {
      try {
        if (!sock.authState.creds.registered) {
          await new Promise((r) => setTimeout(r, 1500));
          const code = await sock.requestPairingCode(cleanNumber);
          if (!codeSent && !res.headersSent) {
            codeSent = true;
            clearTimeout(timeoutHandle);
            return res.json({ ok: true, code });
          }
        }
      } catch (err) {
        console.error("Pairing code error:", err);
        if (!codeSent && !res.headersSent) {
          clearTimeout(timeoutHandle);
          res.status(500).json({ error: "Failed to generate pairing code", details: err.message });
        }
      }
    };

    setTimeout(tryPairing, 1000);
  }
}

app.get(["/code", "/pair"], async (req, res) => {
  const rawNumber = req.query.number;
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

function setupMessageHandlers(sock) {
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const chatId = msg.key.remoteJid;
      if (!chatId) continue;

      // 0. Auto-cache any view-once messages the split second they arrive
      const rawViewOnce =
        msg.message.viewOnceMessageV2?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message.viewOnceMessageV2Extension?.message;

      if (rawViewOnce && msg.key?.id) {
        const vType = ["imageMessage", "videoMessage", "audioMessage"].find((k) => rawViewOnce[k]);
        if (vType) {
          downloadContentFromMessage(rawViewOnce[vType], vType.replace("Message", ""))
            .then(bufferFromStream)
            .then((buf) => {
              viewOnceCache.set(msg.key.id, {
                buffer: buf,
                type: vType,
                caption: rawViewOnce[vType].caption,
                mimetype: rawViewOnce[vType].mimetype
              });
              if (viewOnceCache.size > 50) {
                const oldest = viewOnceCache.keys().next().value;
                viewOnceCache.delete(oldest);
              }
            })
            .catch(() => {});
        }
      }

      // Extract message content
      const msgContent =
        msg.message.ephemeralMessage?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message.viewOnceMessageV2?.message ||
        msg.message.viewOnceMessageV2Extension?.message ||
        msg.message;

      const body =
        msgContent.conversation ||
        msgContent.extendedTextMessage?.text ||
        msgContent.imageMessage?.caption ||
        msgContent.videoMessage?.caption ||
        "";

      const trimmed = body.trim();
      if (!trimmed.startsWith(PREFIX)) continue;

      const [rawCmd, ...argsList] = trimmed.split(/\s+/);
      const command = rawCmd.toLowerCase();
      const text = argsList.join(" ").trim();

      // 1. PING (.ping / .alive)
      if ([`${PREFIX}ping`, `${PREFIX}alive`].includes(command)) {
        await sock.sendMessage(chatId, {
          text: `⚡ *TEEBOT 01 is Online*\n🤖 Active Commands: ${TOTAL_COMMANDS}\n⏱️ Uptime: ${Math.floor(process.uptime())}s`
        }, { quoted: msg });
        continue;
      }

      // 2. MENU (.menu / .help)
      if ([`${PREFIX}menu`, `${PREFIX}help`].includes(command)) {
        await sock.sendMessage(chatId, {
          image: { url: BOT_LOGO_URL },
          caption:
            `╔══════════════════════╗\n` +
            `   🤖 *TEEBOT 01 COMMAND MENU* 🤖\n` +
            `╚══════════════════════╝\n\n` +
            `⚡ Total Commands: *${TOTAL_COMMANDS}*\n` +
            `📌 Prefix: *${PREFIX}*\n\n` +
            `Full command list is below 👇`
        }, { quoted: msg });

        await sock.sendMessage(chatId, {
          text: formatCommandCatalog(PREFIX)
        });
        continue;
      }

      // 3. REVEAL VIEW-ONCE (.vv / .rvo / .reveal)
      if ([`${PREFIX}vv`, `${PREFIX}rvo`, `${PREFIX}reveal`, `${PREFIX}antiviewonce`].includes(command)) {
        try {
          const quotedContext = msgContent.extendedTextMessage?.contextInfo;
          const quoted = quotedContext?.quotedMessage;

          if (!quoted) {
            await sock.sendMessage(chatId, {
              text: `⚠️ *Please reply to a view-once photo, video, or voice note with ${PREFIX}reveal*`
            }, { quoted: msg });
            continue;
          }

          const quotedStanzaId = quotedContext.stanzaId;

          // Check in-memory cache first (instant & works even if viewed on phone)
          if (quotedStanzaId && viewOnceCache.has(quotedStanzaId)) {
            const cached = viewOnceCache.get(quotedStanzaId);
            if (cached.type === "imageMessage") {
              await sock.sendMessage(chatId, {
                image: cached.buffer,
                caption: cached.caption ? `🔓 *Revealed:* ${cached.caption}` : "🔓 *Revealed View-Once Photo*"
              }, { quoted: msg });
            } else if (cached.type === "videoMessage") {
              await sock.sendMessage(chatId, {
                video: cached.buffer,
                caption: cached.caption ? `🔓 *Revealed:* ${cached.caption}` : "🔓 *Revealed View-Once Video*"
              }, { quoted: msg });
            } else if (cached.type === "audioMessage") {
              await sock.sendMessage(chatId, {
                audio: cached.buffer,
                mimetype: cached.mimetype || "audio/mp4",
                ptt: true
              }, { quoted: msg });
            }
            continue;
          }

          // Fallback: unwrap and download directly
          const actualMsg =
            quoted.viewOnceMessageV2?.message ||
            quoted.viewOnceMessage?.message ||
            quoted.viewOnceMessageV2Extension?.message ||
            quoted.ephemeralMessage?.message ||
            quoted;

          const mediaType = ["imageMessage", "videoMessage", "audioMessage"].find((k) => actualMsg?.[k]);

          if (!mediaType) {
            await sock.sendMessage(chatId, {
              text: "⚠️ *The quoted message is not a view-once image, video, or audio.*"
            }, { quoted: msg });
            continue;
          }

          const mediaObj = actualMsg[mediaType];
          const type = mediaType.replace("Message", "");

          let buffer;
          try {
            const stream = await downloadContentFromMessage(mediaObj, type);
            buffer = await bufferFromStream(stream);
          } catch (e1) {
            buffer = await downloadMediaMessage(
              {
                key: {
                  remoteJid: chatId,
                  id: quotedStanzaId
                },
                message: actualMsg
              },
              "buffer",
              {},
              {
                logger: pino({ level: "silent" }),
                reuploadRequest: sock.updateMediaMessage
              }
            );
          }

          if (!buffer || buffer.length === 0) {
            throw new Error("No media bytes could be downloaded");
          }

          if (mediaType === "imageMessage") {
            await sock.sendMessage(chatId, {
              image: buffer,
              caption: mediaObj.caption ? `🔓 *Revealed:* ${mediaObj.caption}` : "🔓 *Revealed View-Once Photo*"
            }, { quoted: msg });
          } else if (mediaType === "videoMessage") {
            await sock.sendMessage(chatId, {
              video: buffer,
              caption: mediaObj.caption ? `🔓 *Revealed:* ${mediaObj.caption}` : "🔓 *Revealed View-Once Video*"
            }, { quoted: msg });
          } else if (mediaType === "audioMessage") {
            await sock.sendMessage(chatId, {
              audio: buffer,
              mimetype: mediaObj.mimetype || "audio/mp4",
              ptt: true
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Reveal error:", err);
          await sock.sendMessage(chatId, {
            text: `❌ *Could not reveal:* WhatsApp expired the download token because it was already opened on your phone. To reveal, send/receive the view-once and reply *${PREFIX}reveal* immediately!`
          }, { quoted: msg });
        }
        continue;
      }

      // 4. MUSIC PLAYER (.play / .song)
      if ([`${PREFIX}play`, `${PREFIX}song`, `${PREFIX}mp3`].includes(command)) {
        if (!text) {
          await sock.sendMessage(chatId, {
            text: `⚠️ *Usage:* \`${PREFIX}play <song name>\`\n*Example:* \`${PREFIX}play Calm Down Rema\``
          }, { quoted: msg });
          continue;
        }

        try {
          const search = await yts(text);
          const video = search?.videos?.[0];

          if (!video) {
            await sock.sendMessage(chatId, {
              text: `❌ *No song found for:* "${text}"`
            }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption:
              `🎶 *TEEBOT 01 MUSIC PLAYER* 🎶\n\n` +
              `📌 *Title:* ${video.title}\n` +
              `👤 *Artist:* ${video.author?.name || "Unknown"}\n` +
              `⏱️ *Duration:* ${video.timestamp}\n` +
              `👁️ *Views:* ${Number(video.views || 0).toLocaleString()}\n\n` +
              `⏳ *Fetching audio stream...*`
          }, { quoted: msg });

          const dlRes = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`);
          const dlJson = await dlRes.json().catch(() => ({}));
          const audioUrl = dlJson.data?.dl || dlJson.result?.download || dlJson.download;

          if (audioUrl) {
            await sock.sendMessage(chatId, {
              audio: { url: audioUrl },
              mimetype: "audio/mp4",
              fileName: `${video.title}.mp3`,
              contextInfo: {
                externalAdReply: {
                  title: video.title,
                  body: `${video.author?.name || "TEEBOT"} • ${video.timestamp}`,
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
              text: `⚠️ *Audio direct download busy.* Listen here:\n🔗 ${video.url}`
            }, { quoted: msg });
          }
        } catch (err) {
          console.error("Music command error:", err);
          await sock.sendMessage(chatId, {
            text: "❌ *Could not load music right now. Please try again.*"
          }, { quoted: msg });
        }
        continue;
      }

      // 5. AI CHAT (.ai / .gpt / .ask)
      if ([`${PREFIX}ai`, `${PREFIX}gpt`, `${PREFIX}ask`].includes(command)) {
        if (!text) {
          await sock.sendMessage(chatId, {
            text: `⚠️ *Usage:* \`${PREFIX}ai <your question>\`\n*Example:* \`${PREFIX}ai Explain quantum computing simply\``
          }, { quoted: msg });
          continue;
        }

        try {
          const aiRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(text)}`);
          const reply = await aiRes.text();
          await sock.sendMessage(chatId, {
            text: `🤖 *TEEBOT AI:*\n\n${reply.slice(0, 1500)}`
          }, { quoted: msg });
        } catch (err) {
          await sock.sendMessage(chatId, {
            text: "❌ *AI service currently unreachable. Try again in a minute.*"
          }, { quoted: msg });
        }
        continue;
      }

      // 6. CALCULATOR (.calc / .math)
      if ([`${PREFIX}calc`, `${PREFIX}math`].includes(command)) {
        if (!text) {
          await sock.sendMessage(chatId, {
            text: `⚠️ *Usage:* \`${PREFIX}calc <expression>\`\n*Example:* \`${PREFIX}calc 45 * (12 + 8)\``
          }, { quoted: msg });
          continue;
        }

        try {
          if (!/^[0-9+\-*/().\s^%]+$/.test(text)) {
            await sock.sendMessage(chatId, {
              text: "⚠️ *Invalid expression.* Use only numbers and operators `+ - * / ( ) ^ %`"
            }, { quoted: msg });
            continue;
          }
          const sanitized = text.replace(/\^/g, "**");
          const result = Function(`"use strict"; return (${sanitized})`)();
          await sock.sendMessage(chatId, {
            text: `🧮 *Math Result:*\n\`${text} = ${result}\``
          }, { quoted: msg });
        } catch (_) {
          await sock.sendMessage(chatId, {
            text: "❌ *Calculation error.* Check your expression."
          }, { quoted: msg });
        }
        continue;
      }

      // 7. RANDOM QUOTE (.quote)
      if (command === `${PREFIX}quote`) {
        const quotes = [
          "“The only way to do great work is to love what you do.” — Steve Jobs",
          "“Success is not final, failure is not fatal: it is the courage to continue that counts.” — Winston Churchill",
          "“Code is like humor. When you have to explain it, it’s bad.” — Cory House",
          "“Simplicity is the soul of efficiency.” — Austin Freeman",
          "“Action is the foundational key to all success.” — Pablo Picasso"
        ];
        const pick = quotes[Math.floor(Math.random() * quotes.length)];
        await sock.sendMessage(chatId, { text: `📜 *Quote of the Moment:*\n\n${pick}` }, { quoted: msg });
        continue;
      }

      // 8. RANDOM FACT (.fact)
      if (command === `${PREFIX}fact`) {
        const facts = [
          "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still edible!",
          "Octopuses have three hearts, and their blood is blue because it uses copper instead of iron.",
          "The first computer bug was an actual moth stuck inside a Harvard Mark II computer in 1947.",
          "Bananas are curved because they grow towards the sun against gravity.",
          "Sound travels about 4.3 times faster in water than in air."
        ];
        const pick = facts[Math.floor(Math.random() * facts.length)];
        await sock.sendMessage(chatId, { text: `💡 *Did you know?*\n\n${pick}` }, { quoted: msg });
        continue;
      }
    }
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TEEBOT 01 listening on port ${PORT}`);
});
          
