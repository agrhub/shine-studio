import axios from 'axios';
import { chromium, BrowserContext, Browser } from 'playwright';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountStatus, AIAccountType, IAIAccount } from '~/types.js';
import { Logger } from '@/utils/logger.js';

export class FlowSyncService {
    private static instance: FlowSyncService;
    private isSyncing = false;

    private constructor() {}

    public static getInstance(): FlowSyncService {
        if (!FlowSyncService.instance) {
            FlowSyncService.instance = new FlowSyncService();
        }
        return FlowSyncService.instance;
    }

    private getHeaders(st?: string, at?: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Content-Type': 'application/json',
            'Origin': 'https://labs.google',
            'Referer': 'https://labs.google/',
            'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            ...extraHeaders
        };

        if (st) {
            headers['Cookie'] = `__Secure-next-auth.session-token=${st}`;
        }
        if (at) {
            headers['Authorization'] = `Bearer ${at}`;
        }

        return headers;
    }

    public start() {
        if (process.env.DISABLE_LOCAL_FLOW_SYNC === '1') {
            Logger.info('[FlowSyncService] Background sync disabled via environment.');
            return;
        }
        // Run sync every 5 minutes in standalone mode
        setInterval(() => this.syncAllAccounts(), 1 * 60 * 1000);
        // Initial delayed sync to allow DB connections to settle
        setTimeout(() => this.syncAllAccounts(), 5000);
    }

    public async syncAllAccounts() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const db = await getDatabaseProvider();
            const accounts = await db.getFlowAccounts();
            if (accounts && accounts.length > 0) {
                Logger.info(`[FlowSyncService] Syncing ${accounts.length} Google Flow accounts...`);
            }
            for (const account of accounts || []) {
                try {
                    if (account.session_token) {
                        await this.refreshAccountTokens({
                            id: account.id,
                            email: account.email,
                            flow_st: account.session_token,
                            flow_at: account.access_token,
                            project_id: account.project_id,
                            status: account.status,
                            credits: account.credits_remaining,
                            account_type: AIAccountType.GOOGLE_FLOW,
                            is_active: true,
                        } as any);
                    }
                } catch (err: any) {
                    Logger.warn(`[FlowSyncService] Failed to sync account ${account.email}: ${err.message}`);
                }
            }
        } catch (err: any) {
            Logger.warn(`[FlowSyncService] Background sync notice (DB unavailable or credentials not set): ${err.message}`);
        } finally {
            this.isSyncing = false;
            Logger.info('[FlowSyncService] Background sync completed.');
        }
    }

    public async refreshAccountTokens(account: IAIAccount): Promise<void> {
        if (!account.flow_st) {
            Logger.warn(`[FlowSyncService] No Session Token (ST) for ${account.email}. Skipping refresh.`);
            return;
        }

        try {
            const session = await this.stToAt(account.flow_st);
            
            if (session && (session.access_token || session.user)) {
                const newAT = session.access_token;
                if (newAT) {
                    account.flow_at = newAT;
                } else {
                    Logger.warn(`[FlowSyncService] Session returned no access_token for ${account.email}, keeping existing AT`);
                }

                if (session.expires) {
                    const expiresAt = new Date(session.expires).getTime();
                    if (expiresAt < Date.now()) {
                        Logger.warn(`[FlowSyncService] Session for ${account.email} returned an expired token (${session.expires}). The flow_st needs to be updated.`);
                        account.status = AIAccountStatus.UNAUTHORIZED;
                        account.flow_at = undefined;
                        account.flow_at_expires_at = undefined;
                        await this.saveAccount(account);
                        throw new Error('Session token has expired. Please update it in the UI.');
                    }
                    account.flow_at_expires_at = new Date(session.expires);
                }
                
                if (session.user) {
                    account.email = session.user.email || account.email;
                    account.name = session.user.name || account.name;
                    account.avatar_url = session.user.image || account.avatar_url;
                }

                account.status = AIAccountStatus.READY;
                account.error_message = undefined;
                await this.saveAccount(account);
                
                await this.ensureProject(account, session);

                if (account.flow_at) {
                    let creditsFetched = false;
                    try {
                        const GOOGLE_FLOW_API_KEY = 'AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY';
                        const creditsRes = await axios.get(`https://aisandbox-pa.googleapis.com/v1/credits?key=${GOOGLE_FLOW_API_KEY}`, {
                            headers: this.getHeaders(undefined, account.flow_at)
                        });
                        if (creditsRes.data?.credits !== undefined) {
                            account.credits = creditsRes.data.credits;
                            creditsFetched = true;
                        }
                    } catch (e1: any) {
                        const status = e1.response?.status;
                        if (status === 401) {
                            Logger.warn(`[FlowSyncService] CRITICAL: New access token was immediately rejected (401). The session cookie (flow_st) for ${account.email} has expired.`);
                            account.status = AIAccountStatus.UNAUTHORIZED;
                            account.flow_at = undefined;
                            await this.saveAccount(account);
                            throw new Error('Session token has expired. Please update it in the UI.');
                        }
                        const errBody = JSON.stringify(e1.response?.data || e1.message);
                        Logger.info(`[FlowSyncService] Credits REST failed (${status}): ${errBody}`);
                    }

                    if (!creditsFetched && account.flow_st) {
                        try {
                            const trpcRes = await axios.post('https://labs.google/fx/api/trpc/videoFx.credits', { json: null }, {
                                headers: this.getHeaders(account.flow_st, account.flow_at, {
                                    'Referer': 'https://labs.google/fx/tools/flow'
                                })
                            });
                            const trpcData = trpcRes.data?.result?.data?.json;
                            if (trpcData?.credits !== undefined) {
                                account.credits = trpcData.credits;
                                creditsFetched = true;
                            }
                        } catch (e2: any) {
                            const errBody = JSON.stringify(e2.response?.data || e2.message);
                            Logger.info(`[FlowSyncService] Credits tRPC failed (${e2.response?.status}): ${errBody}`);
                        }
                    }

                    if (creditsFetched) {
                        await this.saveAccount(account);
                    } else {
                        Logger.warn(`[FlowSyncService] All credit fetch attempts failed for ${account.email}, using cached: ${account.credits || 0}`);
                    }
                }
                
                // Persist fresh tokens, project ID, and credits to DB provider
                try {
                    const db = await getDatabaseProvider();
                    await db.upsertFlowAccount({
                        id: account.id || `flow_${Date.now()}`,
                        email: account.email,
                        session_token: account.flow_st || '',
                        access_token: account.flow_at,
                        project_id: account.project_id,
                        status: account.status === AIAccountStatus.READY ? 'ACTIVE' : (account.status || 'ACTIVE'),
                        credits_remaining: account.credits !== undefined ? account.credits : 100,
                        last_synced_at: new Date().toISOString(),
                    });
                } catch (dbErr: any) {
                    Logger.warn(`[FlowSyncService] Failed to upsertFlowAccount to DB: ${dbErr.message}`);
                }
            } else {
                throw new Error('Invalid session response: No access token or user info found');
            }
        } catch (err: any) {
            Logger.error(`[FlowSyncService] Token refresh failed for ${account.email}:`, err.message);
            
            if (axios.isAxiosError(err) && err.response?.status === 401) {
                account.status = AIAccountStatus.UNAUTHORIZED;
                await this.saveAccount(account);
            }
        }
    }

    public async ensureProject(account: IAIAccount, session?: any, forceNew: boolean = false): Promise<string> {
        if (account.project_id && !forceNew) {
            return account.project_id;
        }

        Logger.info(`[FlowSyncService] Project ID missing or renewing for ${account.email}. Attempting to resolve...`);

        if (session && !forceNew) {
            const workspace = session.workspace || session.user?.workspace;
            if (workspace?.id) {
                account.project_id = workspace.id;
                await this.saveAccount(account);
                Logger.info(`[FlowSyncService] Resolved projectId from session for ${account.email}: ${account.project_id}`);
                return account.project_id as string;
            }
        }

        return await this.createNewProject(account);
    }

    private async saveAccount(account: IAIAccount){
        try {
            const db = await getDatabaseProvider();
            await db.upsertFlowAccount({
                id: account.id || `flow_${Date.now()}`,
                email: account.email,
                session_token: account.flow_st || '',
                access_token: account.flow_at,
                project_id: account.project_id,
                status: account.status,
                credits_remaining: account.credits !== undefined ? account.credits : 0,
                last_synced_at: new Date().toISOString(),
            });
        } catch (e: any) {
            Logger.warn(`[FlowSyncService] Error saving project to DB: ${e.message}`);
        }
    }

    public async createNewProject(account: IAIAccount): Promise<string> {
        if (!account.flow_st) {
            throw new Error(`Cannot create project for ${account.email}: missing flow_st session cookie`);
        }

        Logger.info(`[FlowSyncService] Creating fresh project for ${account.email}...`);
        const title = `ShineStudio - ${account.email.split('@')[0]} - ${Date.now()}`;
        const createRes = await axios.post('https://labs.google/fx/api/trpc/project.createProject', {
            json: {
                projectTitle: title,
                toolName: "PINHOLE"
            }
        }, {
            headers: this.getHeaders(account.flow_st, undefined, {
                'Referer': 'https://labs.google/fx/tools/flow'
            })
        });

        const projectId = createRes.data?.result?.data?.json?.result?.projectId;
        if (projectId) {
            account.project_id = projectId;
            await this.saveAccount(account);
            Logger.info(`[FlowSyncService] Successfully created and saved project for ${account.email}: ${account.project_id}`);
            return projectId;
        }

        throw new Error(`Could not create Project ID for ${account.email}: ${JSON.stringify(createRes.data)}`);
    }

    private async stToAt(st: string): Promise<any> {
        const url = 'https://labs.google/fx/api/auth/session';
        const headers = this.getHeaders(st, undefined, {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        try {
            const response = await axios.get(url, { 
                headers,
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            if (response.status === 401 || !response.data.access_token || !response.data.user) {
                Logger.error(`[FlowSyncService] Unauthorized: Session token (ST) seems invalid or expired.`);
                throw new Error('Unauthorized: Session token expired');
            }
            // Logger.info(`[FlowSyncService] Session token (ST) converted to access token: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (err: any) {
            Logger.error(`[FlowSyncService] stToAt request failed: ${err.message}`);
            throw err;
        }
    }

    public async extractTokenFromBrowser(email?: string): Promise<string | null> {
        Logger.info(`[FlowSyncService] Attempting browser extraction for ${email || 'unknown account'}...`);
        let context: BrowserContext | null = null;
        let browser: Browser | null = null;

        try {
            browser = await chromium.launch({ headless: true });
            context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 }
            });

            const page = await context.newPage();
            await page.goto('https://labs.google/fx/signin', { waitUntil: 'networkidle' });

            const cookies = await context.cookies();
            const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token');

            if (sessionCookie) {
                // Logger.info(`[FlowSyncService] Successfully extracted ST from browser`);
                return sessionCookie.value;
            }

            return null;
        } catch (err: any) {
            Logger.error('[FlowSyncService] Browser extraction failed:', err.message);
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }
}

export const flowSyncService = FlowSyncService.getInstance();
