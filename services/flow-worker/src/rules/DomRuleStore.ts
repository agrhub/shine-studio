import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DomRulesConfig {
  version: number;
  updatedAt: string;
  rules: Record<string, any>;
}

export class DomRuleStore {
  private static instance: DomRuleStore;
  private currentRules: DomRulesConfig;
  private customConfigPath: string;
  private defaultConfigPath: string;

  private constructor() {
    this.defaultConfigPath = path.join(__dirname, 'defaultDomRules.json');
    // Save custom overrides in config/dom-rules.json (persists across runs)
    this.customConfigPath = path.join(__dirname, '..', '..', 'config', 'dom-rules.json');
    this.currentRules = this.loadRules();
  }

  public static getInstance(): DomRuleStore {
    if (!DomRuleStore.instance) {
      DomRuleStore.instance = new DomRuleStore();
    }
    return DomRuleStore.instance;
  }

  private loadRules(): DomRulesConfig {
    let defaults: DomRulesConfig = {
      version: 1,
      updatedAt: new Date().toISOString(),
      rules: {},
    };

    try {
      if (fs.existsSync(this.defaultConfigPath)) {
        defaults = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf8'));
      }
    } catch (err: any) {
      console.warn('[DomRuleStore] Failed to read default rules:', err.message);
    }

    if (fs.existsSync(this.customConfigPath)) {
      try {
        const custom = JSON.parse(fs.readFileSync(this.customConfigPath, 'utf8'));
        console.log(`[DomRuleStore] 📜 Loaded custom DOM rules from ${this.customConfigPath} (version ${custom.version})`);
        return {
          version: custom.version || defaults.version + 1,
          updatedAt: custom.updatedAt || new Date().toISOString(),
          rules: {
            ...defaults.rules,
            ...custom.rules,
          },
        };
      } catch (err: any) {
        console.warn('[DomRuleStore] Failed to parse custom dom-rules.json, falling back to defaults:', err.message);
      }
    }

    return defaults;
  }

  public getRules(): DomRulesConfig {
    return this.currentRules;
  }

  public updateRules(updatedRules: Record<string, any>): DomRulesConfig {
    const configDir = path.dirname(this.customConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const nextVersion = (this.currentRules.version || 1) + 1;
    this.currentRules = {
      version: nextVersion,
      updatedAt: new Date().toISOString(),
      rules: {
        ...this.currentRules.rules,
        ...updatedRules,
      },
    };

    try {
      fs.writeFileSync(this.customConfigPath, JSON.stringify(this.currentRules, null, 2), 'utf8');
      console.log(`[DomRuleStore] 💾 Saved updated DOM rules to ${this.customConfigPath} (version ${nextVersion})`);
    } catch (err: any) {
      console.error('[DomRuleStore] Failed to save custom rules:', err.message);
    }

    return this.currentRules;
  }

  public resetToDefault(): DomRulesConfig {
    if (fs.existsSync(this.customConfigPath)) {
      try {
        fs.unlinkSync(this.customConfigPath);
        console.log('[DomRuleStore] 🔄 Removed custom dom-rules.json, reset to default rules.');
      } catch (_) {}
    }
    this.currentRules = this.loadRules();
    return this.currentRules;
  }
}
