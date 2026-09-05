import axios, { AxiosError } from 'axios';
import { chromium, BrowserContext, Browser } from 'playwright';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountStatus, AIAccountType, IAIAccount, FlowAccountEntity } from '~/types.js';
import { Logger } from '@/utils/logger.js';
import { emailService } from '@/services/EmailService.js';

export interface FlowUser {
    name?: string;
    email?: string;
    image?: string;
    workspace?: { id: string; name?: string };
}

export interface FlowSessionResponse {
    user?: FlowUser;
    expires?: string;
    access_token?: string;
    workspace?: { id: string; name?: string };
    newSessionToken?: string;
}

export interface FlowCreditsResponse {
    credits?: number;
}

export interface FlowTrpcResponse<T = unknown> {
    result?: {
        data?: {
            json?: T;
        };
    };
}

export interface FlowCreateProjectResult {
    result?: {
        projectId?: string;
    };
}

function extractErrorMessage(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as Record<string, unknown> | string | undefined;
        if (typeof data === 'object' && data !== null) {
            const msg = (data as Record<string, unknown>).message || (data as Record<string, unknown>).error;
            if (msg) return String(msg);
        }
        return err.message;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

export class FlowSyncService {
    private static instance: FlowSyncService;
    private isSyncing = false;
    private lastAlertSent = new Map<string, number>();

    private constructor() {}

    private async notifyExpiredCookie(email: string, reason: string): Promise<void> {
        const now = Date.now();
        const lastSent = this.lastAlertSent.get(email.toLowerCase()) || 0;
        // 4 hour cooldown per account to avoid spamming the admin
        if (now - lastSent < 4 * 60 * 60 * 1000) {
            return;
        }
        this.lastAlertSent.set(email.toLowerCase(), now);
        try {
            await emailService.sendFlowCookieExpiredAlert(email, reason);
            Logger.info(`[FlowSyncService] Sent expired cookie email alert for ${email}`);
        } catch (alertErr: unknown) {
            Logger.warn(`[FlowSyncService] Failed to send expired cookie email for ${email}: ${extractErrorMessage(alertErr)}`);
        }
    }

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

    public start(): void {
        if (process.env.DISABLE_LOCAL_FLOW_SYNC === '1') {
            Logger.info('[FlowSyncService] Background sync disabled via environment.');
            return;
        }
        // Run sync every 5 minutes in standalone mode
        setInterval(() => this.syncAllAccounts(), 1 * 60 * 1000);
        // Initial delayed sync to allow DB connections to settle
        setTimeout(() => this.syncAllAccounts(), 5000);
    }

    public async syncAllAccounts(): Promise<void> {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const db = await getDatabaseProvider();
            const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
            if (accounts && accounts.length > 0) {
                Logger.info(`[FlowSyncService] Syncing ${accounts.length} Google Flow accounts...`);
            }
            for (const account of accounts || []) {
                try {
                    const st = account.session_token;
                    if (st) {
                        const accountObj: IAIAccount = {
                            id: account.id,
                            email: account.email,
                            session_token: st,
                            access_token: account.access_token,
                            project_id: account.project_id,
                            status: account.status,
                            credits: account.credits_remaining,
                            account_type: AIAccountType.GOOGLE_FLOW,
                            is_active: true,
                        };
                        await this.refreshAccountTokens(accountObj);
                    }
                } catch (err: unknown) {
                    Logger.warn(`[FlowSyncService] Failed to sync account ${account.email}: ${extractErrorMessage(err)}`);
                }
            }
        } catch (err: unknown) {
            Logger.warn(`[FlowSyncService] Background sync notice (DB unavailable or credentials not set): ${extractErrorMessage(err)}`);
        } finally {
            this.isSyncing = false;
            Logger.info('[FlowSyncService] Background sync completed.');
        }
    }

    public async refreshAccountTokens(account: IAIAccount): Promise<void> {
        const currentST = account.session_token;
        if (!currentST) {
            Logger.warn(`[FlowSyncService] No Session Token for ${account.email}. Skipping refresh.`);
            return;
        }
        account.session_token = currentST;

        try {
            const session = await this.stToAt(currentST);
            
            if (session.newSessionToken && session.newSessionToken !== account.session_token) {
                Logger.info(`[FlowSyncService] Google returned refreshed session cookie for ${account.email}, updating in DB...`);
                account.session_token = session.newSessionToken;
            }

            if (session.access_token || session.user) {
                const newAT = session.access_token;
                if (newAT) {
                    account.access_token = newAT;
                } else {
                    Logger.warn(`[FlowSyncService] Session returned no access_token for ${account.email}, keeping existing AT`);
                }

                if (session.expires) {
                    const expiresAt = new Date(session.expires).getTime();
                    if (expiresAt < Date.now()) {
                        Logger.warn(`[FlowSyncService] Session for ${account.email} returned an expired token (${session.expires}). The session_token needs to be updated.`);
                        account.status = AIAccountStatus.UNAUTHORIZED;
                        account.access_token = undefined;
                        account.token_expires_at = undefined;
                        await this.saveAccount(account);
                        await this.notifyExpiredCookie(account.email, `Cookie session expired at ${session.expires}`);
                        throw new Error('Session token has expired. Please update it in the UI.');
                    }
                    account.token_expires_at = new Date(session.expires);
                }
                
                if (session.user) {
                    account.email = session.user.email || account.email;
                    account.name = session.user.name || account.name;
                    account.avatar_url = session.user.image || account.avatar_url;
                }

                account.status = AIAccountStatus.READY;
                account.error_message = undefined;
                this.lastAlertSent.delete(account.email.toLowerCase());
                await this.saveAccount(account);
                
                await this.ensureProject(account, session);

                if (account.access_token) {
                    let creditsFetched = false;
                    try {
                        const GOOGLE_FLOW_API_KEY = 'AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY';
                        const creditsRes = await axios.get<FlowCreditsResponse>(`https://aisandbox-pa.googleapis.com/v1/credits?key=${GOOGLE_FLOW_API_KEY}`, {
                            headers: this.getHeaders(undefined, account.access_token)
                        });
                        if (creditsRes.data?.credits !== undefined) {
                            account.credits = creditsRes.data.credits;
                            creditsFetched = true;
                        }
                    } catch (e1: unknown) {
                        const axiosErr = e1 as AxiosError<Record<string, unknown>>;
                        const status = axiosErr.response?.status;
                        if (status === 401) {
                            Logger.warn(`[FlowSyncService] CRITICAL: New access token was immediately rejected (401). The session cookie for ${account.email} has expired.`);
                            account.status = AIAccountStatus.UNAUTHORIZED;
                            account.access_token = undefined;
                            await this.saveAccount(account);
                            await this.notifyExpiredCookie(account.email, 'Access token was rejected with 401 Unauthorized.');
                            throw new Error('Session token has expired. Please update it in the UI.');
                        }
                        const errBody = JSON.stringify(axiosErr.response?.data || axiosErr.message);
                        Logger.info(`[FlowSyncService] Credits REST failed (${status}): ${errBody}`);
                    }

                    if (!creditsFetched && account.session_token) {
                        try {
                            const trpcRes = await axios.post<FlowTrpcResponse<{ credits?: number }>>('https://labs.google/fx/api/trpc/videoFx.credits', { json: null }, {
                                headers: this.getHeaders(account.session_token, account.access_token, {
                                    'Referer': 'https://labs.google/fx/tools/flow'
                                })
                            });
                            const trpcData = trpcRes.data?.result?.data?.json;
                            if (trpcData?.credits !== undefined) {
                                account.credits = trpcData.credits;
                                creditsFetched = true;
                            }
                        } catch (e2: unknown) {
                            const axiosErr = e2 as AxiosError<Record<string, unknown>>;
                            const errBody = JSON.stringify(axiosErr.response?.data || axiosErr.message);
                            Logger.info(`[FlowSyncService] Credits tRPC failed (${axiosErr.response?.status}): ${errBody}`);
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
                        session_token: account.session_token || '',
                        access_token: account.access_token,
                        project_id: account.project_id,
                        status: account.status === AIAccountStatus.READY ? 'ACTIVE' : (account.status || 'ACTIVE'),
                        credits_remaining: account.credits !== undefined ? account.credits : 100,
                        last_synced_at: new Date().toISOString(),
                    });
                } catch (dbErr: unknown) {
                    Logger.warn(`[FlowSyncService] Failed to upsertFlowAccount to DB: ${extractErrorMessage(dbErr)}`);
                }
            } else {
                throw new Error('Invalid session response: No access token or user info found');
            }
        } catch (err: unknown) {
            Logger.error(`[FlowSyncService] Token refresh failed for ${account.email}:`, extractErrorMessage(err));
            
            if (axios.isAxiosError(err) && err.response?.status === 401) {
                account.status = AIAccountStatus.UNAUTHORIZED;
                await this.saveAccount(account);
                await this.notifyExpiredCookie(account.email, 'Google Flow API returned 401 Unauthorized.');
            }
        }
    }

    public async ensureProject(account: IAIAccount, session?: FlowSessionResponse, forceNew = false): Promise<string> {
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
                return account.project_id;
            }
        }

        return await this.createNewProject(account);
    }

    private async saveAccount(account: IAIAccount): Promise<void> {
        try {
            const db = await getDatabaseProvider();
            let name = account.name;
            let avatar = account.avatar_url || (account as any).avatar;

            await db.upsertFlowAccount({
                id: account.id || `flow_${Date.now()}`,
                email: account.email,
                name,
                avatar,
                session_token: account.session_token || '',
                access_token: account.access_token,
                project_id: account.project_id,
                status: account.status,
                credits_remaining: account.credits !== undefined ? account.credits : 0,
                last_synced_at: new Date().toISOString(),
            });
        } catch (e: unknown) {
            Logger.warn(`[FlowSyncService] Error saving project to DB: ${extractErrorMessage(e)}`);
        }
    }

    public async createNewProject(account: IAIAccount): Promise<string> {
        if (!account.session_token) {
            throw new Error(`Cannot create project for ${account.email}: missing session_token cookie`);
        }

        Logger.info(`[FlowSyncService] Creating fresh project for ${account.email}...`);
        const title = `ShineStudio - ${account.email.split('@')[0]} - ${Date.now()}`;
        const createRes = await axios.post<FlowTrpcResponse<FlowCreateProjectResult>>('https://labs.google/fx/api/trpc/project.createProject', {
            json: {
                projectTitle: title,
                toolName: "PINHOLE"
            }
        }, {
            headers: this.getHeaders(account.session_token, undefined, {
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

    private async stToAt(st: string): Promise<FlowSessionResponse> {
        const url = 'https://labs.google/fx/api/auth/session';
        const headers = this.getHeaders(st, undefined, {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        try {
            const response = await axios.get<FlowSessionResponse>(url, { 
                headers,
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            if (response.status === 401 || !response.data?.access_token || !response.data?.user) {
                Logger.error(`[FlowSyncService] Unauthorized: Session token (ST) seems invalid or expired.`);
                throw new Error('Unauthorized: Session token expired');
            }

            // Capture rotated session token from Set-Cookie header if provided by NextAuth
            let newSessionToken: string | undefined;
            const setCookie = response.headers['set-cookie'];
            if (setCookie) {
                const list = Array.isArray(setCookie) ? setCookie : [setCookie];
                for (const c of list) {
                    const match = c.match(/__Secure-next-auth\.session-token=([^;]+)/i);
                    if (match && match[1]) {
                        try {
                            newSessionToken = decodeURIComponent(match[1].trim());
                        } catch {
                            newSessionToken = match[1].trim();
                        }
                        break;
                    }
                }
            }

            return {
                ...response.data,
                newSessionToken,
            };
        } catch (err: unknown) {
            Logger.error(`[FlowSyncService] stToAt request failed: ${extractErrorMessage(err)}`);
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
        } catch (err: unknown) {
            Logger.error('[FlowSyncService] Browser extraction failed:', extractErrorMessage(err));
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }
}

export const flowSyncService = FlowSyncService.getInstance();
