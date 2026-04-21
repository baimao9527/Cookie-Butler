import { BasePlatform } from './base.js';
import { STATUS, getCookieArray } from '../utils/common.js';

/**
 * UC网盘平台实现
 */
export class UCPlatform extends BasePlatform {
    constructor() {
        super('uc');
    }

    /**
     * 生成UC网盘二维码
     */
    async generateQRCode() {
        try {
            const requestId = Date.now();

            // 获取token
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('getToken'),
                params: {
                    client_id: this.config.clientId,
                    v: this.getParam('version'),
                    request_id: requestId
                },
                headers: {
                    'User-Agent': this.getUserAgent(),
                    'Referer': this.getHeader('referer')
                }
            });

            const token = response.data.data.members.token;

            // 使用配置的URL模板构建二维码URL
            const qrUrl = this.replaceUrlTemplate(this.config.qrUrlTemplate, {
                token: token,
                clientId: this.config.clientId
            });

            // 创建会话数据
            const sessionKey = this.createSessionKey({
                token: token,
                request_id: requestId,
                cookies: response.headers['set-cookie'] || []
            });

            // 生成二维码图片
            const qrcodeDataURL = await this.generateQRCodeImage(qrUrl);

            return this.createSuccessResponse({
                qrcode: qrcodeDataURL,
                sessionKey: sessionKey
            });

        } catch (error) {
            return this.createErrorResponse('生成二维码失败: ' + error.message);
        }
    }

    /**
     * 检查UC网盘扫码状态
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { token, request_id, cookies: initialCookies } = sessionData;

            // 检查扫码状态
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('checkStatus'),
                params: {
                    __t: Date.now(),
                    token: token,
                    client_id: this.config.clientId,
                    v: this.getParam('version'),
                    request_id: request_id
                },
                headers: {
                    'User-Agent': this.getUserAgent(),
                    'Referer': this.getHeader('referer')
                }
            });

            if (response.data.status === 2000000) {
                // 扫码成功，获取完整Cookie
                const cookie = await this.getFullCookie(response.data.data.members.service_ticket, initialCookies);
                return this.createSuccessResponse({
                    status: STATUS.CONFIRMED,
                    cookie: cookie
                });
            } else if (response.data.status === 50004002) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            } else {
                return this.createSuccessResponse({ status: STATUS.NEW });
            }

        } catch (error) {
            return this.createErrorResponse('检查状态失败: ' + error.message);
        }
    }

    /**
     * 获取完整的Cookie
     * @param {string} serviceTicket 服务票据
     * @param {Array} initialCookies 初始cookies
     * @returns {Promise<string>} 完整的cookie字符串
     */
    async getFullCookie(serviceTicket, initialCookies) {
        let cookies = getCookieArray(initialCookies || []);

        // 第一步：获取账户信息
        const accountResponse = await this.request({
            method: 'GET',
            url: this.getEndpoint('accountInfo'),
            params: {
                st: serviceTicket,
                fr: 'pc',
                platform: 'pc'
            },
            headers: {
                'User-Agent': this.getUserAgent(),
                'Cookie': cookies.join(''),
                'Referer': this.getHeader('referer')
            }
        });

        if (accountResponse.headers['set-cookie']) {
            cookies = cookies.concat(getCookieArray(accountResponse.headers['set-cookie']));
        }

        // 第二步：调用云盘API获取完整Cookie
        const cloudResponse = await this.request({
            method: 'POST',
            url: this.getEndpoint('cloudApi'),
            params: {
                pr: 'UCBrowser',
                fr: 'pc'
            },
            data: {},
            headers: {
                'User-Agent': this.getUserAgent(),
                'Cookie': cookies.join('')
            }
        });

        if (cloudResponse.headers['set-cookie']) {
            cookies = cookies.concat(getCookieArray(cloudResponse.headers['set-cookie']));
        }

        return cookies.join('');
    }
}
