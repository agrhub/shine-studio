import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workerRoot, '..', '..', '..');

const candidatePaths = [
  path.join(workerRoot, 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
  path.join(repoRoot, 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
  path.join(process.cwd(), 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
];

const found = new Set(candidatePaths.filter(p => fs.existsSync(p)));

const engineDistReplacement = `import fs from "fs";
import { createRequire } from "module";

function resolveEngineDist(pkgRoot) {
  let curr = pkgRoot;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(curr, "node_modules", "@openvideo", "engine-pixi", "dist");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(curr, "node_modules", "@openvideo", "engine-pixi", "dist");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  const monorepo = path.resolve(process.cwd(), "..", "..", "packages", "engine-pixi", "dist");
  if (fs.existsSync(monorepo)) return monorepo;

  const nested = path.join(pkgRoot, "node_modules", "@openvideo", "engine-pixi", "dist");
  if (!fs.existsSync(nested)) {
    try {
      fs.mkdirSync(nested, { recursive: true });
    } catch (_) {}
  }
  return nested;
}

/** Absolute path to the local @openvideo/engine-pixi dist */
const ENGINE_DIST = resolveEngineDist(PKG_ROOT);`;

for (const target of found) {
  let content = fs.readFileSync(target, 'utf8');
  let changed = false;

  if (content.includes('function resolveEngineDist') || content.includes('const ENGINE_DIST = path.join(PKG_ROOT, "node_modules", "@openvideo", "engine-pixi", "dist");')) {
    content = content.replace(
      /import fs from "fs";[\s\S]*?const ENGINE_DIST = resolveEngineDist\(PKG_ROOT\);/,
      engineDistReplacement
    );
    if (!content.includes('resolveEngineDist')) {
      content = content.replace(
        '/** Absolute path to the local @openvideo/engine-pixi dist */\nconst ENGINE_DIST = path.join(PKG_ROOT, "node_modules", "@openvideo", "engine-pixi", "dist");',
        engineDistReplacement
      );
    }
    changed = true;
  }

  if (!content.includes('--disable-web-security')) {
    content = content.replace(
      '"--no-sandbox",',
      '"--no-sandbox",\n                "--disable-web-security",\n                "--disable-features=IsolateOrigins,site-per-process",\n                "--allow-running-insecure-content",'
    );
    changed = true;
  }

  if (!content.includes('chrome-channel-patch')) {
    content = content.replace(
      'headless: true,',
      'headless: true, /* chrome-channel-patch */ channel: (typeof process !== "undefined" && process.env && process.env.PLAYWRIGHT_CHROME_CHANNEL) ? process.env.PLAYWRIGHT_CHROME_CHANNEL : (fs.existsSync("/usr/bin/google-chrome") || fs.existsSync("/usr/bin/google-chrome-stable") ? "chrome" : undefined),'
    );
    changed = true;
  }

  if (!content.includes('__onProgressSafePatch')) {
    content = content.replace(
      'await page.exposeFunction("__onProgress__", (v) => onProgress(v));',
      '/* __onProgressSafePatch */ await (page.__onProgressRegistered ? Promise.resolve() : page.exposeFunction("__onProgress__", (v) => { if (typeof page.__activeProgressCb === "function") page.__activeProgressCb(v); }).then(() => { page.__onProgressRegistered = true; })).then(() => { page.__activeProgressCb = onProgress; }).catch(() => {});'
    );
    if (!content.includes('__onProgressSafePatch')) {
      content = content.replace(
        'page.exposeFunction("__onProgress__",',
        'page.__onProgressRegistered ? Promise.resolve() : page.exposeFunction("__onProgress__",'
      );
    }
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(target, content, 'utf8');
    console.log(`[Patch] Successfully patched renderer: ${target}`);
  }
}

// ─── Patch AudioEncoder in @openvideo/engine-pixi ──────────────────────────────
const engineCandidateDirs = [
  path.join(workerRoot, 'node_modules', '@openvideo', 'engine-pixi', 'dist'),
  path.join(workerRoot, 'node_modules', '@openvideo', 'video-renderer', 'node_modules', '@openvideo', 'engine-pixi', 'dist'),
  path.join(process.cwd(), 'node_modules', '@openvideo', 'engine-pixi', 'dist'),
  path.join(process.cwd(), 'node_modules', '@openvideo', 'video-renderer', 'node_modules', '@openvideo', 'engine-pixi', 'dist'),
  path.resolve(workerRoot, '..', '..', 'packages', 'engine-pixi', 'dist'),
  path.resolve(repoRoot, 'packages', 'engine-pixi', 'dist'),
];

for (const dir of engineCandidateDirs) {
  if (!fs.existsSync(dir)) continue;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.cjs')) continue;
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;

      const audioEncoderRegex = /if\s*\(\s*!\s*\(\s*await\s+AudioEncoder\.isConfigSupported\(([a-zA-Z0-9_$]+)\)\s*\)\.supported\s*\)\s*throw\s+new\s+Error\s*\(\s*`This specific encoder configuration[\s\S]*?`\s*\);?/g;

      if (audioEncoderRegex.test(content)) {
        content = content.replace(audioEncoderRegex, (_match, varName) => {
          return `let __audioSupp = false;
        if (typeof AudioEncoder !== "undefined") {
          try {
            __audioSupp = (await AudioEncoder.isConfigSupported(${varName}))?.supported;
            if (!__audioSupp && ${varName}.sampleRate !== 44100) {
              const __alt = { ...${varName}, sampleRate: 44100 };
              if ((await AudioEncoder.isConfigSupported(__alt))?.supported) {
                Object.assign(${varName}, __alt);
                __audioSupp = true;
              }
            }
            if (!__audioSupp) {
              const __opusAlt = { ...${varName}, codec: "opus", sampleRate: 48000 };
              if ((await AudioEncoder.isConfigSupported(__opusAlt))?.supported) {
                console.warn("[AudioEncoder] WebCodecs AAC encoder not supported in this environment (" + ${varName}?.codec + "). Falling back to WebCodecs Opus encoder...");
                Object.assign(${varName}, __opusAlt);
                this.encodingConfig.codec = "opus";
                if (this.source) this.source._codec = "opus";
                if (this.source?._connectedTrack?.source) this.source._connectedTrack.source._codec = "opus";
                __audioSupp = true;
              }
            }
          } catch (_) {}
        }
        if (!__audioSupp) {
          console.warn("[AudioEncoder] WebCodecs encoder not supported for audio (" + ${varName}?.codec + "). Skipping audio encode...");
          this.encoderInitialized = !0;
          return;
        }`;
        });
        changed = true;
      }

      // Patch Video.tick audio decode timeout from 3s to 60s with graceful PCM fallback
      const audioTimeoutRegex = /if\s*\(\s*performance\.now\(\)\s*-\s*([a-zA-Z0-9_$]+)\.st\s*>\s*3e3\s*\)\s*throw\s+[a-zA-Z0-9_$]+\.abort\s*=\s*!0,\s*Error\(`Video\.tick audio timeout[\s\S]*?`\);?/g;
      if (audioTimeoutRegex.test(content)) {
        content = content.replace(audioTimeoutRegex, (_match, aborterVar) => {
          return `if (performance.now() - ${aborterVar}.st > 60e3) {
          console.warn("[Video.tick] Audio decode wait exceeded, using available PCM chunks without aborting...");
          return (this.pcmData && this.pcmData.frameCnt > 0 && typeof SC === "function") ? SC(this.pcmData, this.pcmData.frameCnt) : [];
        }`;
        });
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[Patch] Successfully patched engine-pixi: ${filePath}`);
      }
    }
  } catch (err) {
    console.warn(`[Patch] Notice during engine-pixi patching in ${dir}: ${err.message}`);
  }
}

