import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

const app = express();
dotenv.config();

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Daftar whitelist chatId yang diizinkan
const whitelist = ['1105365521']; // Tambahkan chatId yang diizinkan di sini

let laboran = [
    { chatId: '1105365521', name: 'Fahmi' }
];
let latestResponse = null;
let isHelpNeeded = false; // Flag untuk menandai apakah sedang ada permintaan bantuan

// Middleware untuk memeriksa whitelist
const checkWhitelist = (chatId) => {
    return whitelist.includes(chatId);
};

// Endpoint untuk menerima permintaan bantuan
app.get('/request-help', (req, res) => {
    if (laboran.length === 0) {
        return res.send('Belum ada laboran yang terdaftar.');
    }

    isHelpNeeded = true; // Set flag bahwa bantuan sedang dibutuhkan

    // Kirim notifikasi ke semua laboran
    laboran.forEach(lab => {
        if (checkWhitelist(lab.chatId)) {
            bot.sendMessage(lab.chatId, 'Dosen membutuhkan bantuan di lab komputer!');
        }
    });

    console.log(`[LOG] Permintaan bantuan dikirim ke laboran.`);
    res.send('Permintaan bantuan telah dikirim ke semua laboran!');
});

// Endpoint untuk menerima respons dari laboran
app.post('/response', express.json(), (req, res) => {
    if (!isHelpNeeded) {
        console.log(`[LOG] Percobaan mengirim respons tanpa permintaan bantuan aktif.`);
        return res.status(400).send('Tidak ada permintaan bantuan yang aktif.');
    }

    const response = req.body.response;
    const chatId = req.body.chatId;

    // Cek apakah pengguna terdaftar sebagai laboran
    const respondingLab = laboran.find(l => l.chatId === chatId.toString());
    if (!respondingLab) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak terdaftar: ${chatId}`);
        return res.status(403).send('Anda tidak terdaftar sebagai laboran.');
    }

    const laboranName = respondingLab.name;

    // Simpan respons
    latestResponse = {
        chatId: chatId.toString(),
        response: response
    };

    // Kirim notifikasi ke semua laboran lain
    laboran.forEach(lab => {
        if (lab.chatId !== chatId.toString() && checkWhitelist(lab.chatId)) {
            bot.sendMessage(lab.chatId, 
                `Permintaan bantuan sudah direspon oleh ${laboranName} dengan pesan: ${response}`);
        }
    });

    console.log(`[LOG] Respons diterima dari laboran ${laboranName} (chatId: ${chatId}): ${response}`);
    isHelpNeeded = false; // Reset flag karena bantuan sudah direspon
    res.send('Respons diterima!');
});

app.get('/response', (req, res) => {
    if (latestResponse) {
        const lab = laboran.find(l => l.chatId === latestResponse.chatId);
        const nama = lab ? lab.name : 'Unknown';
        const pesan = latestResponse.response || 'Tidak ada pesan';
        
        const formattedResponse = `Laboran (${nama}) Merespon Pesan Bapak/Ibu: ${pesan}`;
        console.log(`[LOG] Menampilkan respons terakhir: ${formattedResponse}`);
        res.send(formattedResponse);
        latestResponse = null;
    } else {
        console.log(`[LOG] Tidak ada respons terakhir yang tersedia.`);
        res.status(204).send();
    }
});

// Handler untuk command /response
bot.onText(/\/response (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    const response = match[1];

    console.log(`[LOG] Percobaan mengirim respons dari chatId: ${chatId}`);

    if (!checkWhitelist(chatId)) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak diizinkan: ${chatId}`);
        bot.sendMessage(chatId, "Anda tidak diizinkan mengakses bot ini.");
        return;
    }

    if (!isHelpNeeded) {
        console.log(`[LOG] Percobaan mengirim respons tanpa permintaan bantuan aktif dari chatId: ${chatId}`);
        bot.sendMessage(chatId, "Tidak ada permintaan bantuan yang aktif saat ini.");
        return;
    }

    // Cek apakah pengguna terdaftar sebagai laboran
    const lab = laboran.find(l => l.chatId === chatId);
    if (!lab) {
        console.log(`[LOG] Percobaan akses dari chatId yang tidak terdaftar: ${chatId}`);
        bot.sendMessage(chatId, "Anda tidak terdaftar sebagai laboran.");
        return;
    }

    fetch('http://localhost:3000/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, response })
    })
    .then(res => res.text())
    .then(data => {
        console.log(`[LOG] Respons berhasil dikirim oleh chatId: ${chatId}, pesan: "${response}"`);
        bot.sendMessage(chatId, `Respons Anda telah dikirim: "${response}"`);
    })
    .catch(err => {
        console.log(`[LOG] Gagal mengirim respons dari chatId: ${chatId}, error: ${err.message}`);
        bot.sendMessage(chatId, "Gagal mengirim respons.");
    });
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id.toString();
    const name = msg.from.first_name || 'Unknown';

    console.log(`[LOG] Pesan masuk dari chatId: ${chatId}, nama: ${name}`);

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

// module.exports = app;
export default app;