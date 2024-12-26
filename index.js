const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;
const timeLimit = 24 * 60 * 60 * 1000; // مدت زمان 24 ساعت (میلی‌ثانیه)
const apiKeyFile = path.join(__dirname, 'apikeyall.json'); // مسیر فایل کلیدها
const ipDataFile = path.join(__dirname, 'allapikeyip.json'); // مسیر ذخیره اطلاعات IP و تعداد استفاده

// بارگذاری کلیدهای API از فایل
const loadApiKeys = () => {
    if (!fs.existsSync(apiKeyFile)) {
        fs.writeFileSync(apiKeyFile, JSON.stringify({ 
            "nothing-api": { limit: 3000, used: 0, lastReset: Date.now() },
            "nothing-ben": { limit: 3000, used: 0, lastReset: Date.now() } // کلید عمومی با محدودیت 3000
        }, null, 2));
    }
    return JSON.parse(fs.readFileSync(apiKeyFile));
};

// بارگذاری اطلاعات IP از فایل
const loadIpData = () => {
    if (!fs.existsSync(ipDataFile)) {
        fs.writeFileSync(ipDataFile, JSON.stringify({}), null, 2);
    }
    return JSON.parse(fs.readFileSync(ipDataFile));
};

// ذخیره کلیدهای API در فایل
const saveApiKeys = (apiKeys) => {
    fs.writeFileSync(apiKeyFile, JSON.stringify(apiKeys, null, 2));
};

// ذخیره اطلاعات IP در فایل
const saveIpData = (ipData) => {
    fs.writeFileSync(ipDataFile, JSON.stringify(ipData, null, 2));
};

let apiKeys = loadApiKeys();
let ipData = loadIpData();

// تابع بررسی یا ایجاد وضعیت برای کاربر
const checkUserLimit = (apikey, ip) => {
    const apiKeyData = apiKeys[apikey];
    
    // بررسی محدودیت IP برای این API key
    if (!ipData[apikey]) {
        ipData[apikey] = {};
    }

    if (!ipData[apikey][ip]) {
        ipData[apikey][ip] = { used: 0, lastUsed: Date.now() };
    }

    const userData = ipData[apikey][ip];
    
    // اگر زمان بازنشانی گذشته باشد، مقدار `used` صفر می‌شود
    if (Date.now() - userData.lastUsed > timeLimit) {
        userData.used = 0;
        userData.lastUsed = Date.now();
    }

    return userData;
};

// مسیر بررسی وضعیت API
app.get('/api/checker', (req, res) => {
    const apikey = req.query.apikey;
    const ip = req.ip;

    if (!apiKeys[apikey]) {
        return res.status(401).json({
            status: false,
            result: 'Invalid or missing API key.'
        });
    }

    const keyData = apiKeys[apikey];
    const userData = checkUserLimit(apikey, ip);

    const remaining = keyData.limit - userData.used;

    if (remaining <= 0) {
        return res.status(403).json({
            status: false,
            result: 'API key usage limit exceeded. Please wait 24 hours.'
        });
    }

    res.json({
        status: true,
        apikey,
        limit: keyData.limit,
        used: userData.used,
        remaining,
        resetIn: '24 hours'
    });
});

// مسیر استفاده از کلید API
app.get('/api/use', (req, res) => {
    const apikey = req.query.apikey;
    const ip = req.ip;

    if (!apiKeys[apikey]) {
        return res.status(401).json({
            status: false,
            result: 'Invalid or missing API key.'
        });
    }

    const keyData = apiKeys[apikey];
    const userData = checkUserLimit(apikey, ip);

    if (userData.used >= keyData.limit) {
        return res.status(403).json({
            status: false,
            result: 'API key usage limit exceeded. Please wait 24 hours.'
        });
    }

    // افزایش تعداد استفاده و ذخیره
    userData.used += 1;
    userData.lastUsed = Date.now();
    saveIpData(ipData);

    res.json({
        status: true,
        result: `API key used successfully. You have ${keyData.limit - userData.used} uses remaining.`
    });
});

// مسیر تولید QR Code
app.get('/api/tools/qrcode', async (req, res) => {
    const apikey = req.query.apikey; // دریافت کلید API
    const text = req.query.text; // متن برای تولید QR Code

    if (!apikey || !apiKeys[apikey]) {
        return res.status(401).json({
            status: false,
            result: 'Invalid or missing API key.'
        });
    }

    const keyData = checkUserLimit(apikey, req.ip);
    if (keyData.used >= keyData.limit) {
        return res.status(403).json({
            status: false,
            result: 'API key usage limit exceeded. Please wait 24 hours.'
        });
    }

    if (!text) {
        return res.status(400).json({
            status: false,
            result: 'No text provided.'
        });
    }

    keyData.used += 1;
    saveApiKeys(apiKeys);

    try {
        const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
        
        // درخواست تصویر QR Code
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        // ارسال تصویر
        res.setHeader('Content-Type', 'image/png');
        res.send(response.data);
    } catch (err) {
        res.status(500).json({
            status: false,
            message: 'Error generating QR code.',
            error: err.message
        });
    }
});

// راه‌اندازی سرور
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});