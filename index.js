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
const bot = new TelegramBot(token, { polling: true });

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

const whitelist = ['1105365521','1324267240'];
let laboran = [
    { chatId: '1105365521', name: 'Fahmi' }
    { chatId: '1324267240', name: 'Faqih' }
];

const checkWhitelist = (chatId) => {
    return whitelist.includes(chatId);
};

// Modified endpoint untuk menerima permintaan bantuan
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

// Modified endpoint untuk menerima respons dari laboran
app.post('/response', express.json(), async (req, res) => {
    const isHelpNeeded = await redisHelpers.getHelpNeeded();
    
    if (!isHelpNeeded) {
        console.log(`[LOG] Percobaan mengirim respons tanpa permintaan bantuan aktif.`);
        return res.status(400).send('Tidak ada permintaan bantuan yang aktif.');
    }

    const response = req.body.response;
    const chatId = req.body.chatId;

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
                `Permintaan bantuan sudah direspon oleh ${laboranName} dengan pesan: ${response}`);
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

// Modified handler untuk command /response
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

// Modified message handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const name = msg.from.first_name || 'Unknown';
    const text = msg.text;

    const isPending = await redisHelpers.getPendingResponse(chatId);
    if (!text.startsWith('/') && isPending) {
        await redisHelpers.setPendingResponse(chatId, false);

        fetch('https://labkom.blimbing.biz.id/response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, response: text })
        })
        .then(res => res.text())
        .then(data => {
            console.log(`[LOG] Respons berhasil dikirim oleh chatId: ${chatId}, pesan: "${text}"`);
            bot.sendMessage(chatId, `Respons Anda telah dikirim: "${text}"`);
        })
        .catch(err => {
            console.log(`[LOG] Gagal mengirim respons dari chatId: ${chatId}, error: ${err.message}`);
            bot.sendMessage(chatId, "Gagal mengirim respons.");
        });
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
});

export default app;