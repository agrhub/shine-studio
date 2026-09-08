import { chromium, Browser, BrowserContext } from 'playwright';
import { FlowAccountState, GenerationJobRequest, GenerationJobResult } from '../types.js';
import { accountPool } from '../pool/AccountPool.js';

export class PlaywrightWorker {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
        ],
      });
    }
    return this.browser;
  }

  private cleanCookies(rawCookies: any[]) {
    return rawCookies.map(c => {
      let sameSite: 'Strict' | 'Lax' | 'None' = 'Lax';
      if (c.sameSite === 'no_restriction' || c.sameSite === 'None' || c.sameSite === 'none') {
        sameSite = 'None';
      } else if (c.sameSite === 'strict' || c.sameSite === 'Strict') {
        sameSite = 'Strict';
      }
      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? false,
        sameSite,
      };
    });
  }

  public async verifySession(acc: FlowAccountState): Promise<{
    success: boolean;
    url?: string;
    projectId?: string;
    projectUrl?: string;
    error?: string;
  }> {
    if (!acc.cookies || acc.cookies.length === 0) {
      return { success: false, error: 'No cookies found. Please sync cookies from the Chrome Extension first.' };
    }

    let context: BrowserContext | null = null;
    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
      });

      const formattedCookies = this.cleanCookies(acc.cookies);
      await context.addCookies(formattedCookies);

      const page = await context.newPage();
      const targetUrl = acc.projectUrl || 'https://flow.google.com';
      console.log(`[PlaywrightWorker] 🔍 Verifying headless session for ${acc.accountId} at ${targetUrl}...`);

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      let currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        accountPool.markSessionExpired(acc.accountId, 'Redirected to Google sign-in.');
        return { success: false, url: currentUrl, error: 'Session expired: redirected to Google login.' };
      }

      // If on landing/about page, look for "Create with Google Flow" button
      const createBtn = page.locator('button:has-text("Create with Google Flow"), button:has-text("Try Flow"), a:has-text("Create with Google Flow")').first();
      if (await createBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        console.log(`[PlaywrightWorker] Clicking Create/Enter Flow button on landing page...`);
        await createBtn.click();
        await page.waitForTimeout(4000);
        currentUrl = page.url();
      }

      // Check if redirected to login or account chooser
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin') || currentUrl.includes('accountchooser')) {
        accountPool.markSessionExpired(acc.accountId, 'Redirected to Google sign-in / account chooser.');
        return { success: false, url: currentUrl, error: 'Session expired or needs re-authentication: Google redirected to sign-in / account chooser. Please open flow.google.com in Chrome, log in, and click Sync Cookies again.' };
      }

      // Extract project ID if present in URL
      let projectId = acc.projectId;
      const match = currentUrl.match(/\/project\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        projectId = match[1];
        accountPool.syncProject(acc.accountId, projectId, currentUrl);
      }

      acc.isVerified = true;
      acc.lastVerifiedAt = Date.now();
      acc.lastActiveAt = Date.now();
      console.log(`[PlaywrightWorker] ✅ Headless session verified for ${acc.accountId}! URL: ${currentUrl}`);

      return {
        success: true,
        url: currentUrl,
        projectId,
        projectUrl: projectId ? `https://flow.google.com/project/${projectId}` : currentUrl,
      };
    } catch (err: any) {
      console.error(`[PlaywrightWorker] ❌ Session verification failed for ${acc.accountId}: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  public async executeJob(acc: FlowAccountState, job: GenerationJobRequest): Promise<GenerationJobResult> {
    const startedAt = Date.now();
    acc.status = 'BUSY';
    let context: BrowserContext | null = null;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
      });

      // Inject cookies
      if (acc.cookies && acc.cookies.length > 0) {
        const formattedCookies = this.cleanCookies(acc.cookies);
        await context.addCookies(formattedCookies);
      }

      const page = await context.newPage();
      const targetUrl = acc.projectUrl || 'https://flow.google.com';
      console.log(`[PlaywrightWorker] 🌐 Opening ${targetUrl} for account ${acc.accountId}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check if redirected to login
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        accountPool.markSessionExpired(acc.accountId, 'Redirected to accounts.google.com login screen.');
        throw new Error(`Account ${acc.accountId} session expired (Google login required).`);
      }

      // If on landing/about page, click Create/Try Flow
      const createBtn = page.locator('button:has-text("Create with Google Flow"), button:has-text("Try Flow"), a:has-text("Create with Google Flow")').first();
      if (await createBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(4000);
      }

      // Wait for editor input (.ProseMirror)
      const inputSelector = '.ProseMirror, [contenteditable="true"], textarea';
      await page.waitForSelector(inputSelector, { timeout: 20000 });
      const input = page.locator(inputSelector).first();
      await input.click();
      await input.fill(job.prompt);
      console.log(`[PlaywrightWorker] 📝 Prompt filled: "${job.prompt.slice(0, 50)}..."`);

      // Find and click generate button
      const generateBtnSelector = 'button:has-text("Generate"), button[aria-label*="Generate" i]';
      await page.waitForSelector(generateBtnSelector, { timeout: 10000 });
      const generateBtn = page.locator(generateBtnSelector).first();
      await generateBtn.click();
      console.log(`[PlaywrightWorker] 🚀 Generation triggered. Waiting for output...`);

      // Wait for generated media tile to appear and finish loading
      const timeoutMs = job.timeoutMs || (job.type === 'video' ? 180000 : 90000);
      const mediaSelector = job.type === 'video' 
        ? 'video[src*="flow.google.com/asb"], flow-video-tile video, video' 
        : 'img[src*="flow.google.com/asb"], flow-image-tile img, img[alt*="Generated" i]';

      await page.waitForSelector(mediaSelector, { timeout: timeoutMs });
      const mediaElement = page.locator(mediaSelector).first();
      const mediaUrl = (await mediaElement.getAttribute('src')) || '';

      const durationMs = Date.now() - startedAt;
      console.log(`[PlaywrightWorker] ✅ Success in ${durationMs}ms: ${mediaUrl}`);

      acc.status = 'READY';
      return {
        jobId: job.jobId,
        status: 'SUCCESS',
        mediaUrl,
        durationMs,
      };
    } catch (err: any) {
      acc.status = 'READY';
      console.error(`[PlaywrightWorker] ❌ Error executing job ${job.jobId}: ${err.message}`);
      return {
        jobId: job.jobId,
        status: 'FAILED',
        error: err.message,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }
}

export const playwrightWorker = new PlaywrightWorker();
