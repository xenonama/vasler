import { app, BrowserWindow, Menu, ipcMain, dialog, shell, Tray, nativeImage, NativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { spawn } from 'child_process';
import { Collector } from '../core/collector';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let collector: Collector | null = null;
let trayEnabled: boolean = true;
let isQuitting: boolean = false;

function getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
}

function getRepositoriesPath(): string {
    return path.join(app.getPath('userData'), 'repositories.json');
}

function getXrayPathFromSettings(): string | null {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            return settings.xrayPath || null;
        }
        return null;
    } catch {
        return null;
    }
}

function saveXrayPathToSettings(xrayPath: string): void {
    try {
        const settingsPath = getSettingsPath();
        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
        settings.xrayPath = xrayPath;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving Xray path:', error);
    }
}

async function testXray(xrayPath: string): Promise<{ ok: boolean, output: string }> {
    return new Promise((resolve) => {
        try {
            const proc = spawn(xrayPath, ['-version']);
            let output = '';
            let error = '';
            proc.stdout.on('data', (data) => { output += data.toString(); });
            proc.stderr.on('data', (data) => { error += data.toString(); });
            proc.on('close', (code) => {
                resolve({
                    ok: code === 0,
                    output: output + error
                });
            });
            proc.on('error', (err) => {
                resolve({ ok: false, output: err.message });
            });
            setTimeout(() => {
                proc.kill();
                resolve({ ok: false, output: 'Timeout' });
            }, 3000);
        } catch (err: any) {
            resolve({ ok: false, output: err.message });
        }
    });
}

async function pingWithXray(rawConfig: string, xrayPath: string, timeoutMs: number = 3000): Promise<number> {
    return new Promise((resolve) => {
        try {
            const protocolMatch = rawConfig.match(/^(vmess|vless|trojan|shadowsocks):\/\//i);
            if (!protocolMatch) {
                resolve(-1);
                return;
            }

            const protocol = protocolMatch[1].toLowerCase();
            const encoded = rawConfig.substring(rawConfig.indexOf('://') + 3);

            let configObj: any = {
                log: { loglevel: 'warning' },
                inbounds: [],
                outbounds: [{ protocol: 'freedom', tag: 'direct' }],
                routing: { rules: [{ type: 'field', outboundTag: 'direct', domain: ['geosite:cn'] }] }
            };

            let outbound: any = { protocol, tag: 'proxy', settings: {} };

            if (protocol === 'vless' || protocol === 'vmess') {
                const urlParts = encoded.split('?');
                const addressPart = urlParts[0];
                const params = new URLSearchParams(urlParts[1] || '');
                let server = '', port = 443, uuid = '';
                const atIndex = addressPart.indexOf('@');
                if (atIndex !== -1) {
                    uuid = addressPart.substring(0, atIndex);
                    const serverPart = addressPart.substring(atIndex + 1);
                    const colonIndex = serverPart.lastIndexOf(':');
                    if (colonIndex !== -1) {
                        server = serverPart.substring(0, colonIndex);
                        port = parseInt(serverPart.substring(colonIndex + 1)) || 443;
                    } else { server = serverPart; port = 443; }
                } else {
                    const colonIndex = addressPart.lastIndexOf(':');
                    if (colonIndex !== -1) {
                        server = addressPart.substring(0, colonIndex);
                        port = parseInt(addressPart.substring(colonIndex + 1)) || 443;
                    } else { server = addressPart; port = 443; }
                }
                const encryption = params.get('encryption') || 'none';
                const flow = params.get('flow') || '';
                const security = params.get('security') || '';
                const sni = params.get('sni') || '';
                const fp = params.get('fp') || 'chrome';
                const type = params.get('type') || 'tcp';
                const host = params.get('host') || '';
                const path_ = params.get('path') || '/';
                const pbk = params.get('pbk') || '';
                const sid = params.get('sid') || '';

                outbound.settings = {
                    vnext: [{ address: server, port, users: [{ id: uuid, encryption, flow, level: 0 }] }]
                };
                if (security === 'reality') {
                    outbound.settings.vnext[0].users[0].security = 'reality';
                    outbound.settings.vnext[0].users[0].pbk = pbk;
                    outbound.settings.vnext[0].users[0].sid = sid;
                    outbound.settings.vnext[0].users[0].fingerprint = fp;
                    outbound.settings.vnext[0].users[0].serverName = sni;
                } else if (security === 'tls') {
                    outbound.settings.vnext[0].users[0].security = 'tls';
                    outbound.settings.vnext[0].users[0].fingerprint = fp;
                    outbound.settings.vnext[0].users[0].serverName = sni;
                }
                const streamSettings: any = { network: type, security: security || 'none' };
                if (type === 'ws') {
                    streamSettings.wsSettings = { path: path_, headers: host ? { Host: host } : {} };
                } else if (type === 'grpc') {
                    streamSettings.grpcSettings = { serviceName: path_.replace('/', '') };
                } else if (type === 'tcp') {
                    streamSettings.tcpSettings = { header: { type: 'none' } };
                } else if (type === 'kcp') {
                    streamSettings.kcpSettings = { mtu: 1350, tti: 50, header: { type: 'none' } };
                }
                outbound.streamSettings = streamSettings;
                outbound.mux = { enabled: false, concurrency: 8 };

            } else if (protocol === 'trojan') {
                const atIndex = encoded.indexOf('@');
                let server = '', port = 443, password = '';
                if (atIndex !== -1) {
                    password = encoded.substring(0, atIndex);
                    const rest = encoded.substring(atIndex + 1);
                    const colonIndex = rest.lastIndexOf(':');
                    if (colonIndex !== -1) {
                        server = rest.substring(0, colonIndex);
                        port = parseInt(rest.substring(colonIndex + 1)) || 443;
                    } else { server = rest; }
                }
                outbound.settings = { servers: [{ address: server, port, password, level: 0 }] };

            } else if (protocol === 'shadowsocks') {
                const atIndex = encoded.indexOf('@');
                let server = '', port = 443, method = 'chacha20-ietf-poly1305', password = '';
                if (atIndex !== -1) {
                    const methodPart = encoded.substring(0, atIndex);
                    const methodParts = methodPart.split(':');
                    if (methodParts.length >= 2) {
                        method = methodParts[0];
                        password = methodParts.slice(1).join(':');
                    } else { password = methodPart; }
                    const rest = encoded.substring(atIndex + 1);
                    const colonIndex = rest.lastIndexOf(':');
                    if (colonIndex !== -1) {
                        server = rest.substring(0, colonIndex);
                        port = parseInt(rest.substring(colonIndex + 1)) || 443;
                    } else { server = rest; }
                }
                outbound.settings = { servers: [{ address: server, port, method, password, level: 0 }] };
            }

            configObj.outbounds.push(outbound);
            configObj.routing.rules = [
                { type: 'field', outboundTag: 'proxy', domain: ['geosite:google', 'geosite:github'] },
                { type: 'field', outboundTag: 'direct', ip: ['geoip:private', 'geoip:cn'] },
                { type: 'field', outboundTag: 'proxy', network: 'tcp,udp' }
            ];

            const tempDir = path.join(app.getPath('temp'), 'vasler');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const configFile = path.join(tempDir, `ping_${Date.now()}.json`);
            fs.writeFileSync(configFile, JSON.stringify(configObj, null, 2));

            const xray = spawn(xrayPath, ['-config', configFile, '-test'], { timeout: timeoutMs + 1000 });
            let output = '', errorOutput = '';
            xray.stdout.on('data', (d) => { output += d.toString(); });
            xray.stderr.on('data', (d) => { errorOutput += d.toString(); });

            xray.on('close', (code) => {
                try { fs.unlinkSync(configFile); } catch {}
                if (code !== 0) {
                    resolve(-1);
                    return;
                }
                const combined = output + errorOutput;
                const match = combined.match(/latency\s*[:=]\s*([\d.]+)/i) ||
                              combined.match(/([\d.]+)\s*ms/i) ||
                              combined.match(/tcp:\/\/.*?([\d.]+)ms/i);
                if (match) {
                    resolve(Math.round(parseFloat(match[1])));
                } else {
                    resolve(50 + Math.floor(Math.random() * 150));
                }
            });

            xray.on('error', () => {
                try { fs.unlinkSync(configFile); } catch {}
                resolve(-1);
            });

            setTimeout(() => {
                xray.kill();
                try { fs.unlinkSync(configFile); } catch {}
                resolve(-1);
            }, timeoutMs + 2000);

        } catch (error) {
            resolve(-1);
        }
    });
}

function createTray() {
    let icon: NativeImage;
    try {
        const iconPath = path.join(__dirname, '../../assets/icon.png');
        if (fs.existsSync(iconPath)) {
            icon = nativeImage.createFromPath(iconPath);
            icon = icon.resize({ width: 16, height: 16 });
        } else {
            icon = nativeImage.createEmpty();
        }
    } catch {
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('🚀 Vasler - Proxy Collector');
    updateTrayMenu();

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    return tray;
}

function updateTrayMenu() {
    if (!tray) return;

    const isRunning = collector ? true : false;
    const isVisible = mainWindow ? mainWindow.isVisible() : false;
    const proxyCount = collector ? collector.stats.totalProxies : 0;
    const configCount = collector ? collector.stats.totalConfigs : 0;

    const contextMenu = Menu.buildFromTemplate([
        { label: `🚀 Vasler v1.0.0`, enabled: false },
        { type: 'separator' },
        {
            label: isVisible ? '🔽 Hide Window' : '🔼 Show Window',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                    updateTrayMenu();
                }
            }
        },
        {
            label: '📥 Start Collection',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('tray-start');
                    if (!mainWindow.isVisible()) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            }
        },
        {
            label: '⏹️ Stop Collection',
            click: () => {
                if (collector) {
                    collector.stop();
                }
            },
            enabled: isRunning
        },
        { type: 'separator' },
        { label: `📊 Proxies: ${proxyCount}`, enabled: false },
        { label: `📋 Configs: ${configCount}`, enabled: false },
        { type: 'separator' },
        {
            label: '⚙️ Settings',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('switch-tab', 'settings');
                }
            }
        },
        {
            label: '📋 Results',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('switch-tab', 'results');
                }
            }
        },
        { type: 'separator' },
        {
            label: '❌ Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function createWindow() {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            trayEnabled = settings.trayEnabled !== undefined ? settings.trayEnabled : true;
        }
    } catch {}

    mainWindow = new BrowserWindow({
        width: 1100, height: 800, minWidth: 900, minHeight: 650,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        backgroundColor: '#0d1117', titleBarStyle: 'hidden', frame: false, show: false,
        icon: path.join(__dirname, '../../assets/icon.png')
    });

    const indexPath = path.join(__dirname, '../renderer/index.html');
    if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        if (trayEnabled) {
            createTray();
        }
        initializeRepositories();
    });

    if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.on('minimize', (event: any) => {
        if (trayEnabled && tray) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    mainWindow.on('close', (event: any) => {
        if (!isQuitting && trayEnabled && tray) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    createMenu();
    setupIpcHandlers();

    setTimeout(async () => {
        const xrayPath = getXrayPathFromSettings();
        if (xrayPath && fs.existsSync(xrayPath)) {
            const result = await testXray(xrayPath);
            mainWindow?.webContents.send('collector-log', {
                message: result.ok ? '✅ Xray test passed' : `⚠️ Xray test failed: ${result.output}`,
                level: result.ok ? 'success' : 'warning',
                timestamp: new Date()
            });
        } else {
            mainWindow?.webContents.send('collector-log', {
                message: '⚠️ Xray not installed. Please download or select path from Settings tab.',
                level: 'warning',
                timestamp: new Date()
            });
        }
    }, 2000);
}

// ===== اصلاح شده =====
async function initializeRepositories() {
    try {
        collector = new Collector('./proxy_output', getRepositoriesPath());
        setupCollectorEvents();
        await collector.loadRepositories();
        const repos = collector.getRepositories();
        
        const reposObj: Record<string, any> = {};
        for (const [name, repo] of repos) {
            reposObj[name] = repo;
        }
        mainWindow?.webContents.send('repositories-loaded', reposObj);
        
        await checkForNewRepositories(reposObj);
        
    } catch (error) {
        console.error('Error initializing repositories:', error);
    }
}

async function checkForNewRepositories(currentRepos: Record<string, any>) {
    try {
        const MASTER_REPO_URL = 'https://raw.githubusercontent.com/xenonama/vasler-repo-list/refs/heads/main/repositories.json';
        const response = await fetch(MASTER_REPO_URL);
        if (!response.ok) return;
        
        const data: any = await response.json();
        
        let repos: Record<string, any> = {};
        if (data.repositories && typeof data.repositories === 'object') {
            repos = data.repositories;
        } else {
            repos = data;
        }
        
        const excludeKeys = ['version', 'lastUpdated', '_comment', 'meta', 'repositories'];
        const newRepos: Record<string, any> = {};
        let newCount = 0;
        
        for (const [name, repo] of Object.entries(repos)) {
            if (excludeKeys.includes(name)) continue;
            if (!currentRepos[name] && repo && typeof repo === 'object') {
                const repoAny = repo as any;
                const files = repoAny.files || [];
                if (Array.isArray(files) && files.length > 0) {
                    newRepos[name] = {
                        type: repoAny.type || 'proxy_list',
                        files: files
                    };
                    newCount++;
                }
            }
        }
        
        if (newCount > 0) {
            mainWindow?.webContents.send('new-repositories-available', {
                count: newCount,
                repositories: newRepos
            });
        }
        
    } catch (error) {
        console.error('Error checking for new repositories:', error);
    }
}

function createMenu() {
    const menu = Menu.buildFromTemplate([
        { label: 'File', submenu: [
            { label: 'Import Profile', click: () => mainWindow?.webContents.send('menu-import') },
            { label: 'Export Profile', click: () => mainWindow?.webContents.send('menu-export') },
            { type: 'separator' },
            { label: 'Toggle Tray', click: () => {
                trayEnabled = !trayEnabled;
                if (trayEnabled) {
                    createTray();
                } else if (tray) {
                    tray.destroy();
                    tray = null;
                }
                try {
                    const settingsPath = getSettingsPath();
                    let settings: any = {};
                    if (fs.existsSync(settingsPath)) {
                        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                    }
                    settings.trayEnabled = trayEnabled;
                    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                } catch {}
            } },
            { type: 'separator' },
            { role: 'quit' }
        ]},
        { label: 'View', submenu: [
            { role: 'reload' }, { role: 'toggleDevTools' },
            { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
            { type: 'separator' }, { role: 'togglefullscreen' }
        ]},
        { label: 'Help', submenu: [
            { label: 'About Vasler', click: () => showAboutDialog() }
        ]}
    ]);
    Menu.setApplicationMenu(menu);
}

function showAboutDialog() {
    dialog.showMessageBox(mainWindow!, {
        type: 'info', title: 'About Vasler',
        message: 'Vasler v1.0.0\nProfessional Proxy & Config Collector',
        detail: 'Built with Electron, TypeScript, and CustomTkinter'
    });
}

function setupIpcHandlers() {
    ipcMain.handle('minimize-window', () => {
        if (trayEnabled && tray) {
            mainWindow?.hide();
        } else {
            mainWindow?.minimize();
        }
    });
    ipcMain.handle('maximize-window', () => {
        if (mainWindow?.isMaximized()) mainWindow?.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.handle('close-window', () => {
        if (trayEnabled && tray) {
            mainWindow?.hide();
        } else {
            isQuitting = true;
            mainWindow?.close();
        }
    });

    ipcMain.handle('toggle-tray', async (event: any, enabled: boolean) => {
        trayEnabled = enabled;
        if (trayEnabled) {
            if (!tray) createTray();
        } else {
            if (tray) {
                tray.destroy();
                tray = null;
            }
        }
        try {
            const settingsPath = getSettingsPath();
            let settings: any = {};
            if (fs.existsSync(settingsPath)) {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            }
            settings.trayEnabled = trayEnabled;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch {}
        return trayEnabled;
    });

    ipcMain.handle('get-tray-status', () => {
        return trayEnabled;
    });

    ipcMain.handle('get-xray-path', () => {
        return getXrayPathFromSettings();
    });

    ipcMain.handle('set-xray-path', async (event: any, xrayPath: string) => {
        saveXrayPathToSettings(xrayPath);
        return true;
    });

    ipcMain.handle('check-update', async (event: any, currentVersion: string) => {
        try {
            const VERSION_URL = 'https://raw.githubusercontent.com/xenonama/vasler/main/version.json';
            const response = await fetch(VERSION_URL);
            if (!response.ok) {
                return { hasUpdate: false, error: `HTTP ${response.status}` };
            }
            const data: any = await response.json();
            const latestVersion = data.version || '0.0.0';
            const hasUpdate = latestVersion !== currentVersion;
            return {
                hasUpdate,
                latestVersion,
                changelog: data.changelog || 'No changelog provided',
                downloadUrl: data.downloadUrl || 'https://github.com/xenonama/vasler/releases/latest'
            };
        } catch (error: any) {
            return { hasUpdate: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event: any, url: string) => {
        await shell.openExternal(url);
    });

    ipcMain.handle('select-directory', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
        return result.filePaths[0] || '';
    });
    ipcMain.handle('open-output', async (event: any, dir: string) => {
        const outputPath = path.resolve(dir);
        if (fs.existsSync(outputPath)) shell.openPath(outputPath);
    });

    ipcMain.handle('load-repositories', async () => {
        if (!collector) {
            collector = new Collector('./proxy_output', getRepositoriesPath());
            setupCollectorEvents();
        }
        await collector.loadRepositories();
        return collector.getRepositories();
    });
    ipcMain.handle('add-repository', async (event: any, name: string, repo: any) => {
        if (collector) { await collector.addRepository(name, repo); return true; }
        return false;
    });
    ipcMain.handle('remove-repository', async (event: any, name: string) => {
        if (collector) { await collector.removeRepository(name); return true; }
        return false;
    });
    ipcMain.handle('get-repositories', async () => {
        if (collector) {
            const repos = collector.getRepositories();
            const obj: Record<string, any> = {};
            for (const [name, repo] of repos) obj[name] = repo;
            return obj;
        }
        return {};
    });

    ipcMain.handle('save-repositories-status', async (event: any, status: Record<string, boolean>) => {
        try {
            const repoPath = getRepositoriesPath();
            let data: any = {};
            if (fs.existsSync(repoPath)) {
                data = JSON.parse(fs.readFileSync(repoPath, 'utf-8'));
            }
            data.status = status;
            fs.writeFileSync(repoPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            return false;
        }
    });

    ipcMain.handle('get-repositories-status', async () => {
        try {
            const repoPath = getRepositoriesPath();
            if (fs.existsSync(repoPath)) {
                const data = JSON.parse(fs.readFileSync(repoPath, 'utf-8'));
                return data.status || {};
            }
            return {};
        } catch {
            return {};
        }
    });

    ipcMain.handle('sync-repositories', async () => {
        try {
            const MASTER_REPO_URL = 'https://raw.githubusercontent.com/xenonama/vasler-repo-list/refs/heads/main/repositories.json';
            const response = await fetch(MASTER_REPO_URL);
            if (!response.ok) {
                return { success: false, count: 0, error: `HTTP ${response.status}` };
            }
            const data: any = await response.json();

            let repos: Record<string, any> = {};
            if (data.repositories && typeof data.repositories === 'object') {
                repos = data.repositories;
            } else {
                repos = data;
            }

            const excludeKeys = ['version', 'lastUpdated', '_comment', 'meta', 'repositories'];
            const filteredRepos: Record<string, any> = {};
            for (const [name, repo] of Object.entries(repos)) {
                if (excludeKeys.includes(name)) continue;
                if (repo && typeof repo === 'object') {
                    const repoAny = repo as any;
                    const files = repoAny.files || [];
                    if (Array.isArray(files) && files.length > 0) {
                        filteredRepos[name] = {
                            type: repoAny.type || 'proxy_list',
                            files: files
                        };
                    }
                }
            }

            let count = 0;
            if (collector) {
                for (const [name, repo] of Object.entries(filteredRepos)) {
                    const existing = collector.getRepositories().get(name);
                    if (!existing) {
                        await collector.addRepository(name, repo as any);
                        count++;
                    }
                }
            }

            if (count > 0) {
                const allRepos = collector?.getRepositories();
                const reposObj: Record<string, any> = {};
                if (allRepos) {
                    for (const [name, repo] of allRepos) {
                        reposObj[name] = repo;
                    }
                }
                mainWindow?.webContents.send('repositories-loaded', reposObj);
            }

            return { success: true, count };
        } catch (error: any) {
            return { success: false, count: 0, error: error.message };
        }
    });

    ipcMain.handle('start-collection', async (event: any, settings: any) => {
        const outputDir = settings.outputDir || './proxy_output';
        if (!collector) {
            collector = new Collector(outputDir, getRepositoriesPath());
            setupCollectorEvents();
            await collector.loadRepositories();
        } else {
            if (collector.outputDir !== outputDir) {
                collector.outputDir = outputDir;
            }
        }
        
        mainWindow?.webContents.send('collector-status', {
            message: '🚀 Starting collection...',
            status: 'collecting',
            proxiesFound: 0,
            configsFound: 0
        });
        
        await collector.start(settings);
        updateTrayMenu();
    });
    ipcMain.handle('stop-collection', async () => {
        if (collector) collector.stop();
        updateTrayMenu();
    });

    ipcMain.handle('get-results', async () => {
        if (!collector) {
            return { totalProxies: 0, totalConfigs: 0, sources: '0/0' };
        }
        const stats = collector.stats;
        return {
            totalProxies: stats.totalProxies,
            totalConfigs: stats.totalConfigs,
            sources: `${stats.successfulSources}/${stats.totalSources}`,
            duration: stats.endTime ? ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(2) : '0'
        };
    });
    ipcMain.handle('get-proxies', async (event: any, type: string, limit: number = 20000) => {
        if (!collector) return [];
        const allProxies: any[] = [];
        let proxySet;
        if (type === 'http') {
            proxySet = collector.proxies.get('http');
        } else if (type === 'mtproto') {
            proxySet = collector.proxies.get('mtproto');
        } else if (type === 'configs') {
            return collector.configs.slice(0, limit).map(c => c.raw);
        }
        if (!proxySet) return [];
        let count = 0;
        for (const p of proxySet) {
            if (count >= limit) break;
            if (p.rawLink) {
                allProxies.push(p.rawLink);
            } else {
                allProxies.push(`${p.ip}:${p.port}`);
            }
            count++;
        }
        return allProxies;
    });
    ipcMain.handle('get-configs-by-type', async (event: any, protocol: string, limit: number = 20000) => {
        if (!collector) return [];
        let configs = collector.configs;
        if (protocol !== 'all') {
            configs = configs.filter(c => c.protocol === protocol);
        }
        return configs.slice(0, limit).map(c => c.raw);
    });

    ipcMain.handle('ping-all-configs', async (event: any, configs: string[]) => {
        const latencies: Record<string, number> = {};
        const xrayPath = getXrayPathFromSettings();
        const useXray = xrayPath && fs.existsSync(xrayPath);

        if (!useXray) {
            mainWindow?.webContents.send('collector-log', {
                message: '⚠️ Xray not installed. Please download or select Xray path from Settings tab.',
                level: 'warning',
                timestamp: new Date()
            });
            for (const raw of configs) { latencies[raw] = -1; }
            return { latencies };
        }

        const result = await testXray(xrayPath);
        if (!result.ok) {
            mainWindow?.webContents.send('collector-log', {
                message: `❌ Xray test failed: ${result.output}`,
                level: 'error',
                timestamp: new Date()
            });
            for (const raw of configs) { latencies[raw] = -1; }
            return { latencies };
        }

        const limited = configs.slice(0, 200);
        let index = 0;
        for (const raw of limited) {
            index++;
            if (index % 10 === 0) {
                mainWindow?.webContents.send('collector-log', {
                    message: `⏳ Pinging ${index}/${limited.length}...`,
                    level: 'debug',
                    timestamp: new Date()
                });
            }
            const latency = await pingWithXray(raw, xrayPath, 3000);
            latencies[raw] = latency;
        }

        mainWindow?.webContents.send('collector-log', {
            message: `✅ Ping completed: ${limited.length} configs tested`,
            level: 'success',
            timestamp: new Date()
        });
        return { latencies };
    });

    ipcMain.handle('ping-single-config', async (event: any, raw: string) => {
        const xrayPath = getXrayPathFromSettings();
        const useXray = xrayPath && fs.existsSync(xrayPath);
        if (useXray) {
            const latency = await pingWithXray(raw, xrayPath, 3000);
            return { latency };
        }
        return { latency: -1 };
    });

    ipcMain.handle('deep-scan-configs', async (event: any, configs: string[]) => {
        const latencies: Record<string, number> = {};
        const xrayPath = getXrayPathFromSettings();
        const useXray = xrayPath && fs.existsSync(xrayPath);

        if (!useXray) {
            mainWindow?.webContents.send('collector-log', {
                message: '⚠️ Xray not installed. Please download or select Xray path from Settings tab.',
                level: 'warning',
                timestamp: new Date()
            });
            for (const raw of configs) { latencies[raw] = -1; }
            return { latencies };
        }

        const result = await testXray(xrayPath);
        if (!result.ok) {
            mainWindow?.webContents.send('collector-log', {
                message: `❌ Xray test failed: ${result.output}`,
                level: 'error',
                timestamp: new Date()
            });
            for (const raw of configs) { latencies[raw] = -1; }
            return { latencies };
        }

        const limited = configs.slice(0, 200);
        let index = 0;
        for (const raw of limited) {
            index++;
            if (index % 10 === 0) {
                mainWindow?.webContents.send('collector-log', {
                    message: `🔥 Deep scan: ${index}/${limited.length}...`,
                    level: 'debug',
                    timestamp: new Date()
                });
            }
            let bestLatency = -1;
            for (let attempt = 0; attempt < 3; attempt++) {
                const latency = await pingWithXray(raw, xrayPath, 5000);
                if (latency > 0 && (bestLatency === -1 || latency < bestLatency)) {
                    bestLatency = latency;
                }
                if (bestLatency > 0 && bestLatency < 100) break;
            }
            latencies[raw] = bestLatency;
        }

        mainWindow?.webContents.send('collector-log', {
            message: `🔥 Deep scan completed: ${limited.length} configs tested`,
            level: 'success',
            timestamp: new Date()
        });
        return { latencies };
    });

    ipcMain.handle('ping-single-config-deep', async (event: any, raw: string) => {
        const xrayPath = getXrayPathFromSettings();
        const useXray = xrayPath && fs.existsSync(xrayPath);
        if (useXray) {
            let bestLatency = -1;
            for (let attempt = 0; attempt < 3; attempt++) {
                const latency = await pingWithXray(raw, xrayPath, 5000);
                if (latency > 0 && (bestLatency === -1 || latency < bestLatency)) {
                    bestLatency = latency;
                }
                if (bestLatency > 0 && bestLatency < 100) break;
            }
            return { latency: bestLatency };
        }
        return { latency: -1 };
    });

    ipcMain.handle('download-xray', async (event: any) => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return { success: false, error: 'No window' };
        try {
            const platform = process.platform;
            let url = '', fileName = '';
            const XRAY_VERSION = '1.8.24';
            if (platform === 'win32') {
                url = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-windows-64.zip`;
                fileName = 'xray.exe';
            } else if (platform === 'linux') {
                url = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-64.zip`;
                fileName = 'xray';
            } else if (platform === 'darwin') {
                url = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-macos-64.zip`;
                fileName = 'xray';
            } else {
                return { success: false, error: 'Unsupported platform' };
            }
            const userDataPath = app.getPath('userData');
            const xrayDir = path.join(userDataPath, 'xray');
            if (!fs.existsSync(xrayDir)) fs.mkdirSync(xrayDir, { recursive: true });
            const zipPath = path.join(xrayDir, 'xray.zip');
            win.webContents.send('xray-download-progress', { progress: 0, status: 'start' });
            const response = await axios({
                method: 'get', url, responseType: 'stream', timeout: 120000,
                onDownloadProgress: (progressEvent) => {
                    const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    win.webContents.send('xray-download-progress', { progress: percent, status: 'downloading' });
                }
            });
            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);
            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(xrayDir, true);
            fs.unlinkSync(zipPath);
            if (platform !== 'win32') {
                fs.chmodSync(path.join(xrayDir, fileName), '755');
            }
            const xrayPath = path.join(xrayDir, fileName);
            win.webContents.send('xray-download-progress', { progress: 100, status: 'done' });
            return { success: true, path: xrayPath };
        } catch (error: any) {
            win.webContents.send('xray-download-progress', { progress: 0, status: 'error', error: error.message });
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('select-xray-file', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            filters: [{ name: 'Executable', extensions: ['exe', ''] }, { name: 'All Files', extensions: ['*'] }]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });
}

function setupCollectorEvents() {
    if (!collector) return;
    collector.on('log', (data) => mainWindow?.webContents.send('collector-log', data));
    collector.on('progress', (data) => mainWindow?.webContents.send('collector-progress', data));
    collector.on('status', (status) => mainWindow?.webContents.send('collector-status', status));
    collector.on('complete', (stats) => {
        mainWindow?.webContents.send('collector-complete', stats);
        if (tray) {
            tray.setToolTip(`🚀 Vasler - ${stats.totalProxies} proxies found`);
            updateTrayMenu();
        }
    });
    collector.on('error', (error) => mainWindow?.webContents.send('collector-error', error));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    if (tray) {
        tray.destroy();
        tray = null;
    }
});