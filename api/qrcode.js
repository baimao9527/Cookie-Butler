import { platformFactory } from '../lib/platforms/index.js';
import { createErrorResponse, setSafeCorsHeaders } from '../lib/utils/common.js';

export default async function handler(req, res) {
    // 设置安全的CORS头部
    setSafeCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json(createErrorResponse('Method not allowed'));
    }

    try {
        const { platform } = req.body;
        console.log(`[QRCode API] 收到请求，平台: ${platform}`);

        if (!platform) {
            console.log('[QRCode API] 错误: 缺少platform参数');
            return res.status(400).json(createErrorResponse('缺少platform参数'));
        }

        // 使用平台工厂创建实例
        const platformInstance = platformFactory.create(platform);

        console.log(`[QRCode API] 开始处理 ${platform} 平台二维码生成`);
        const result = await platformInstance.generateQRCode();
        console.log(`[QRCode API] ${platform} 平台二维码生成成功`);
        return res.status(200).json(result);

    } catch (error) {
        console.error('[QRCode API] 服务器错误:', error);
        return res.status(500).json(createErrorResponse('服务器内部错误: ' + error.message));
    }
}

