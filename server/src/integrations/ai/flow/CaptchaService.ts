import axios from 'axios';
import { chromium, BrowserContext, Browser } from 'playwright';
import { Logger } from '@/utils/logger.js';
import { EnvConfig } from '@/config/env.js';
import { getDatabaseProvider } from '@/database/index.js';
import type { StudioSystemConfig } from '@/types.js';

export type CaptchaMode = 'yescaptcha' | 'capsolver' | 'capmonster' | 'ezcaptcha' | 'browser' | 'personal' | 'remote_browser';

export interface CaptchaSolveOptions {
    projectId: string;
    action: 'IMAGE_GENERATION' | 'VIDEO_GENERATION'  | '';
    toolId?: string;
    websiteURL?: string;
    tokenId?: string;
}

export class CaptchaService {
    private static instance: CaptchaService;
    private websiteKey = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';

    private constructor() {}

    public static getInstance(): CaptchaService {
        if (!CaptchaService.instance) {
            CaptchaService.instance = new CaptchaService();
        }
        return CaptchaService.instance;
    }

    public async solve(options: CaptchaSolveOptions): Promise<string | null> {
        let captchaConfig = EnvConfig.captcha;
        try {
            const db = await getDatabaseProvider();
            const studioConfig = await db.getSystemSetting<StudioSystemConfig>('studio_config');
            if (studioConfig?.captcha) {
                captchaConfig = { ...captchaConfig, ...studioConfig.captcha };
            }
        } catch {}

        const apiKey = captchaConfig.apiKey || '';
        const baseUrl = (captchaConfig.baseUrl).replace(/\/$/, '');
        let method = captchaConfig.method;

        // Auto-detect CapSolver vs YesCaptcha vs others based on key prefix or baseUrl
        if (baseUrl.includes('capsolver.com')) {
            method = 'capsolver';
        } else if (baseUrl.includes('yescaptcha.com')) {
            method = 'yescaptcha';
        }

        const config = {
            method,
            service: {
                apiKey,
                baseUrl,
            },
        };

        if (!apiKey || apiKey === 'dummy_key') {
            Logger.warn('[CaptchaService] Captcha not configured or missing API key, attempting local browser');
            return this.solveLocalBrowser(options, (config as any).localBrowser, 'playwright');
        }

        switch (config.method) {
            case 'capsolver':
                return this.solveExternalService(options, config.service, 'ReCaptchaV3EnterpriseTaskProxyless');
            case 'yescaptcha':
                return this.solveExternalService(options, config.service, 'RecaptchaV3TaskProxylessM1');
            case 'capmonster':
            case 'ezcaptcha':
            case '2captcha':
                return this.solveExternalService(options, config.service, 'ReCaptchaV3TaskProxyless');
            case 'remote_browser':
                return this.solveRemoteBrowser(options, (config as any).remoteBrowser);
            case 'browser':
                return this.solveLocalBrowser(options, (config as any).localBrowser, 'playwright');
            case 'personal':
                return this.solveLocalBrowser(options, (config as any).localBrowser, 'stealth');
            default:
                return this.solveExternalService(options, config.service, 'ReCaptchaV3EnterpriseTaskProxyless');
        }
    }

    private async solveExternalService(
        options: CaptchaSolveOptions, 
        config?: { apiKey: string; baseUrl: string },
        taskType: string = 'RecaptchaV3TaskProxylessM1'
    ): Promise<string | null> {
        if (!config?.apiKey) {
            Logger.error('[CaptchaService] External service API key not configured');
            return null;
        }

        const baseUrl = (config.baseUrl).replace(/\/$/, '');
        const projectUrl = `https://labs.google/fx/tools/flow/project/${options.projectId}`;

        try {
            const createResponse = await axios.post(`${baseUrl}/createTask`, {
                clientKey: config.apiKey,
                task: {
                    type: taskType,
                    websiteURL: projectUrl,
                    websiteKey: this.websiteKey,
                    pageAction: options.action || ''
                }
            });

            const taskId = createResponse.data.taskId;
            if (!taskId) {
                Logger.error(`[CaptchaService] Task creation failed: ${JSON.stringify(createResponse.data)}`);
                return null;
            }

            for (let i = 0; i < 40; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const resultResponse = await axios.post(`${baseUrl}/getTaskResult`, {
                    clientKey: config.apiKey,
                    taskId: taskId
                });

                const status = resultResponse.data.status;
                if (status === 'ready') {
                    return resultResponse.data.solution.gRecaptchaResponse;
                }
                if (status === 'processing') continue;
                
                Logger.error(`[CaptchaService] Task failed: ${JSON.stringify(resultResponse.data)}`);
                return null;
            }

            Logger.error('[CaptchaService] Task timeout');
            return null;
        } catch (error) {
            Logger.error(`[CaptchaService] External service error: ${error}`);
            return null;
        }
    }

    private async solveRemoteBrowser(options: CaptchaSolveOptions, config?: { apiKey: string; baseUrl: string; timeout: number }): Promise<string | null> {
        if (!config?.apiKey || !config?.baseUrl) {
            Logger.error('[CaptchaService] Remote Browser not configured');
            return null;
        }

        try {
            const response = await axios.post(`${config.baseUrl}/api/v1/solve`, {
                project_id: options.projectId,
                action: options.action,
                token_id: options.tokenId
            }, {
                headers: { Authorization: `Bearer ${config.apiKey}` },
                timeout: (config.timeout || 60) * 1000
            });

            return response.data.token;
        } catch (error) {
            Logger.error(`[CaptchaService] Remote Browser error: ${error}`);
            return null;
        }
    }

    private async solveLocalBrowser(options: CaptchaSolveOptions, config: any, type: 'playwright' | 'stealth'): Promise<string | null> {
        Logger.info(`[CaptchaService] Attempting local browser solve (${type}) for project ${options.projectId}`);
        
        let browser: Browser | null = null;
        let context: BrowserContext | null = null;
        
        try {
            const projectUrl = `https://labs.google/fx/tools/flow/project/${options.projectId}`;
            const isHeadless = type === 'playwright';
            
            if (config?.profileDir && type === 'stealth') {
                context = await chromium.launchPersistentContext(config.profileDir, {
                    headless: false,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                });
            } else {
                browser = await chromium.launch({ headless: isHeadless });
                context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                });
            }

            const page = await context.newPage();
            await page.goto(projectUrl, { waitUntil: 'networkidle', timeout: 30000 });

            const token = await page.evaluate(async (params) => {
                return new Promise<string>((resolve, reject) => {
                    const checkInterval = setInterval(() => {
                        if ((window as any).grecaptcha && (window as any).grecaptcha.execute) {
                            clearInterval(checkInterval);
                            (window as any).grecaptcha.execute(params.websiteKey, { action: params.action })
                                .then(resolve)
                                .catch(reject);
                        }
                    }, 500);
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        reject(new Error('reCAPTCHA execution timeout'));
                    }, 15000);
                });
            }, { websiteKey: this.websiteKey, action: options.action });

            return token;
        } catch (error: any) {
            Logger.error(`[CaptchaService] Local browser solve failed: ${error.message}`);
            return null;
        } finally {
            if (browser) await browser.close();
            else if (context) await context.close();
        }
    }
}

export const captchaService = CaptchaService.getInstance();
