import { BasePlatform } from './base.js';
import { STATUS, formatCookies } from '../utils/common.js';

/**
 * 115网盘平台实现
 */
export class Platform115 extends BasePlatform {
    constructor() {
        super('115');
    }

    /**
     * 生成115网盘二维码
     */
    async generateQRCode() {
        try {
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('getToken'),
                headers: {
                    'Referer': this.getHeader('referer')
                }
            });

            const qrData = response.data.data;

            // 创建会话数据
            const sessionKey = this.createSessionKey({
                uid: qrData.uid,
                time: qrData.time,
                sign: qrData.sign
            });

            // 生成二维码图片
            const qrcodeDataURL = await this.generateQRCodeImage(qrData.qrcode);

            return this.createSuccessResponse({
                qrcode: qrcodeDataURL,
                sessionKey: sessionKey
            });

        } catch (error) {
            return this.createErrorResponse('生成二维码失败: ' + error.message);
        }
    }

    /**
     * 检查115网盘扫码状态
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { uid, time, sign } = sessionData;
            
            // 检查扫码状态
            const statusResponse = await this.request({
                method: 'GET',
                url: `${this.getEndpoint('checkStatus')}?_=${parseInt(Date.now() / 1000)}&sign=${sign}&time=${time}&uid=${uid}`,
                headers: {
                    'Referer': this.getHeader('referer')
                }
            });
            
            const statusData = statusResponse.data.data;
            
            if (statusData.status === 2) {
                // 扫码成功，获取登录cookie
                const cookie = await this.getLoginCookie(uid);
                return this.createSuccessResponse({
                    status: STATUS.CONFIRMED,
                    cookie: cookie
                });
            } else if (statusData.status === 0) {
                return this.createSuccessResponse({ status: STATUS.NEW });
            } else if (statusData.status === 1) {
                return this.createSuccessResponse({ status: STATUS.SCANNED });
            } else {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }
            
        } catch (error) {
            return this.createErrorResponse('检查状态失败: ' + error.message);
        }
    }

    /**
     * 获取登录Cookie
     * @param {string} uid 用户ID
     * @returns {Promise<string>} Cookie字符串
     */
    async getLoginCookie(uid) {
        const loginResponse = await this.request({
            method: 'POST',
            url: this.getEndpoint('login'),
            data: `account=${uid}&app=${this.getParam('app')}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': this.getHeader('referer')
            }
        });

        if (loginResponse.data.state === 1) {
            return formatCookies(loginResponse.headers['set-cookie']);
        } else {
            throw new Error(`登录失败：${loginResponse.data.message}`);
        }
    }
}
