import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "online", service: "TEEBOT 01 Pairing API" });
});

// Pairing code endpoint: GET /code?number=234... or GET /pair?number=234...
const handlePairing = async (req, res) => {
  let rawNumber = req.query.number || req.body?.number;

  if (!rawNumber) {
    return res.status(400).json({ error: "Missing 'number' parameter" });
  }

  // Sanitize number (digits only)
  const number = String(rawNumber).replace(/\D/g, "");

  if (number.length < 8 || number.length > 15) {
    return res.status(400).json({ error: "Invalid phone number length" });
  }

  const sessionDir = path.join("/tmp", `session_${Date.now()}_${number}`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on("creds.update", saveCreds);

    // Allow socket to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Request the pairing code from WhatsApp
    const code = await sock.requestPairingCode(number);

    // Clean up temporary session folder in background after sending
    setTimeout(() => {
      try {
        sock.end();
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        // ignore cleanup error
      }
    }, 120000);

    return res.json({ ok: true, code });
  } catch (err) {
    console.error("Pairing code error:", err);
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}
    return res.status(500).json({ error: "Failed to generate pairing code" });
  }
};

app.get("/code", handlePairing);
app.get("/pair", handlePairing);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TEEBOT Pairing API running on port ${PORT}`);
});
    
