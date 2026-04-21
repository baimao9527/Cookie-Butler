import { BasePlatform } from './base.js';
import { STATUS } from '../utils/common.js';

/**
 * 阿里云盘平台实现
 */
export class AliPlatform extends BasePlatform {
    constructor() {
        super('ali');
    }

    /**
     * 生成阿里云盘二维码
     */
    async generateQRCode() {
        try {
            const response = await this.request({
                method: 'GET',
                url: this.getEndpoint('generateQR'),
                params: {
                    appName: this.getParam('appName'),
                    fromSite: this.getParam('fromSite'),
                    appEntrance: this.getParam('appEntrance'),
                    isMobile: this.getParam('isMobile'),
                    lang: this.getParam('lang'),
                    returnUrl: this.getParam('returnUrl'),
                    bizParams: this.getParam('bizParams'),
                    _bx_v: this.getParam('_bx_v')
                }
            });

            const contentData = response.data.content.data;

            // 创建会话数据
            const sessionKey = this.createSessionKey({
                ck: contentData.ck,
                t: contentData.t
            });

            // 生成二维码图片
            const qrcodeDataURL = await this.generateQRCodeImage(contentData.codeContent);

            return this.createSuccessResponse({
                qrcode: qrcodeDataURL,
                sessionKey: sessionKey
            });

        } catch (error) {
            return this.createErrorResponse('生成二维码失败: ' + error.message);
        }
    }

    /**
     * 检查阿里云盘扫码状态
     */
    async checkStatus(sessionKey) {
        try {
            const sessionData = this.parseSessionKey(sessionKey);
            if (!sessionData) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const { ck, t } = sessionData;
            
            const response = await this.request({
                method: 'POST',
                url: this.getEndpoint('checkStatus'),
                data: {
                    ck: ck,
                    t: t,
                    appName: this.getParam('appName'),
                    appEntrance: this.getParam('appEntrance'),
                    isMobile: this.getParam('isMobile'),
                    lang: this.getParam('lang'),
                    returnUrl: this.getParam('returnUrl'),
                    navlanguage: this.getParam('navlanguage'),
                    bizParams: this.getParam('bizParams')
                },
                params: {
                    appName: this.getParam('appName'),
                    fromSite: this.getParam('fromSite'),
                    _bx_v: this.getParam('_bx_v')
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            if (!response.data.content || !response.data.content.data) {
                return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }

            const status = response.data.content.data.qrCodeStatus;

            switch (status) {
                case 'CONFIRMED':
                    if (response.data.content.data.bizExt) {
                        try {
                            const bizExt = JSON.parse(atob(response.data.content.data.bizExt));
                            const token = bizExt.pds_login_result.refreshToken;

                            return this.createSuccessResponse({
                                status: STATUS.CONFIRMED,
                                token: token
                            });
                        } catch (parseError) {
                            console.error('解析bizExt失败:', parseError);
                            return this.createSuccessResponse({ status: STATUS.EXPIRED });
                        }
                    }
                    return this.createSuccessResponse({ status: STATUS.EXPIRED });
                    
                case 'SCANED':
                    return this.createSuccessResponse({ status: STATUS.SCANNED });
                    
                case 'CANCELED':
                    return this.createSuccessResponse({ status: STATUS.CANCELED });
                    
                case 'NEW':
                    return this.createSuccessResponse({ status: STATUS.NEW });
                    
                default:
                    return this.createSuccessResponse({ status: STATUS.EXPIRED });
            }
            
        } catch (error) {
            return this.createErrorResponse('检查状态失败: ' + error.message);
        }
    }
}
