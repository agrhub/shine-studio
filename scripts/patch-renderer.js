import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workerRoot, '..', '..');

const candidatePaths = [
  path.join(workerRoot, 'server', 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
  path.join(workerRoot, 'services', 'render-worker', 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
  path.join(repoRoot, 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
  path.join(process.cwd(), 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'),
];

// Look for pnpm virtual store locations too
const pnpmStore = path.join(workerRoot, 'node_modules', '.pnpm');
if (fs.existsSync(pnpmStore)) {
  for (const entry of fs.readdirSync(pnpmStore)) {
    if (entry.includes('@openvideo+video-renderer')) {
      candidatePaths.push(path.join(pnpmStore, entry, 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'));
    }
  }
}

const rootPnpmStore = path.join(repoRoot, 'node_modules', '.pnpm');
if (fs.existsSync(rootPnpmStore)) {
  for (const entry of fs.readdirSync(rootPnpmStore)) {
    if (entry.includes('@openvideo+video-renderer')) {
      candidatePaths.push(path.join(rootPnpmStore, entry, 'node_modules', '@openvideo', 'video-renderer', 'dist', 'renderer.js'));
    }
  }
}

// Also collect package roots for package.json and renderer restoration
const pkgRoots = new Set();
for (const p of candidatePaths) {
  const dir = path.dirname(path.dirname(p));
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    pkgRoots.add(dir);
  }
}

// Find a valid reference renderer.js if any exists
let validRendererContent = '';
for (const dir of pkgRoots) {
  const rPath = path.join(dir, 'dist', 'renderer.js');
  if (fs.existsSync(rPath)) {
    const data = fs.readFileSync(rPath, 'utf8');
    if (data.length > 500 && data.includes('VideoRenderer')) {
      validRendererContent = data;
      break;
    }
  }
}

// Fix package.json exports and ensure dist/renderer.js is not empty
for (const dir of pkgRoots) {
  const pkgJsonPath = path.join(dir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    let pkgChanged = false;
    if (pkg.exports && pkg.exports['.']) {
      if (typeof pkg.exports['.'] === 'object' && !pkg.exports['.']['default']) {
        pkg.exports['.']['default'] = pkg.exports['.']['import'] || './dist/index.js';
        pkgChanged = true;
      }
    }
    if (pkgChanged) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log(`[Patch] Updated exports in: ${pkgJsonPath}`);
    }
  } catch (_) {}

  const rPath = path.join(dir, 'dist', 'renderer.js');
  if (!fs.existsSync(rPath) || fs.statSync(rPath).size < 100) {
    if (validRendererContent) {
      fs.mkdirSync(path.dirname(rPath), { recursive: true });
      fs.writeFileSync(rPath, validRendererContent, 'utf8');
      console.log(`[Patch] Restored missing/empty renderer.js in: ${rPath}`);
    }
  }

  // Fail-fast patch for renderer.html to capture media element 404/network errors
  const htmlPath = path.join(dir, 'renderer.html');
  if (fs.existsSync(htmlPath)) {
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    if (!htmlContent.includes('__failFastMediaPatch__')) {
      const mediaFailFastCode = `
      // /* __failFastMediaPatch__ */ Fail-fast on asset load errors (404, CORS, invalid format)
      window.addEventListener("error", (event) => {
        const target = event.target;
        if (target && (target.tagName === "VIDEO" || target.tagName === "AUDIO" || target.tagName === "IMG")) {
          const src = target.currentSrc || target.src;
          console.error("[browser:asset-error] Failed to load " + target.tagName + ":", src);
          window.__RENDER_ERROR__ = "Failed to load " + target.tagName + " asset (404/Network): " + src;
        }
      }, true);
`;
      if (htmlContent.includes('async function render() {')) {
        htmlContent = htmlContent.replace('async function render() {', `${mediaFailFastCode}\n      async function render() {`);
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log(`[Patch] Injected fail-fast media error handler in: ${htmlPath}`);
      }
    }
  }
}

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
  if (!content || content.length < 100) {
    if (validRendererContent) {
      content = validRendererContent;
    }
  }
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

  if (!content.includes('__failFastAssetPatch')) {
    const assetFailFastHook = `/* __failFastAssetPatch */
            page.on("response", (res) => {
              const status = res.status();
              const url = res.url();
              if (status >= 400 && !url.includes("favicon.ico") && !url.endsWith(".map")) {
                process.stderr.write("[browser:error] Failed to load resource: HTTP " + status + " (" + url + ")\\n");
                page.evaluate((err) => {
                  if (!window.__RENDER_ERROR__) window.__RENDER_ERROR__ = err;
                }, "Asset HTTP " + status + " error: " + url).catch(() => {});
              }
            });
            page.on("requestfailed", (req) => {
              const url = req.url();
              const failure = req.failure();
              if (!url.includes("favicon.ico") && !url.endsWith(".map")) {
                process.stderr.write("[browser:requestfailed] " + url + ": " + failure?.errorText + "\\n");
                page.evaluate((err) => {
                  if (!window.__RENDER_ERROR__) window.__RENDER_ERROR__ = err;
                }, "Asset network failure: " + url + " (" + failure?.errorText + ")").catch(() => {});
              }
            });`;

    if (content.includes('page.on("pageerror"')) {
      content = content.replace(
        /page\.on\("pageerror",\s*\(err\)\s*=>\s*process\.stderr\.write\(`\[browser:pageerror\] \$\{err\.message\}\\n`\)\);/,
        'page.on("pageerror", (err) => process.stderr.write(`[browser:pageerror] ${err.message}\\n`));\n            ' + assetFailFastHook
      );
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(target, content, 'utf8');
    console.log(`[Patch] Successfully patched: ${target}`);
  } else {
    console.log(`[Patch] Up-to-date: ${target}`);
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
                ${varName} = __alt;
                __audioSupp = true;
              }
            }
            if (!__audioSupp) {
              const __opusAlt = { ...${varName}, codec: "opus", sampleRate: 48000 };
              if ((await AudioEncoder.isConfigSupported(__opusAlt))?.supported) {
                console.warn("[AudioEncoder] WebCodecs AAC encoder not supported in this environment (" + ${varName}?.codec + "). Falling back to WebCodecs Opus encoder...");
                ${varName} = __opusAlt;
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
