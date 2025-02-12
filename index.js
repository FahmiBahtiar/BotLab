import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { redisHelpers } from './config/redis.js';

const app = express();
dotenv.config();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('views', path.join(__dirname, 'views'));

app.get("/", (req, res) => {
    res.render("main");
});

const token = process.env.TOKEN;
const url = process.env.VERCEL_URL || 'https://labkom.blimbing.biz.id';

// Initialize bot with webhook in production and polling in development
const bot = new TelegramBot(token, {
    webHook: process.env.NODE_ENV === 'production'
});

// Set webhook if in production mode
if (process.env.NODE_ENV === 'production') {
    const webhookUrl = `${url}/webhook/${token}`;
    bot.setWebHook(webhookUrl)
        .then(() => {
            console.log('[LOG] Webhook set successfully');
        })
        .catch(error => {
            console.error('[LOG] Failed to set webhook:', error);
        });
} else {
    // Use polling only in development
    bot.startPolling()
        .then(() => {
            console.log('[LOG] Polling started successfully');
        })
        .catch(error => {
            console.error('[LOG] Failed to start polling:', error);
        });
}

// Webhook endpoint
app.post(`/webhook/${token}`, (req, res) => {
    bot.handleUpdate(req.body);
    res.sendStatus(200);
});

// Bot commands configuration
const commands = [
    { command: 'response', description: 'Respon permintaan bantuan' }
];

bot.setMyCommands(commands)
    .then(() => {
        console.log('[LOG] Perintah bot berhasil didaftarkan.');
    })
    .catch(err => {
        console.error('[LOG] Gagal mendaftarkan perintah bot:', err);
    });

// Whitelist configuration
const whitelist = ['1105365521'];
let laboran = [
    { chatId: '1105365521', name: 'Fahmi' }
];

const checkWhitelist = (chatId) => {
    return whitelist.includes(chatId);
};

// Request help endpoint
app.get('/request-help', async (req, res) => {
    const labIdentifier = req.headers['lab-identifier'] || 'Unknown';
    
    if (laboran.length === 0) {
        return res.send('Belum ada laboran yang terdaftar.');
    }

    await redisHelpers.setHelpNeeded(true);

    laboran.forEach(lab => {
        if (checkWhitelist(lab.chatId)) {
            bot.sendMessage(lab.chatId, `Dosen membutuhkan bantuan di lab ${labIdentifier}!`);
        }
    });

    console.log(`[LOG] Permintaan bantuan dikirim ke laboran dari lab ${labIdentifier}.`);
    res.send(`Permintaan bantuan telah dikirim ke semua laboran dari lab ${labIdentifier}!`);
});

// Response endpoint
app.post('/response', express.json(), async (req, res) => {
    const isHelpNeeded = await redisHelpers.getHelpNeeded();
    
    if (!isHelpNeeded) {
        console.log(`[LOG] Percobaan mengirim respons tanpa permintaan bantuan aktif.`);
        return res.status(400).send('Tidak ada permintaan bantuan yang aktif.');
    }

    const response = req.body.response;
    const chatId = req.body.chatId;
    const labIdentifier = req.headers['lab-identifier'] || 'Unknown';

    const respondingLab = laboran.find(l => l.chatId === chatId.toString());
    if (!respondingLab) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak terdaftar: ${chatId}`);
        return res.status(403).send('Anda tidak terdaftar sebagai laboran.');
    }

    const laboranName = respondingLab.name;

    await redisHelpers.setLatestResponse({
        chatId: chatId.toString(),
        response: response
    });

    laboran.forEach(lab => {
        if (lab.chatId !== chatId.toString() && checkWhitelist(lab.chatId)) {
            bot.sendMessage(lab.chatId, 
                `Permintaan bantuan dari lab ${labIdentifier} sudah direspon oleh ${laboranName} dengan pesan: ${response}`);
        }
    });

    await redisHelpers.setHelpNeeded(false);
    console.log(`[LOG] Respons diterima dari laboran ${laboranName} (chatId: ${chatId}): ${response}`);
    res.send('Respons diterima!');
});

app.get('/response', async (req, res) => {
    const latestResponse = await redisHelpers.getLatestResponse();
    if (latestResponse) {
        const lab = laboran.find(l => l.chatId === latestResponse.chatId);
        const nama = lab ? lab.name : 'Unknown';
        const pesan = latestResponse.response || 'Tidak ada pesan';
        
        const formattedResponse = `Laboran (${nama}) Merespon Pesan Bapak/Ibu: ${pesan}`;
        console.log(`[LOG] Menampilkan respons terakhir: ${formattedResponse}`);
        res.send(formattedResponse);
        await redisHelpers.setLatestResponse(null);
    } else {
        console.log(`[LOG] Tidak ada respons terakhir.`);
        res.status(204).send();
    }
});

// Bot command handlers
bot.onText(/\/response/, async (msg) => {
    const chatId = msg.chat.id.toString();

    console.log(`[LOG] Command /response digunakan oleh chatId: ${chatId}`);

    if (!checkWhitelist(chatId)) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak diizinkan: ${chatId}`);
        bot.sendMessage(chatId, "Anda tidak diizinkan mengakses bot ini.");
        return;
    }

    const isHelpNeeded = await redisHelpers.getHelpNeeded();
    
    if (!isHelpNeeded) {
        console.log(`[LOG] Percobaan mengirim respons tanpa permintaan bantuan aktif dari chatId: ${chatId}`);
        bot.sendMessage(chatId, "Tidak ada permintaan bantuan yang aktif saat ini.");
        return;
    }

    const lab = laboran.find(l => l.chatId === chatId);
    if (!lab) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak terdaftar: ${chatId}`);
        bot.sendMessage(chatId, "Anda tidak terdaftar sebagai laboran.");
        return;
    }

    bot.sendMessage(chatId, "Silahkan balas pesan yang mau disampaikan:");
    await redisHelpers.setPendingResponse(chatId, true);
});

// Message handler
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id.toString();
        const name = msg.from.first_name || 'Unknown';
        const text = msg.text;

        console.log(`[LOG] Received message from ${chatId}: ${text}`);

        const isPending = await redisHelpers.getPendingResponse(chatId);
        if (!text.startsWith('/') && isPending) {
            await redisHelpers.setPendingResponse(chatId, false);

            try {
                const response = await fetch('https://labkom.blimbing.biz.id/response', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'lab-identifier': 'Unknown'
                    },
                    body: JSON.stringify({ chatId, response: text })
                });

                const data = await response.text();
                console.log(`[LOG] Respons berhasil dikirim oleh chatId: ${chatId}, pesan: "${text}"`);
                await bot.sendMessage(chatId, `Respons Anda telah dikirim: "${text}"`);
            } catch (err) {
                console.error(`[LOG] Gagal mengirim respons dari chatId: ${chatId}, error:`, err);
                await bot.sendMessage(chatId, "Gagal mengirim respons. Silakan coba lagi.");
            }
            return;
        }

        if (!checkWhitelist(chatId)) {
            console.log(`[LOG] Percobaan akses dari chatId yang tidak diizinkan: ${chatId}`);
            bot.sendMessage(chatId, "Anda tidak diizinkan mengakses bot ini.");
            return;
        }

        if (!laboran.some(l => l.chatId === chatId)) {
            laboran.push({ chatId, name });
            console.log(`[LOG] Laboran baru terdaftar: ${name} (chatId: ${chatId})`);
            bot.sendMessage(chatId, `Anda terdaftar sebagai laboran dengan nama ${name}. Siap menerima permintaan bantuan!`);
        }
    } catch (error) {
        console.error('[LOG] Error in message handler:', error);
    }
});

export default app;