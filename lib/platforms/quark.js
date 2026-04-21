import { BasePlatform } from './base.js';
import { STATUS, getCookieArray } from '../utils/common.js';

/**
 * 夸克网盘平台实现
 */
export class QuarkPlatform extends BasePlatform {
    constructor() {
        super('quark');
    }

    /**
     * 生成夸克网盘二维码
     */
    async generateQRCode() {
        try {
            // 获取token
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('getToken'),
                params: {
                    client_id: this.config.clientId,
                    v: this.getParam('version')
                },
                headers: {
                    'User-Agent': this.getUserAgent()
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
     * 检查夸克网盘扫码状态
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { token, cookies: initialCookies } = sessionData;

            // 检查扫码状态
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('checkStatus'),
                params: {
                    client_id: this.config.clientId,
                    v: this.getParam('version'),
                    token: token
                },
                headers: {
                    'User-Agent': this.getUserAgent()
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
                'Cookie': cookies.join('')
            }
        });

        if (accountResponse.headers['set-cookie']) {
            cookies = cookies.concat(getCookieArray(accountResponse.headers['set-cookie']));
        }

        // 第二步：调用云盘API获取完整Cookie
        const cloudResponse = await this.request({
            method: 'GET',
            url: this.getEndpoint('cloudApi'),
            params: {
                pr: 'ucpro',
                fr: 'pc',
                uc_param_str: '',
                aver: '1'
            },
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
