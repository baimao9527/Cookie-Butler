import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { createTelegramBotService } from './telegram/bot.js';

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!existsSync(envPath)) {
        return;
    }

    const envContent = readFileSync(envPath, 'utf-8');
    for (const rawLine of envContent.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;
const telegramBotService = createTelegramBotService();
let isShuttingDown = false;

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS配置 - 仅在开发环境使用，生产环境由API路由自己处理
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        // 开发环境的CORS配置
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8080', // 可能的其他开发端口
            'http://127.0.0.1:8080'
        ];

        const origin = req.headers.origin;
        if (allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else {
            // 开发环境默认允许localhost
            res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
        }

        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Credentials', 'false');

        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    });

    console.log('🔧 开发环境CORS中间件已启用');
} else {
    console.log('🔒 生产环境：CORS由API路由自行处理');
}

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 动态导入API路由处理器
async function loadApiHandler(modulePath) {
    try {
        const module = await import(modulePath);
        return module.default;
    } catch (error) {
        console.error(`加载API模块失败: ${modulePath}`, error);
        return null;
    }
}

// API路由 - 二维码生成
app.post('/api/qrcode', async (req, res) => {
    try {
        const handler = await loadApiHandler('./api/qrcode.js');
        if (handler) {
            await handler(req, res);
        } else {
            res.status(500).json({ success: false, message: '无法加载二维码API' });
        }
    } catch (error) {
        console.error('二维码API错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// API路由 - 状态检查
app.post('/api/check-status', async (req, res) => {
    try {
        const handler = await loadApiHandler('./api/check-status.js');
        if (handler) {
            await handler(req, res);
        } else {
            res.status(500).json({ success: false, message: '无法加载状态检查API' });
        }
    } catch (error) {
        console.error('状态检查API错误:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// 处理所有其他路由，返回index.html（SPA支持）
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('服务器错误:', error);
    res.status(500).json({ 
        success: false, 
        message: '服务器内部错误',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 启动服务器
const server = app.listen(PORT, async () => {
    console.log(`🚀 Cookie Butler 开发服务器启动成功！`);
    console.log(`📱 访问地址: http://localhost:${PORT}`);
    console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
    console.log('');
    console.log('💡 提示:');
    console.log('  - 修改代码后需要重启服务器');
    console.log('  - 推荐使用 "vercel dev" 获得热重载和完整功能');
    console.log('  - 按 Ctrl+C 停止服务器');

    if (telegramBotService.isEnabled()) {
        try {
            await telegramBotService.start();
        } catch (error) {
            console.error('[Telegram] 启动失败:', error.message);
        }
    } else {
        console.log('[Telegram] 未配置 TELEGRAM_BOT_TOKEN，跳过机器人启动');
    }
});

async function shutdown(signal) {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    console.log(`\n🛑 收到 ${signal}，正在关闭服务...`);

    try {
        await telegramBotService.stop();
    } catch (error) {
        console.error('[Telegram] 停止失败:', error.message);
    }

    server.close((error) => {
        if (error) {
            console.error('服务器关闭失败:', error);
            process.exit(1);
        }

        process.exit(0);
    });

    setTimeout(() => {
        console.error('服务器关闭超时，强制退出');
        process.exit(1);
    }, 5000).unref();
}

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});
