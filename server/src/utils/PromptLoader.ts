import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '@/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

/**
 * Load and render a structured prompt template from `server/src/prompts/`
 * Supports:
 * - Variable interpolation: `{{variable}}`
 * - Conditional blocks: `{{#if variable}}...{{/if}}`
 */
export class PromptLoader {
  private static cache: Map<string, string> = new Map();

  /**
   * Load raw template text from file
   */
  public static loadTemplate(templatePath: string): string {
    const normalizedPath = templatePath.endsWith('.md') ? templatePath : `${templatePath}.md`;
    
    if (this.cache.has(normalizedPath) && process.env.NODE_ENV === 'production') {
      return this.cache.get(normalizedPath)!;
    }

    const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
    const possiblePaths = [
      // 1. Production bundle: dist/prompts right beside dist/index.js
      path.join(currentFileDir, 'prompts', normalizedPath),
      // 2. Monorepo CWD (/app or workspace root)
      path.join(process.cwd(), 'server', 'dist', 'prompts', normalizedPath),
      path.join(process.cwd(), 'server', 'src', 'prompts', normalizedPath),
      path.join(process.cwd(), 'server', 'prompts', normalizedPath),
      // 3. Local dev CWD = server directory (tsx / ts-node)
      path.join(process.cwd(), 'src', 'prompts', normalizedPath),
      path.join(process.cwd(), 'prompts', normalizedPath),
      path.join(process.cwd(), 'dist', 'prompts', normalizedPath),
      // 4. Relative to fileURLToPath (dev: src/utils/../prompts; prod: dist/../src/prompts)
      path.resolve(currentFileDir, '../prompts', normalizedPath),
      path.resolve(currentFileDir, '../src/prompts', normalizedPath),
      path.resolve(currentFileDir, '../../server/src/prompts', normalizedPath),
      path.resolve(currentFileDir, '../../src/prompts', normalizedPath),
    ];

    let fullPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        fullPath = p;
        break;
      }
    }

    if (!fullPath) {
      Logger.warn(`[PromptLoader] Template not found: ${normalizedPath}`);
      return '';
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      this.cache.set(normalizedPath, content);
      return content;
    } catch (err: any) {
      Logger.error(`[PromptLoader] Failed to read template ${fullPath}: ${err.message}`);
      return '';
    }
  }

  /**
   * Render template with variables
   */
  public static render(templatePath: string, variables: Record<string, any> = {}): string {
    let template = this.loadTemplate(templatePath);
    if (!template) return '';

    // 1. Process conditional blocks: {{#if varName}}...{{/if}}
    template = template.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, innerContent) => {
      const val = variables[varName];
      if (val && (!Array.isArray(val) || val.length > 0) && val !== '') {
        return innerContent;
      }
      return '';
    });

    // 2. Process variable placeholders: {{varName}}
    template = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, varName) => {
      const val = variables[varName];
      if (val !== undefined && val !== null) {
        return String(val);
      }
      return '';
    });

    return template.trim();
  }

  /**
   * Clear template cache (useful in development)
   */
  public static clearCache(): void {
    this.cache.clear();
  }
}
