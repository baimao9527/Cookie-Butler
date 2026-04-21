import axios from 'axios';
import { networkInterfaces } from 'os';
import CryptoJS from 'crypto-js';

// 通用请求头
export const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// 状态常量
export const STATUS = {
    NEW: 'NEW',
    SCANNED: 'SCANNED', 
    CONFIRMED: 'CONFIRMED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED'
};



// 按照CatPawOpen的getCookieArray实现
export const getCookieArray = (cookies) => {
    if (!cookies) return [];
    return cookies.map(cookie => cookie.split(";")[0] + ";");
}

// 格式化Cookie - 基于getCookieArray实现
export function formatCookies(cookies) {
    if (!cookies) return '';

    if (typeof cookies === 'string') {
        return cookies;
    }

    if (Array.isArray(cookies)) {
        return getCookieArray(cookies).join('');
    }

    return '';
}





// HTTP请求封装
export async function httpRequest(config) {
    try {
        const response = await axios({
            timeout: 15000,
            ...config,
            headers: {
                ...COMMON_HEADERS,
                ...config.headers
            }
        });
        return response;
    } catch (error) {
        console.error('HTTP请求失败:', error.message);
        throw error;
    }
}

// 响应封装
export function createResponse(success, data = null, message = '') {
    return {
        success,
        data,
        message,
        timestamp: Date.now()
    };
}

// 错误响应
export function createErrorResponse(message, error = null) {
    console.error('API错误:', message, error);
    return createResponse(false, null, message);
}

// 成功响应
export function createSuccessResponse(data, message = '') {
    return createResponse(true, data, message);
}

/**
 * 获取服务器本地IP地址
 * @returns {Array<string>} 本地IP地址列表
 */
function getLocalIPs() {
    try {
        const nets = networkInterfaces();
        const ips = [];

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // 跳过内部地址和IPv6地址
                if (net.family === 'IPv4' && !net.internal) {
                    ips.push(net.address);
                }
            }
        }
        return ips;
    } catch (error) {
        console.warn('[CORS] ⚠️ 获取本地IP失败:', error.message);
        return [];
    }
}

/**
 * 设置安全的CORS头部
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 */
export function setSafeCorsHeaders(req, res) {
    // 生产环境的URL，Vercel会自动提供VERCEL_URL环境变量
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

    // 从环境变量获取自定义允许的源
    const customOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(origin => {
            const trimmed = origin.trim();
            // 验证域名格式
            if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                console.warn(`[CORS] ⚠️ 警告: 域名 "${trimmed}" 缺少协议前缀，建议使用 https:// 或 http://`);
            }
            return trimmed;
        }).filter(Boolean)
        : [];

    // 获取服务器本地IP地址
    const localIPs = getLocalIPs();
    const port = process.env.PORT || 3000;
    const localOrigins = localIPs.map(ip => `http://${ip}:${port}`);

    // 生产环境安全检查（现在考虑自动获取的IP）
    if (process.env.NODE_ENV === 'production' && customOrigins.length === 0 && !vercelUrl && localOrigins.length === 0) {
        console.warn('[CORS] ⚠️ 生产环境警告: 未配置ALLOWED_ORIGINS环境变量，且无法获取本地IP，建议配置以提高安全性');
    }

    // 允许的源列表
    const allowedOrigins = [
        'http://localhost:3000',  // 本地开发环境
        'http://127.0.0.1:3000',  // 本地开发环境（备用）
        vercelUrl,                // Vercel部署域名
        ...localOrigins,          // 自动获取的本地IP地址
        ...customOrigins          // 用户自定义域名
    ].filter(Boolean); // 过滤掉null值

    // 首次运行时显示允许的源列表
    if (!setSafeCorsHeaders._logged) {
        console.log('[CORS] 🌐 允许的源列表:', allowedOrigins);
        setSafeCorsHeaders._logged = true;
    }

    const origin = req.headers.origin;

    // 如果请求的源在许可名单里，则允许它
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        console.log(`[CORS] ✅ 允许来源: ${origin}`);
    } else if (vercelUrl) {
        // 生产环境默认使用Vercel域名
        res.setHeader('Access-Control-Allow-Origin', vercelUrl);
        console.log(`[CORS] 🔒 生产环境默认域名: ${vercelUrl} (请求来源: ${origin || 'none'})`);
    } else {
        // 开发环境默认允许localhost
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
        console.log(`[CORS] 🔧 开发环境默认: localhost:3000 (请求来源: ${origin || 'none'})`);
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'false'); // 明确禁用凭据

    // 额外的安全头部
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ==================== 加密工具函数 ====================

/**
 * 生成MD5哈希
 * @param {string} text 要哈希的文本
 * @returns {string} MD5哈希值
 */
export function generateMD5(text) {
    return CryptoJS.MD5(text).toString();
}

/**
 * 生成SHA256哈希
 * @param {string} text 要哈希的文本
 * @returns {string} SHA256哈希值
 */
export function generateSHA256(text) {
    return CryptoJS.SHA256(text).toString();
}

/**
 * 生成设备ID（UC Token版专用）
 * @param {number} timestamp 时间戳
 * @returns {string} 16位设备ID
 */
export function generateDeviceID(timestamp) {
    return generateMD5(timestamp.toString()).slice(0, 16);
}

/**
 * 生成请求ID（UC Token版专用）
 * @param {string} deviceID 设备ID
 * @param {number} timestamp 时间戳
 * @returns {string} 16位请求ID
 */
export function generateReqId(deviceID, timestamp) {
    return generateMD5(deviceID + timestamp).slice(0, 16);
}

/**
 * 生成x-pan-token签名（UC Token版专用）
 * @param {string} method HTTP方法（GET/POST）
 * @param {string} pathname URL路径
 * @param {number} timestamp 时间戳
 * @param {string} signKey 签名密钥
 * @returns {string} SHA256签名
 */
export function generateXPanToken(method, pathname, timestamp, signKey) {
    const data = `${method}&${pathname}&${timestamp}&${signKey}`;
    return generateSHA256(data);
}

// ==================== 存储方案 ====================

// 客户端存储方案 - 将数据编码到sessionKey中
// 这样可以避免serverless环境下的内存存储问题
export const storage = {
    // 编码数据到sessionKey
    encode(data, ttl = 300000) {
        const payload = {
            data: data,
            expireTime: Date.now() + ttl,
            timestamp: Date.now()
        };
        // 使用Base64编码，添加简单的混淆
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
        return encoded.replace(/[+/=]/g, (match) => {
            switch (match) {
                case '+': return '-';
                case '/': return '_';
                case '=': return '';
                default: return match;
            }
        });
    },

    // 从sessionKey解码数据
    decode(sessionKey) {
        try {
            if (!sessionKey) return null;

            // 还原Base64字符
            let base64 = sessionKey.replace(/[-_]/g, (match) => {
                return match === '-' ? '+' : '/';
            });

            // 补充padding
            while (base64.length % 4) {
                base64 += '=';
            }

            const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

            // 检查是否过期
            if (Date.now() > payload.expireTime) {
                return null;
            }

            return payload.data;
        } catch (error) {
            console.error('解码sessionKey失败:', error);
            return null;
        }
    },

    // 兼容性方法
    set(_key, value, ttl = 300000) {
        // 在客户端存储方案中，这个方法返回编码后的key
        return this.encode(value, ttl);
    },

    get(sessionKey) {
        return this.decode(sessionKey);
    },

    delete(_key) {
        // 客户端存储方案中，删除操作由客户端处理
        return true;
    },

    clear() {
        // 客户端存储方案中，清除操作由客户端处理
        return true;
    }
};
