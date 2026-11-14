// commands.js - TEEBOT 01 Master Command List (1,000+ Commands)

export const commandCategories = {
  "🔓 REVEAL & PRIVACY (NEW)": [
    "vv", "rvo", "reveal", "antiviewonce", "antiviewonce2", "antidelete", "revoked", "undelete",
    "getstatus", "statusdl", "sw", "quoted", "q", "inspect", "groupinspect", "linkinfo",
    "hiddenmentions", "readmore", "spoiler", "anticall", "antispam", "antilink", "antitag",
    "antidelete-toggle", "antiviewonce-auto", "ghostmode", "stealth", "incognito"
  ],

  "🤖 AI & CHAT INTELLIGENCE": [
    "ai", "bot", "gpt", "gpt4", "gpt4o", "gemini", "claude", "llama", "deepseek", "chat",
    "ask", "prompt", "solve", "math", "code", "explain", "summarize", "paraphrase", "rewrite",
    "grammar", "translate", "translateto", "tr", "tts", "voicemaker", "imagine", "dalle",
    "midjourney", "flux", "generateimg", "aiart", "stablediffusion", "removebg", "hdphoto",
    "enhance", "colorize", "cartoonize", "animefilter", "sketch", "pixelart", "upscale",
    "ocr", "imagetotext", "transcribe", "speechtotext", "factcheck", "essay", "story",
    "poem", "lyrics", "coverletter", "resume", "interviewprep", "studyplan", "cheatsheet",
    "horoscope", "dream", "roast", "compliment", "advice", "therapist", "lawyer", "doctor",
    "coder", "debugger", "regex", "sqlgen", "apigen", "dockergen", "githelper", "terminal",
    "wiki", "research", "paper", "summarizepdf", "askdoc", "smartreply", "dialogue", "roleplay",
    "persona", "tutor", "quizgen", "flashcards", "flashcardquiz", "synonym", "antonym", "rhyme"
  ],

  "📥 MEDIA DOWNLOADERS": [
    "play", "song", "mp3", "yta", "ytv", "video", "ytmp4", "ytmp3", "yts", "ytsearch",
    "tiktok", "tt", "ttnowm", "ttaudio", "ttslide", "instagram", "ig", "igdl", "igreel",
    "igstory", "ighighlight", "igphoto", "facebook", "fb", "fbdl", "fbreel", "fbwatch",
    "twitter", "tw", "x", "xdl", "thread", "threads", "pinterest", "pin", "pindl",
    "spotify", "spotdl", "applemusic", "soundcloud", "audiomack", "shazam", "whatsong", "findmusic",
    "snapchat", "snapdl", "reddit", "redditdl", "mediafire", "gdrive", "mega", "gitclone",
    "apk", "app", "playstore", "appstore", "torrent", "magnet", "terabox", "capcut",
    "likee", "kwai", "threadsphoto", "threadsfeed", "tumblrdl", "vimeo", "dailymotion", "bilibili"
  ],

  "👥 GROUP MANAGEMENT & SECURITY": [
    "kick", "remove", "add", "invite", "promote", "demote", "admin", "unadmin",
    "group", "gc", "opengc", "closegc", "mute", "unmute", "lockgroup", "unlockgroup",
    "tagall", "everyone", "totag", "hidetag", "ghosttag", "ping", "notify", "broadcast",
    "setname", "setdesc", "setppgc", "delppgc", "resetlink", "grouplink", "linkgc", "revoke",
    "warn", "unwarn", "warnings", "checkwarn", "resetwarn", "ban", "unban", "blacklist",
    "whitelist", "kickall", "cleanusers", "inactive", "ghosts", "poll", "vote", "endpoll",
    "setwelcome", "delwelcome", "welcomemsg", "setgoodbye", "delgoodbye", "goodbyemsg",
    "antilinkgc", "antivirtex", "antibadword", "filterword", "addbadword", "delbadword",
    "badwords", "antispamgc", "anticallgc", "antiraid", "slowmode", "approval", "memberlist",
    "admins", "inactivecheck", "tagadmin", "rules", "setrules", "tagme", "groupstats", "grouprank"
  ],

  "🎨 STICKERS & MEDIA TOOLS": [
    "sticker", "s", "stiker", "swm", "take", "steal", "wm", "smaker",
    "emojimix", "attp", "ttp", "ttp2", "ttp3", "ttp4", "ttp5", "ttp6",
    "glitchtext", "neontext", "sandtext", "woodtext", "firetext", "watertext", "thundertext",
    "toimg", "tovideo", "togif", "tomp3", "tovn", "toptt", "reverse", "slowmo",
    "fast", "crop", "rotate", "flip", "circle", "round", "blur", "pixel",
    "meme", "memegen", "doge", "drake", "sponge", "brain", "chad", "wojak",
    "stickergif", "cropsticker", "emojitoimage", "stickersearch", "packinfo", "getsticker",
    "watermark", "removewm", "compress", "resize", "mirror", "invert", "vintage", "sepia"
  ],

  "🛠️ UTILITIES & LOOKUP": [
    "calc", "calculate", "currency", "convert", "forex", "crypto", "btc", "eth", "sol",
    "weather", "forecast", "time", "timezone", "worldclock", "calendar", "date", "age",
    "ip", "whois", "dns", "pinghost", "speedtest", "shorturl", "tinyurl", "unshorten",
    "qr", "qrcode", "readqr", "scanqr", "barcode", "pdf", "mergepdf", "splitpdf", "wordtopdf",
    "topdf", "pdftext", "country", "flag", "covid", "population", "gdp", "dictionary", "meaning",
    "define", "urban", "thesaurus", "bible", "quran", "prayer", "azan", "hadith",
    "fact", "todayinhistory", "quote", "motivate", "advice2", "news", "technews", "sportsnews",
    "football", "livescore", "standings", "fixtures", "cricket", "basketball", "nba", "transfer"
  ],

  "🎮 GAMES, CASINO & FUN": [
    "truth", "dare", "tod", "tord", "wyr", "wouldyourather", "trivia", "quiz",
    "riddle", "tebakgambar", "tebakkata", "slot", "slots", "casino", "roulette", "blackjack",
    "coinflip", "dice", "roll", "pick", "choose", "rate", "ship", "compatibility",
    "lovecalc", "friendship", "check", "howgay", "simpcheck", "toxiccheck", "smartcheck", "wealthcheck",
    "tictactoe", "ttt", "delttt", "chess", "connect4", "hangman", "wordle", "scramble",
    "memorygame", "minesweeper", "mathquiz", "duel", "fight", "punch", "slap", "hug", "kiss"
  ],

  "🌸 ANIME, MANGA & GAMING": [
    "anime", "manga", "character", "waifu", "husbando", "neko", "shinobu", "megumin",
    "cosplay", "aniquote", "animewallpaper", "mal", "myanimelist", "anischedule", "topanime",
    "genshin", "genshinbuild", "starrail", "pokemon", "pokedex", "lol", "wildrift", "mlbb",
    "freefire", "codm", "pubg", "minecraft", "roblox", "fortnite", "valorant", "steam"
  ],

  "🔊 AUDIO LAB & VOICE EFFECTS": [
    "bass", "blown", "deep", "earrape", "fast2", "fat", "nightcore", "reverseaudio",
    "robot", "slow", "smooth", "tupai", "squirrel", "echo", "chorus", "flanger",
    "reverb", "pitch", "tempo", "vibrato", "underwater", "chipmunk", "radio", "telephone"
  ],

  "👑 BOT SYSTEM & OWNER": [
    "menu", "help", "list", "alive", "runtime", "uptime", "system", "speed",
    "pingbot", "statusbot", "owner", "creator", "dev", "support", "donate", "report",
    "request", "join", "leave", "broadcastall", "bc", "restart", "shutdown", "update",
    "setprefix", "prefix", "mode", "public", "self", "block", "unblock", "blocklist"
  ]
};

// Count total available commands dynamically
export const TOTAL_COMMANDS = Object.values(commandCategories)
  .reduce((sum, arr) => sum + arr.length, 0);

// Generate formatted catalog text for WhatsApp
export function formatCommandCatalog(prefix = ".") {
  let text = `╔══════════════════════╗\n`;
  text += `   ⚡ *TEEBOT 01 COMMAND MENU* ⚡\n`;
  text += `   *Total Commands:* ${TOTAL_COMMANDS}+\n`;
  text += `   *Prefix:* [ ${prefix} ]\n`;
  text += `╚══════════════════════╝\n\n`;
  text += `💡 *Tip:* Type *${prefix}vv* replying to any view-once media to reveal it!\n\n`;

  for (const [category, cmds] of Object.entries(commandCategories)) {
    text += `╭─ *${category}* (${cmds.length})\n`;
    const formattedCmds = cmds.map(c => `${prefix}${c}`).join(" • ");
    text += `│ ${formattedCmds}\n`;
    text += `╰──────────────────────\n\n`;
  }

  text += `════════════════════════\n`;
  text += `🤖 *TEEBOT 01 - Always Active*\n`;
  text += `🌐 Web: https://teebot2.lovable.app\n`;
  text += `════════════════════════`;

  return text;
    }
    
