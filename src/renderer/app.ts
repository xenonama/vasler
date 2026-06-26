const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// ============================================================
//  Settings File Path
// ============================================================
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

// ============================================================
//  Default Settings
// ============================================================
let DEFAULT_SETTINGS: any = {};
try {
    DEFAULT_SETTINGS = require('../default-settings.json');
} catch {
    DEFAULT_SETTINGS = {
        outputDir: './proxy_output',
        ports: [],
        pingTimes: 1,
        timeout: 10,
        verifyLiveness: true,
        csvOutput: false,
        fullJson: false,
        txtOutput: true,
        speedTest: true,
        protocols: ['http', 'socks5'],
        theme: 'dark',
        killSwitch: false,
        trayEnabled: true
    };
}

// ============================================================
//  Safe DOM Helpers
// ============================================================
function getElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id) as T | null;
    if (!el) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return el;
}

// ============================================================
//  DOM References
// ============================================================
const logContent = getElement<HTMLPreElement>('logContent');
const progressFill = getElement<HTMLDivElement>('progressFill');
const progressText = getElement<HTMLSpanElement>('progressText');

const startBtn = getElement<HTMLButtonElement>('startBtn');
const stopBtn = getElement<HTMLButtonElement>('stopBtn');
const clearLogBtn = getElement<HTMLButtonElement>('clearLogBtn');
const copyLogBtn = getElement<HTMLButtonElement>('copyLogBtn');
const refreshBtn = getElement<HTMLButtonElement>('refreshBtn');
const browseBtn = getElement<HTMLButtonElement>('browseBtn');
const addRepoBtn = getElement<HTMLButtonElement>('addRepoBtn');
const deleteRepoBtn = getElement<HTMLButtonElement>('deleteRepoBtn');
const updateRepoBtn = getElement<HTMLButtonElement>('updateRepoBtn');
const syncRepoBtn = getElement<HTMLButtonElement>('syncRepoBtn');
const resetBtn = getElement<HTMLButtonElement>('resetBtn');
const toggleLogBtn = getElement<HTMLButtonElement>('toggleLogBtn');
const logPanel = getElement<HTMLDivElement>('logPanel');

const minimizeBtn = getElement<HTMLButtonElement>('minimizeBtn');
const maximizeBtn = getElement<HTMLButtonElement>('maximizeBtn');
const closeBtn = getElement<HTMLButtonElement>('closeBtn');

const portsInput = getElement<HTMLInputElement>('ports');
const pingTimesInput = getElement<HTMLInputElement>('pingTimes');
const timeoutInput = getElement<HTMLInputElement>('timeout');
const outputDirInput = getElement<HTMLInputElement>('outputDir');
const csvCheckbox = getElement<HTMLInputElement>('csv');
const fullJsonCheckbox = getElement<HTMLInputElement>('fullJson');
const txtOutputCheckbox = getElement<HTMLInputElement>('txtOutput');
const repoNameInput = getElement<HTMLInputElement>('repoNameInput');
const repoUrlsInput = getElement<HTMLTextAreaElement>('repoUrlsInput');
const themeSelect = getElement<HTMLSelectElement>('themeSelect');
const verifyCheckbox = getElement<HTMLInputElement>('verify');
const speedTestCheckbox = getElement<HTMLInputElement>('speedTest');
const repoList = getElement<HTMLDivElement>('repoList');

const trayToggle = getElement<HTMLInputElement>('trayToggle');

// ===== Version & Update =====
const versionDisplay = getElement<HTMLSpanElement>('versionDisplay');
const checkUpdateBtn = getElement<HTMLButtonElement>('checkUpdateBtn');
const updateInfoRow = getElement<HTMLDivElement>('updateInfoRow');
const updateInfo = getElement<HTMLSpanElement>('updateInfo');

// ===== Results Elements =====
const resultsSummary = getElement<HTMLDivElement>('resultsSummary');
const refreshResultsBtn = getElement<HTMLButtonElement>('refreshResultsBtn');
const openResultsFolderBtn = getElement<HTMLButtonElement>('openResultsFolderBtn');

const vlessList = getElement<HTMLTextAreaElement>('vlessList');
const vlessCount = getElement<HTMLSpanElement>('vlessCount');
const vmessList = getElement<HTMLTextAreaElement>('vmessList');
const vmessCount = getElement<HTMLSpanElement>('vmessCount');
const trojanList = getElement<HTMLTextAreaElement>('trojanList');
const trojanCount = getElement<HTMLSpanElement>('trojanCount');
const ssList = getElement<HTMLTextAreaElement>('ssList');
const ssCount = getElement<HTMLSpanElement>('ssCount');
const otherConfigsList = getElement<HTMLTextAreaElement>('otherConfigsList');
const otherConfigsCount = getElement<HTMLSpanElement>('otherConfigsCount');
const httpList = getElement<HTMLTextAreaElement>('httpList');
const httpCount = getElement<HTMLSpanElement>('httpCount');
const mtprotoList = getElement<HTMLTextAreaElement>('mtprotoList');
const mtprotoCount = getElement<HTMLSpanElement>('mtprotoCount');

// ===== Pinger Elements =====
const pingAllBtn = getElement<HTMLButtonElement>('pingAllBtn');
const clearDeadBtn = getElement<HTMLButtonElement>('clearDeadBtn');
const retryDeadBtn = getElement<HTMLButtonElement>('retryDeadBtn');
const pingerStatus = getElement<HTMLSpanElement>('pingerStatus');
const pingerTotal = getElement<HTMLSpanElement>('pingerTotal');
const pingerAlive = getElement<HTMLSpanElement>('pingerAlive');
const pingerDead = getElement<HTMLSpanElement>('pingerDead');
const aliveCount = getElement<HTMLSpanElement>('aliveCount');
const deadCount = getElement<HTMLSpanElement>('deadCount');
const aliveList = getElement<HTMLDivElement>('aliveList');
const deadList = getElement<HTMLDivElement>('deadList');

// ===== Xray Elements =====
const downloadXrayBtn = getElement<HTMLButtonElement>('downloadXrayBtn');
const selectXrayBtn = getElement<HTMLButtonElement>('selectXrayBtn');
const xrayStatus = getElement<HTMLSpanElement>('xrayStatus');
const xrayProgressRow = getElement<HTMLDivElement>('xrayProgressRow');
const xrayProgressFill = getElement<HTMLDivElement>('xrayProgressFill');
const xrayProgressText = getElement<HTMLSpanElement>('xrayProgressText');

const CURRENT_VERSION = '1.0.0';
let isRunning = false;
let logExpanded = false;
let repositories: Record<string, any> = {};

// ===== State for Pinger =====
interface ConfigItem {
    raw: string;
    protocol: string;
    name: string;
    latency: number;
}
let aliveConfigs: ConfigItem[] = [];
let deadConfigs: ConfigItem[] = [];
let allConfigs: ConfigItem[] = [];

// ============================================================
//  Logging
// ============================================================
function log(message: string, level: string = 'info') {
    const colors: Record<string, string> = {
        info: '#8b949e', success: '#3fb950', error: '#f85149',
        warning: '#d29922', debug: '#58a6ff'
    };
    const color = colors[level] || '#8b949e';
    const timestamp = new Date().toLocaleTimeString();
    const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : level === 'warning' ? '⚠️' : '📌';
    logContent.innerHTML += `<span style="color:${color}">${prefix} [${timestamp}] ${message}</span>\n`;
    logContent.scrollTop = logContent.scrollHeight;
}

// ============================================================
//  UI Updates
// ============================================================
function updateProgress(current: number, total: number) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}

function setRunning(state: boolean) {
    isRunning = state;
    startBtn.disabled = state;
    stopBtn.disabled = !state;
}

// ============================================================
//  Settings Management
// ============================================================
function getSettings() {
    const protocolCheckboxes = document.querySelectorAll('#protocolsContainer input[type="checkbox"]');
    const protocols = Array.from(protocolCheckboxes)
        .filter(cb => (cb as HTMLInputElement).checked)
        .map(cb => (cb as HTMLInputElement).value);
    return {
        outputDir: outputDirInput.value || DEFAULT_SETTINGS.outputDir || './proxy_output',
        ports: portsInput.value ? portsInput.value.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p)) : [],
        pingTimes: parseInt(pingTimesInput.value) || DEFAULT_SETTINGS.pingTimes || 1,
        timeout: parseInt(timeoutInput.value) || DEFAULT_SETTINGS.timeout || 10,
        verifyLiveness: verifyCheckbox.checked,
        csvOutput: csvCheckbox.checked,
        fullJson: fullJsonCheckbox.checked,
        txtOutput: txtOutputCheckbox.checked,
        speedTest: speedTestCheckbox.checked,
        protocols,
        theme: themeSelect.value,
        killSwitch: false,
        trayEnabled: trayToggle.checked
    };
}

function saveSettings() {
    try {
        const settings = getSettings();
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        // ignore
    }
}

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const settings = JSON.parse(data);
            applySettings(settings);
            return true;
        } else {
            log('💾 No settings file found. Using defaults...', 'info');
            applySettings(DEFAULT_SETTINGS);
            saveSettings();
            return true;
        }
    } catch (error) {
        log('⚠️ Error loading settings. Using defaults...', 'warning');
        applySettings(DEFAULT_SETTINGS);
        return false;
    }
}

function applySettings(settings: any) {
    if (settings.outputDir) outputDirInput.value = settings.outputDir;
    if (settings.ports !== undefined) portsInput.value = settings.ports.join(',');
    if (settings.pingTimes) pingTimesInput.value = settings.pingTimes;
    if (settings.timeout) timeoutInput.value = settings.timeout;
    
    verifyCheckbox.checked = settings.verifyLiveness ?? true;
    csvCheckbox.checked = settings.csvOutput ?? false;
    fullJsonCheckbox.checked = settings.fullJson ?? false;
    txtOutputCheckbox.checked = settings.txtOutput ?? true;
    speedTestCheckbox.checked = settings.speedTest ?? true;
    
    if (settings.trayEnabled !== undefined) {
        trayToggle.checked = settings.trayEnabled;
    }
    
    if (settings.theme) {
        themeSelect.value = settings.theme;
        document.body.className = settings.theme;
    }
    
    if (settings.protocols) {
        document.querySelectorAll('#protocolsContainer input[type="checkbox"]').forEach(cb => {
            const el = cb as HTMLInputElement;
            el.checked = settings.protocols.includes(el.value);
        });
    }
}

// ============================================================
//  Xray Management
// ============================================================
function getXrayPath(): string | null {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const settings = JSON.parse(data);
            return settings.xrayPath || null;
        }
        return null;
    } catch {
        return null;
    }
}

function setXrayPath(xrayPath: string) {
    try {
        let settings: any = {};
        if (fs.existsSync(SETTINGS_FILE)) {
            settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
        settings.xrayPath = xrayPath;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        setTimeout(() => checkXrayInstalled(), 100);
    } catch (error) {
        const err = error as any;
        log('❌ Error saving Xray path: ' + err.message, 'error');
    }
}

function checkXrayInstalled() {
    try {
        const xrayPath = getXrayPath();
        if (xrayPath && fs.existsSync(xrayPath)) {
            xrayStatus.textContent = '✅ Installed';
            xrayStatus.style.color = '#3fb950';
            return true;
        } else {
            xrayStatus.textContent = '❌ Not installed';
            xrayStatus.style.color = '#f85149';
            return false;
        }
    } catch {
        xrayStatus.textContent = '❌ Not installed';
        xrayStatus.style.color = '#f85149';
        return false;
    }
}

async function downloadXray() {
    if (downloadXrayBtn.disabled) return;
    downloadXrayBtn.disabled = true;
    xrayStatus.textContent = '⏳ Downloading...';
    xrayStatus.style.color = '#d29922';
    xrayProgressRow.style.display = 'flex';
    xrayProgressFill.style.width = '0%';
    xrayProgressText.textContent = '0%';

    try {
        const result = await ipcRenderer.invoke('download-xray');
        if (result.success) {
            setXrayPath(result.path);
            xrayStatus.textContent = '✅ Installed';
            xrayStatus.style.color = '#3fb950';
            log('✅ Xray core installed successfully', 'success');
        } else {
            xrayStatus.textContent = '❌ Error: ' + result.error;
            xrayStatus.style.color = '#f85149';
            log('❌ Error downloading Xray: ' + result.error, 'error');
        }
    } catch (error) {
        const err = error as any;
        xrayStatus.textContent = '❌ Error';
        xrayStatus.style.color = '#f85149';
        log('❌ Error downloading Xray: ' + err.message, 'error');
    } finally {
        downloadXrayBtn.disabled = false;
        setTimeout(() => {
            xrayProgressRow.style.display = 'none';
        }, 3000);
    }
}

async function selectXrayPath() {
    try {
        const result = await ipcRenderer.invoke('select-xray-file');
        if (result) {
            setXrayPath(result);
            log('✅ Xray path selected: ' + result, 'success');
        }
    } catch (error) {
        const err = error as any;
        log('❌ Error selecting Xray: ' + err.message, 'error');
    }
}

// ============================================================
//  Tab Switching
// ============================================================
document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const el = item as HTMLElement;
        const tabName = el.dataset.tab;
        if (!tabName) return;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById(`tab-${tabName}`);
        if (targetTab) targetTab.classList.add('active');
        if (tabName === 'results') {
            refreshResults();
        }
        if (tabName === 'pinger') {
            renderPinger();
        }
    });
});

// ============================================================
//  Switch Tab from Tray
// ============================================================
ipcRenderer.on('switch-tab', (event: any, tabName: string) => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    const sidebarItem = document.querySelector(`[data-tab="${tabName}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');
    if (tabName === 'results') {
        refreshResults();
    }
    if (tabName === 'pinger') {
        renderPinger();
    }
});

// ============================================================
//  Log Panel
// ============================================================
toggleLogBtn.addEventListener('click', () => {
    logExpanded = !logExpanded;
    logPanel.classList.toggle('expanded', logExpanded);
    toggleLogBtn.textContent = logExpanded ? '▼' : '▲';
});

copyLogBtn.addEventListener('click', () => {
    const text = logContent.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
        log('📄 Log copied to clipboard', 'success');
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(logContent);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        document.execCommand('copy');
        window.getSelection()?.removeAllRanges();
        log('📄 Log copied to clipboard', 'success');
    });
});

// ============================================================
//  Title Bar
// ============================================================
minimizeBtn.addEventListener('click', () => ipcRenderer.invoke('minimize-window'));
maximizeBtn.addEventListener('click', () => ipcRenderer.invoke('maximize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.invoke('close-window'));

// ============================================================
//  Repository Management
// ============================================================
async function loadRepositories() {
    try {
        const repos = await ipcRenderer.invoke('get-repositories');
        repositories = repos || {};
        renderRepoList();
    } catch (error) {
        const err = error as any;
        log('❌ Error loading repos: ' + err.message, 'error');
    }
}

function renderRepoList() {
    repoList.innerHTML = '';
    const entries = Object.entries(repositories);
    if (entries.length === 0) {
        repoList.innerHTML = '<div class="repo-item" style="color:#8b949e;padding:12px;">No repositories found.</div>';
        return;
    }
    entries.forEach(([name, repo]) => {
        if (!repo || typeof repo !== 'object') {
            return;
        }
        const types = Array.isArray(repo.type) ? repo.type.join(', ') : (repo.type || 'unknown');
        const files = repo.files || [];
        const div = document.createElement('div');
        div.className = 'repo-item';
        div.innerHTML = `
            <input type="checkbox" class="repo-select" data-name="${name}">
            <div class="repo-info">
                <div><span class="repo-name">${name}</span> <span class="repo-type">[${types}]</span></div>
                <div class="repo-urls">${files.map((url: string) => `<span>${url.split('/').pop()}</span>`).join('')}</div>
            </div>
            <div class="repo-actions"><button class="delete-btn" data-name="${name}" title="Delete">🗑️</button></div>
        `;
        repoList.appendChild(div);
        const deleteBtn = div.querySelector('.delete-btn') as HTMLButtonElement;
        deleteBtn.addEventListener('click', async () => {
            const name = deleteBtn.dataset.name;
            if (name && confirm(`Delete repository "${name}"?`)) {
                await ipcRenderer.invoke('remove-repository', name);
                await loadRepositories();
                log('🗑️ Repository "' + name + '" deleted', 'success');
            }
        });
    });
}

// ============================================================
//  Results Management
// ============================================================
async function refreshResults() {
    try {
        const results = await ipcRenderer.invoke('get-results');
        if (results.totalProxies === 0 && results.totalConfigs === 0) {
            resultsSummary.innerHTML = '<span>🔄 Run collection to see results...</span>';
            return;
        }
        resultsSummary.innerHTML = `
            <span>📊 Total Proxies: <strong>${results.totalProxies}</strong> | 
            Total Configs: <strong>${results.totalConfigs}</strong> | 
            Sources: <strong>${results.sources}</strong> | 
            Duration: <strong>${results.duration}s</strong></span>
        `;

        const vlessConfigs = await ipcRenderer.invoke('get-configs-by-type', 'vless', 500);
        vlessList.value = vlessConfigs.join('\n');
        vlessCount.textContent = String(vlessConfigs.length);

        const vmessConfigs = await ipcRenderer.invoke('get-configs-by-type', 'vmess', 500);
        vmessList.value = vmessConfigs.join('\n');
        vmessCount.textContent = String(vmessConfigs.length);

        const trojanConfigs = await ipcRenderer.invoke('get-configs-by-type', 'trojan', 500);
        trojanList.value = trojanConfigs.join('\n');
        trojanCount.textContent = String(trojanConfigs.length);

        const ssConfigs = await ipcRenderer.invoke('get-configs-by-type', 'shadowsocks', 500);
        ssList.value = ssConfigs.join('\n');
        ssCount.textContent = String(ssConfigs.length);

        const otherProtocols = ['ssr', 'socks', 'http'];
        let otherConfigs: string[] = [];
        for (const proto of otherProtocols) {
            const configs = await ipcRenderer.invoke('get-configs-by-type', proto, 500);
            otherConfigs = otherConfigs.concat(configs);
        }
        otherConfigsList.value = otherConfigs.join('\n');
        otherConfigsCount.textContent = String(otherConfigs.length);

        const httpProxies = await ipcRenderer.invoke('get-proxies', 'http', 500);
        httpList.value = httpProxies.join('\n');
        httpCount.textContent = String(httpProxies.length);

        const mtprotoProxies = await ipcRenderer.invoke('get-proxies', 'mtproto', 500);
        mtprotoList.value = mtprotoProxies.join('\n');
        mtprotoCount.textContent = String(mtprotoProxies.length);

        await loadConfigsForPinger();

    } catch (error) {
        const err = error as any;
        log('❌ Error refreshing results: ' + err.message, 'error');
    }
}

// ============================================================
//  Pinger Management
// ============================================================
async function loadConfigsForPinger() {
    try {
        const protocols = ['vless', 'vmess', 'trojan', 'shadowsocks', 'ssr', 'socks', 'http'];
        let all: ConfigItem[] = [];
        for (const proto of protocols) {
            const configs = await ipcRenderer.invoke('get-configs-by-type', proto, 1000);
            for (const raw of configs) {
                const name = generateConfigName(raw, proto);
                all.push({ raw, protocol: proto, name, latency: -1 });
            }
        }
        allConfigs = all;
        pingerTotal.textContent = String(all.length);
        renderPinger();
    } catch (error) {
        const err = error as any;
        log('❌ Error loading configs for pinger: ' + err.message, 'error');
    }
}

function generateConfigName(raw: string, protocol: string): string {
    try {
        const parts = raw.split('://');
        if (parts.length < 2) return protocol.toUpperCase() + '-' + Math.floor(Math.random() * 1000);
        const afterProtocol = parts[1];
        const atIndex = afterProtocol.indexOf('@');
        let server = '', port = '';
        if (atIndex !== -1) {
            const rest = afterProtocol.substring(atIndex + 1);
            const colonIndex = rest.lastIndexOf(':');
            if (colonIndex !== -1) {
                server = rest.substring(0, colonIndex);
                port = rest.substring(colonIndex + 1).split('?')[0].split('/')[0];
            } else {
                server = rest.split('?')[0].split('/')[0];
            }
        } else {
            const colonIndex = afterProtocol.lastIndexOf(':');
            if (colonIndex !== -1) {
                server = afterProtocol.substring(0, colonIndex);
                port = afterProtocol.substring(colonIndex + 1).split('?')[0].split('/')[0];
            } else {
                server = afterProtocol.split('?')[0].split('/')[0];
            }
        }
        const paramsMatch = raw.match(/\?(.*)/);
        let sni = '';
        if (paramsMatch) {
            const params = new URLSearchParams(paramsMatch[1]);
            sni = params.get('sni') || params.get('host') || '';
        }
        const nameParts = [];
        if (sni) nameParts.push(sni);
        else if (server) nameParts.push(server);
        if (port) nameParts.push(port);
        if (nameParts.length === 0) return protocol.toUpperCase() + '-' + Math.floor(Math.random() * 1000);
        return nameParts.join('-').substring(0, 40);
    } catch {
        return protocol.toUpperCase() + '-' + Math.floor(Math.random() * 1000);
    }
}

function copyContent(targetId: string) {
    const element = document.getElementById(targetId);
    if (!element) {
        log('❌ Target element "' + targetId + '" not found', 'error');
        return;
    }
    let text = '';
    if (element.tagName === 'TEXTAREA') {
        text = (element as HTMLTextAreaElement).value;
    } else {
        text = element.textContent || '';
    }
    navigator.clipboard.writeText(text).then(() => {
        log('📄 ' + targetId + ' copied to clipboard', 'success');
    }).catch(() => {
        log('❌ Failed to copy ' + targetId, 'error');
    });
}

function renderPinger() {
    const alive = aliveConfigs;
    const dead = deadConfigs;

    aliveCount.textContent = String(alive.length);
    deadCount.textContent = String(dead.length);
    pingerAlive.textContent = String(alive.length);
    pingerDead.textContent = String(dead.length);

    if (alive.length === 0) {
        aliveList.innerHTML = `<div class="config-item empty">No alive configs. Run ping first.</div>`;
    } else {
        aliveList.innerHTML = alive.map(c => `
            <div class="config-item">
                <div class="config-info">
                    <div class="config-name">${c.name}</div>
                    <div>
                        <span class="config-protocol">${c.protocol}</span>
                        <span class="config-latency">✅ ${c.latency}ms</span>
                    </div>
                </div>
                <div class="config-actions">
                    <button class="copy-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}" title="Copy">📄</button>
                </div>
            </div>
        `).join('');
        aliveList.querySelectorAll('.copy-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-raw');
                if (raw) {
                    navigator.clipboard.writeText(raw).then(() => {
                        log('📄 Config copied to clipboard', 'success');
                    });
                }
            });
        });
    }

    if (dead.length === 0) {
        deadList.innerHTML = `<div class="config-item empty">No dead configs.</div>`;
    } else {
        deadList.innerHTML = dead.map(c => `
            <div class="config-item">
                <div class="config-info">
                    <div class="config-name">${c.name}</div>
                    <div>
                        <span class="config-protocol">${c.protocol}</span>
                        <span class="config-latency dead">❌ Dead</span>
                    </div>
                </div>
                <div class="config-actions">
                    <button class="retry-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}" title="Retry Ping">🔄</button>
                    <button class="copy-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}" title="Copy">📄</button>
                </div>
            </div>
        `).join('');
        deadList.querySelectorAll('.retry-single-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const raw = btn.getAttribute('data-raw');
                if (raw) {
                    await pingSingleConfig(raw);
                    renderPinger();
                }
            });
        });
        deadList.querySelectorAll('.copy-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-raw');
                if (raw) {
                    navigator.clipboard.writeText(raw).then(() => {
                        log('📄 Config copied to clipboard', 'success');
                    });
                }
            });
        });
    }
}

async function pingSingleConfig(raw: string): Promise<void> {
    try {
        pingerStatus.textContent = '⏳ Pinging single config...';
        const result = await ipcRenderer.invoke('ping-single-config', raw);
        const latency = result.latency || -1;
        
        const inAlive = aliveConfigs.find(c => c.raw === raw);
        const inDead = deadConfigs.find(c => c.raw === raw);
        const inAll = allConfigs.find(c => c.raw === raw);
        
        if (inAlive) {
            inAlive.latency = latency;
            if (latency === -1) {
                aliveConfigs = aliveConfigs.filter(c => c.raw !== raw);
                if (inAll) {
                    inAll.latency = latency;
                    deadConfigs.push(inAll);
                }
            }
        } else if (inDead) {
            inDead.latency = latency;
            if (latency > 0) {
                deadConfigs = deadConfigs.filter(c => c.raw !== raw);
                if (inAll) {
                    inAll.latency = latency;
                    aliveConfigs.push(inAll);
                }
            }
        }
        
        pingerStatus.textContent = '✅ Ping completed';
        renderPinger();
    } catch (error) {
        const err = error as any;
        log('❌ Error pinging config: ' + err.message, 'error');
        pingerStatus.textContent = '❌ Error';
    }
}

async function pingAllConfigs() {
    pingAllBtn.disabled = true;
    pingerStatus.textContent = '⏳ Pinging all configs...';
    log('📡 Pinging all configs...', 'info');

    try {
        const result = await ipcRenderer.invoke('ping-all-configs', allConfigs.map(c => c.raw));
        const latencies: Record<string, number> = result.latencies || {};

        aliveConfigs = [];
        deadConfigs = [];

        for (const config of allConfigs) {
            const latency = latencies[config.raw] ?? -1;
            config.latency = latency;
            if (latency > 0) {
                aliveConfigs.push(config);
            } else {
                deadConfigs.push(config);
            }
        }

        aliveConfigs.sort((a, b) => a.latency - b.latency);

        pingerStatus.textContent = `✅ Done: ${aliveConfigs.length} alive, ${deadConfigs.length} dead`;
        log('✅ Pinger completed: ' + aliveConfigs.length + ' alive, ' + deadConfigs.length + ' dead', 'success');
        renderPinger();

    } catch (error) {
        const err = error as any;
        log('❌ Error pinging all configs: ' + err.message, 'error');
        pingerStatus.textContent = '❌ Error';
    } finally {
        pingAllBtn.disabled = false;
    }
}

async function clearDeadConfigs() {
    if (deadConfigs.length === 0) return;
    if (!confirm(`Delete ${deadConfigs.length} dead configs?`)) return;
    
    deadConfigs = [];
    allConfigs = allConfigs.filter(c => c.latency > 0);
    renderPinger();
    log('🗑️ Cleared dead configs', 'info');
}

async function retryDeadConfigs() {
    if (deadConfigs.length === 0) return;
    retryDeadBtn.disabled = true;
    pingerStatus.textContent = '⏳ Retrying dead configs...';
    log('🔄 Retrying ' + deadConfigs.length + ' dead configs...', 'info');

    try {
        const deadRaws = deadConfigs.map(c => c.raw);
        const result = await ipcRenderer.invoke('ping-all-configs', deadRaws);
        const latencies: Record<string, number> = result.latencies || {};

        const newAlive: ConfigItem[] = [];
        const stillDead: ConfigItem[] = [];

        for (const config of deadConfigs) {
            const latency = latencies[config.raw] ?? -1;
            config.latency = latency;
            if (latency > 0) {
                newAlive.push(config);
                const inAll = allConfigs.find(c => c.raw === config.raw);
                if (inAll) inAll.latency = latency;
            } else {
                stillDead.push(config);
            }
        }

        deadConfigs = stillDead;
        aliveConfigs = aliveConfigs.concat(newAlive);
        aliveConfigs.sort((a, b) => a.latency - b.latency);

        pingerStatus.textContent = `✅ Retry done: ${newAlive.length} revived, ${stillDead.length} still dead`;
        log('✅ Retry done: ' + newAlive.length + ' revived, ' + stillDead.length + ' still dead', 'success');
        renderPinger();

    } catch (error) {
        const err = error as any;
        log('❌ Error retrying dead configs: ' + err.message, 'error');
        pingerStatus.textContent = '❌ Error';
    } finally {
        retryDeadBtn.disabled = false;
    }
}

// ============================================================
//  Copy buttons
// ============================================================
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (!targetId) {
            log('❌ No target specified for copy button', 'error');
            return;
        }
        copyContent(targetId);
    });
});

// ============================================================
//  Pinger Events
// ============================================================
pingAllBtn.addEventListener('click', pingAllConfigs);
clearDeadBtn.addEventListener('click', clearDeadConfigs);
retryDeadBtn.addEventListener('click', retryDeadConfigs);

refreshResultsBtn.addEventListener('click', refreshResults);
openResultsFolderBtn.addEventListener('click', async () => {
    const dir = outputDirInput.value || './proxy_output';
    await ipcRenderer.invoke('open-output', dir);
});

// ============================================================
//  Xray Events
// ============================================================
downloadXrayBtn.addEventListener('click', downloadXray);
selectXrayBtn.addEventListener('click', selectXrayPath);

ipcRenderer.on('xray-download-progress', (event: any, data: { progress: number, status: string, error?: string }) => {
    if (data.status === 'start') {
        xrayProgressFill.style.width = '0%';
        xrayProgressText.textContent = '0%';
    } else if (data.status === 'downloading') {
        xrayProgressFill.style.width = data.progress + '%';
        xrayProgressText.textContent = data.progress + '%';
    } else if (data.status === 'done') {
        xrayProgressFill.style.width = '100%';
        xrayProgressText.textContent = '100%';
        xrayStatus.textContent = '✅ Installed';
        xrayStatus.style.color = '#3fb950';
    } else if (data.status === 'error') {
        xrayStatus.textContent = '❌ Error: ' + (data.error || 'Unknown error');
        xrayStatus.style.color = '#f85149';
    }
});

// ============================================================
//  Sync from GitHub
// ============================================================
syncRepoBtn.addEventListener('click', async () => {
    log('🔄 Syncing repositories from GitHub...', 'info');
    syncRepoBtn.disabled = true;
    syncRepoBtn.textContent = '⏳ Syncing...';
    try {
        const result = await ipcRenderer.invoke('sync-repositories');
        if (result.success) {
            log('✅ Synced ' + result.count + ' repositories from GitHub', 'success');
            await loadRepositories();
        } else {
            log('❌ Failed to sync: ' + result.error, 'error');
        }
    } catch (error) {
        const err = error as any;
        log('❌ Error syncing: ' + err.message, 'error');
    } finally {
        syncRepoBtn.disabled = false;
        syncRepoBtn.textContent = '🔄 Sync from GitHub';
    }
});

// ============================================================
//  Tray Events
// ============================================================
trayToggle.addEventListener('change', async () => {
    const enabled = trayToggle.checked;
    await ipcRenderer.invoke('toggle-tray', enabled);
    log('🖥️ System Tray ' + (enabled ? 'enabled' : 'disabled'), 'info');
    saveSettings();
});

// ============================================================
//  Update Check
// ============================================================
async function checkForUpdates(showLog: boolean = true) {
    if (checkUpdateBtn.disabled) return;
    checkUpdateBtn.disabled = true;
    checkUpdateBtn.textContent = '⏳ Checking...';
    updateInfoRow.style.display = 'flex';
    updateInfo.textContent = 'Checking for updates...';
    updateInfo.style.color = '#d29922';

    try {
        const result = await ipcRenderer.invoke('check-update', CURRENT_VERSION);
        if (result.hasUpdate) {
            updateInfo.textContent = `✅ New version v${result.latestVersion} available!`;
            updateInfo.style.color = '#3fb950';
            if (showLog) {
                log('⬆ Update available: v' + result.latestVersion + ' (Current: v' + CURRENT_VERSION + ')', 'success');
                log('📝 Changelog: ' + (result.changelog || 'No changelog provided'), 'info');
            }
            if (result.downloadUrl) {
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '📥 Download';
                downloadBtn.style.marginLeft = '8px';
                downloadBtn.style.background = '#238636';
                downloadBtn.style.color = 'white';
                downloadBtn.onclick = () => {
                    ipcRenderer.invoke('open-external', result.downloadUrl);
                };
                const existingBtn = updateInfoRow.querySelector('button');
                if (existingBtn) existingBtn.remove();
                updateInfoRow.appendChild(downloadBtn);
            }
        } else {
            updateInfo.textContent = '✅ You are using the latest version';
            updateInfo.style.color = '#3fb950';
            if (showLog) log('✅ You are using the latest version', 'success');
        }
    } catch (error: any) {
        updateInfo.textContent = '❌ Error checking updates';
        updateInfo.style.color = '#f85149';
        if (showLog) log('❌ Error checking updates: ' + error.message, 'error');
    } finally {
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = '⬆ Check Update';
    }
}

checkUpdateBtn.addEventListener('click', () => checkForUpdates(true));

// ============================================================
//  Add Repository
// ============================================================
addRepoBtn.addEventListener('click', async () => {
    const name = repoNameInput.value.trim();
    const urls = repoUrlsInput.value.split('\n').map(u => u.trim()).filter(u => u);
    
    if (!name) {
        log('❌ Repository name is required', 'error');
        return;
    }
    if (urls.length === 0) {
        log('❌ At least one URL is required', 'error');
        return;
    }
    
    const typeCheckboxes = document.querySelectorAll('.repo-type-checkbox:checked');
    const types = Array.from(typeCheckboxes).map(cb => (cb as HTMLInputElement).value);
    
    if (types.length === 0) {
        log('❌ Select at least one repository type', 'error');
        return;
    }
    
    const repoType = types.length === 1 ? types[0] : types;
    const repo = { type: repoType, files: urls };
    
    try {
        await ipcRenderer.invoke('add-repository', name, repo);
        await loadRepositories();
        log('✅ Repository "' + name + '" added successfully', 'success');
        repoNameInput.value = '';
        repoUrlsInput.value = '';
        document.querySelectorAll('.repo-type-checkbox').forEach(cb => {
            (cb as HTMLInputElement).checked = false;
        });
    } catch (error) {
        const err = error as any;
        log('❌ Error adding repository: ' + err.message, 'error');
    }
});

// ============================================================
//  Event Listeners
// ============================================================
startBtn.addEventListener('click', async () => {
    log('🚀 Starting collection...', 'info');
    setRunning(true);
    const settings = getSettings();
    const formatTypes = [];
    if (settings.txtOutput) formatTypes.push('TXT');
    if (settings.csvOutput) formatTypes.push('CSV');
    if (settings.fullJson) formatTypes.push('JSON');
    log('📁 Output: ' + settings.outputDir, 'debug');
    log('🔌 Protocols: ' + (settings.protocols.join(', ') || 'ALL'), 'debug');
    log('🔢 Ports: ' + (settings.ports.join(', ') || 'ALL'), 'debug');
    log('🏓 Ping: ' + settings.pingTimes + 'x, ⏱️ Timeout: ' + settings.timeout + 's', 'debug');
    log('📄 Formats: ' + (formatTypes.join(', ') || 'None'), 'debug');
    try {
        await ipcRenderer.invoke('start-collection', settings);
    } catch (error) {
        const err = error as any;
        log('❌ Error: ' + err.message, 'error');
        setRunning(false);
    }
});

stopBtn.addEventListener('click', async () => {
    log('⏹️ Stopping collection...', 'warning');
    try {
        await ipcRenderer.invoke('stop-collection');
        setRunning(false);
        log('⏹️ Stopped by user', 'warning');
    } catch (error) {
        const err = error as any;
        log('❌ Error stopping: ' + err.message, 'error');
    }
});

clearLogBtn.addEventListener('click', () => {
    logContent.innerHTML = '';
    log('🗑️ Log cleared', 'info');
});

refreshBtn.addEventListener('click', async () => {
    log('🔄 Refreshing repositories...', 'info');
    try {
        await ipcRenderer.invoke('load-repositories');
        await loadRepositories();
        log('✅ Repositories refreshed', 'success');
    } catch (error) {
        const err = error as any;
        log('❌ Error: ' + err.message, 'error');
    }
});

browseBtn.addEventListener('click', async () => {
    log('📂 Opening folder browser...', 'debug');
    try {
        const dir = await ipcRenderer.invoke('select-directory');
        if (dir) {
            outputDirInput.value = dir;
            log('✅ Output directory selected: ' + dir, 'success');
            saveSettings();
        }
    } catch (error) {
        const err = error as any;
        log('❌ Error: ' + err.message, 'error');
    }
});

deleteRepoBtn.addEventListener('click', async () => {
    const selected = document.querySelectorAll('.repo-select:checked');
    if (selected.length === 0) {
        log('⚠️ No repositories selected', 'warning');
        return;
    }
    const names = Array.from(selected).map(cb => (cb as HTMLInputElement).dataset.name).filter(Boolean);
    if (names.length === 0) return;
    if (!confirm('Delete ' + names.length + ' repository(s)?')) return;
    for (const name of names) {
        await ipcRenderer.invoke('remove-repository', name as string);
        log('🗑️ Repository "' + name + '" deleted', 'success');
    }
    await loadRepositories();
});

updateRepoBtn.addEventListener('click', async () => {
    log('🔄 Updating all repositories...', 'info');
    try {
        await ipcRenderer.invoke('load-repositories');
        await loadRepositories();
        log('✅ All repositories updated', 'success');
    } catch (error) {
        const err = error as any;
        log('❌ Error updating repositories: ' + err.message, 'error');
    }
});

resetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
        outputDirInput.value = DEFAULT_SETTINGS.outputDir || './proxy_output';
        portsInput.value = '';
        pingTimesInput.value = String(DEFAULT_SETTINGS.pingTimes || 1);
        timeoutInput.value = String(DEFAULT_SETTINGS.timeout || 10);
        verifyCheckbox.checked = DEFAULT_SETTINGS.verifyLiveness ?? true;
        csvCheckbox.checked = DEFAULT_SETTINGS.csvOutput ?? false;
        fullJsonCheckbox.checked = DEFAULT_SETTINGS.fullJson ?? false;
        txtOutputCheckbox.checked = DEFAULT_SETTINGS.txtOutput ?? true;
        speedTestCheckbox.checked = DEFAULT_SETTINGS.speedTest ?? true;
        trayToggle.checked = DEFAULT_SETTINGS.trayEnabled ?? true;
        themeSelect.value = DEFAULT_SETTINGS.theme || 'dark';
        document.body.className = DEFAULT_SETTINGS.theme || 'dark';
        document.querySelectorAll('#protocolsContainer input[type="checkbox"]').forEach(cb => {
            const el = cb as HTMLInputElement;
            const defaultProtocols = DEFAULT_SETTINGS.protocols || ['http', 'socks5'];
            el.checked = defaultProtocols.includes(el.value);
        });
        saveSettings();
        log('🔄 All settings reset to defaults', 'info');
    }
});

themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    document.body.className = theme;
    log('🌙 Theme changed to ' + theme, 'debug');
    saveSettings();
});

// ============================================================
//  Auto-save
// ============================================================
function setupAutoSave() {
    const elements = [
        portsInput, pingTimesInput, timeoutInput, outputDirInput,
        verifyCheckbox, csvCheckbox, fullJsonCheckbox, txtOutputCheckbox, speedTestCheckbox,
        trayToggle
    ];
    elements.forEach(el => {
        el.addEventListener('change', saveSettings);
        el.addEventListener('input', saveSettings);
    });
    document.querySelectorAll('#protocolsContainer input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', saveSettings);
    });
}
setupAutoSave();

// ============================================================
//  IPC Listeners
// ============================================================
ipcRenderer.on('collector-log', (event: any, data: {message: string, level: string}) => {
    log(data.message, data.level);
});
ipcRenderer.on('collector-progress', (event: any, data: {current: number, total: number}) => {
    updateProgress(data.current, data.total);
});
ipcRenderer.on('collector-complete', (event: any, stats: any) => {
    log('📊 Final Report:', 'info');
    const duration = stats.endTime ? ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(2) : '0';
    log('   Duration: ' + duration + 's', 'info');
    log('   Proxies: ' + stats.totalProxies, 'success');
    log('   Configs: ' + stats.totalConfigs, 'info');
    log('   Sources: ' + stats.successfulSources + '/' + stats.totalSources, 'info');
    setRunning(false);
    setTimeout(() => {
        refreshResults();
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        const resultsTab = document.querySelector('[data-tab="results"]');
        if (resultsTab) resultsTab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const targetTab = document.getElementById('tab-results');
        if (targetTab) targetTab.classList.add('active');
    }, 500);
});
ipcRenderer.on('collector-error', (event: any, error: string) => {
    log('❌ Error: ' + error, 'error');
    setRunning(false);
});
ipcRenderer.on('tray-start', () => startBtn.click());

// ============================================================
//  Initialize
// ============================================================
const settingsLoaded = loadSettings();

log('🚀 Vasler v1.0.0 ready', 'success');
log('💡 Configure settings and click Start', 'info');
if (settingsLoaded) {
    log('💾 Settings loaded successfully', 'success');
} else {
    log('💾 Using default settings', 'info');
}
progressFill.style.width = '0%';
progressText.textContent = '0%';

// نمایش نسخه فعلی
versionDisplay.textContent = 'v' + CURRENT_VERSION;

checkXrayInstalled();

// ===== Load Tray Status =====
(async function loadTrayStatus() {
    try {
        const enabled = await ipcRenderer.invoke('get-tray-status');
        trayToggle.checked = enabled;
    } catch {}
})();

setTimeout(async () => {
    try {
        await ipcRenderer.invoke('load-repositories');
        await loadRepositories();
        log('✅ Repositories loaded on startup', 'success');
        await loadConfigsForPinger();
    } catch (error) {
        const err = error as any;
        log('❌ Error loading repos: ' + err.message, 'error');
    }
}, 500);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearLogBtn.click();
    }
    if (e.key === 'Enter' && !startBtn.disabled) {
        startBtn.click();
    }
});