"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/* src/index.ts */
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const cp = __importStar(require("child_process"));
const isWin = os.platform() === 'win32';
/**
 * Retrieves an input variable from the CI environment.
 * Works with GitHub Actions and Gitea Actions (v2+ format).
 */
function getInput(name) {
    return process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] ?? '';
}
/**
 * Writes an output variable for the CI runner.
 * Compatible with $GITHUB_OUTPUT / $GITEA_OUTPUT protocols.
 */
async function setOutput(name, value) {
    const outputFile = process.env.GITHUB_OUTPUT || process.env.GITEA_OUTPUT;
    if (outputFile) {
        await fs.appendFile(outputFile, `${name}=${value}\n`);
    }
}
async function run() {
    const version = getInput('version');
    const url = getInput('url');
    const cacheDir = path.resolve(getInput('cache-dir') || '.renode-cache');
    const stripComponents = parseInt(getInput('strip-components') || '1', 10);
    if (!version || !url) {
        throw new Error('Inputs "version" and "url" are required');
    }
    await fs.mkdir(cacheDir, { recursive: true });
    // Determine file extensions and paths
    const isZip = url.toLowerCase().endsWith('.zip');
    const archiveExt = isZip ? 'zip' : 'tar.gz';
    const archivePath = path.join(cacheDir, `renode-${version}.${archiveExt}`);
    const extractDir = path.join(cacheDir, version);
    const binName = isWin ? 'Renode.exe' : 'renode';
    const binPath = path.join(extractDir, binName);
    // Check if the downloaded archive is already cached locally
    let archiveCacheHit = false;
    try {
        await fs.stat(archivePath);
        archiveCacheHit = true;
        console.log(`Archive cache hit: ${archivePath}`);
    }
    catch {
        console.log(`Archive missing. Downloading from ${url}`);
    }
    // Download archive only if not cached
    if (!archiveCacheHit) {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        const buf = await res.arrayBuffer();
        await fs.writeFile(archivePath, Buffer.from(buf));
        console.log(`Archive saved: ${archivePath}`);
    }
    // Check if Renode is already extracted and executable
    let extracted = false;
    try {
        const stats = await fs.stat(binPath);
        if (stats.isFile())
            extracted = true;
    }
    catch {
        // Binary missing or invalid → will extract
    }
    // Extract only if necessary
    if (!extracted) {
        console.log(`Extracting archive to ${extractDir}...`);
        await fs.mkdir(extractDir, { recursive: true });
        const stripArg = `--strip-components=${stripComponents}`;
        // Built-in 'tar' is available on Windows 10+, Linux, and macOS
        cp.execSync(`tar -xf "${archivePath}" -C "${extractDir}" ${stripArg}`, { stdio: 'inherit' });
        // Set executable permissions on Unix-like systems
        if (!isWin) {
            try {
                await fs.chmod(binPath, 0o755);
            }
            catch { }
        }
        console.log(`Extraction complete`);
    }
    // Export outputs for subsequent workflow steps
    await setOutput('renode-path', extractDir);
    await setOutput('cache-hit', String(archiveCacheHit));
    await setOutput('extracted', String(extracted));
}
// Execute and handle fatal errors
run().catch(err => {
    console.error('Action failed:', err.message);
    process.exit(1);
});
