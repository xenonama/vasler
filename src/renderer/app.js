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
const DEFAULT_SETTINGS = {
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
    trayEnabled: true,
    showDeadConfigs: false
};

// ============================================================
//  DOM References
// ============================================================
const logContent = document.getElementById('logContent');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const copyLogBtn = document.getElementById('copyLogBtn');
const refreshBtn = document.getElementById('refreshBtn');
const browseBtn = document.getElementById('browseBtn');
const addRepoBtn = document.getElementById('addRepoBtn');
const deleteRepoBtn = document.getElementById('deleteSelectedBtn');
const updateRepoBtn = document.getElementById('updateRepoBtn');
const syncRepoBtn = document.getElementById('syncRepoBtn');
const resetBtn = document.getElementById('resetBtn');
const toggleLogBtn = document.getElementById('toggleLogBtn');
const logPanel = document.getElementById('logPanel');

const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

const portsInput = document.getElementById('ports');
const pingTimesInput = document.getElementById('pingTimes');
const timeoutInput = document.getElementById('timeout');
const outputDirInput = document.getElementById('outputDir');
const csvCheckbox = document.getElementById('csv');
const fullJsonCheckbox = document.getElementById('fullJson');
const txtOutputCheckbox = document.getElementById('txtOutput');
const repoNameInput = document.getElementById('repoNameInput');
const repoUrlsInput = document.getElementById('repoUrlsInput');
const repoTypeSelect = document.getElementById('repoTypeSelect');
const themeSelect = document.getElementById('themeSelect');
const verifyCheckbox = document.getElementById('verify');
const speedTestCheckbox = document.getElementById('speedTest');
const repoList = document.getElementById('repoList');

const trayToggle = document.getElementById('trayToggle');
const showDeadCheckbox = document.getElementById('showDeadConfigs');
const logFilter = document.getElementById('logFilter');
const syncStatus = document.getElementById('syncStatus');

// ===== Version & Update =====
const versionDisplay = document.getElementById('versionDisplay');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const updateInfoRow = document.getElementById('updateInfoRow');
const updateInfo = document.getElementById('updateInfo');

// ===== Results Elements =====
const resultsSummary = document.getElementById('resultsSummary');
const refreshResultsBtn = document.getElementById('refreshResultsBtn');
const openResultsFolderBtn = document.getElementById('openResultsFolderBtn');

const vlessList = document.getElementById('vlessList');
const vlessCount = document.getElementById('vlessCount');
const vmessList = document.getElementById('vmessList');
const vmessCount = document.getElementById('vmessCount');
const trojanList = document.getElementById('trojanList');
const trojanCount = document.getElementById('trojanCount');
const ssList = document.getElementById('ssList');
const ssCount = document.getElementById('ssCount');
const otherConfigsList = document.getElementById('otherConfigsList');
const otherConfigsCount = document.getElementById('otherConfigsCount');
const httpList = document.getElementById('httpList');
const httpCount = document.getElementById('httpCount');
const mtprotoList = document.getElementById('mtprotoList');
const mtprotoCount = document.getElementById('mtprotoCount');

// ===== Pinger Elements =====
const pingAllBtn = document.getElementById('pingAllBtn');
const deepScanBtn = document.getElementById('deepScanBtn');
const clearDeadBtn = document.getElementById('clearDeadBtn');
const retryDeadBtn = document.getElementById('retryDeadBtn');
const reviveDeadBtn = document.getElementById('reviveDeadBtn');
const pingerStatus = document.getElementById('pingerStatus');
const pingerTotal = document.getElementById('pingerTotal');
const pingerAlive = document.getElementById('pingerAlive');
const pingerDead = document.getElementById('pingerDead');
const aliveCount = document.getElementById('aliveCount');
const deadCount = document.getElementById('deadCount');
const aliveList = document.getElementById('aliveList');
const deadList = document.getElementById('deadList');
const deadSection = document.getElementById('deadSection');

// ===== Xray Elements =====
const downloadXrayBtn = document.getElementById('downloadXrayBtn');
const selectXrayBtn = document.getElementById('selectXrayBtn');
const xrayStatus = document.getElementById('xrayStatus');
const xrayProgressRow = document.getElementById('xrayProgressRow');
const xrayProgressFill = document.getElementById('xrayProgressFill');
const xrayProgressText = document.getElementById('xrayProgressText');

// ===== New Repository Buttons =====
const enableAllBtn = document.getElementById('enableAllBtn');
const disableAllBtn = document.getElementById('disableAllBtn');
const autoSyncBtn = document.getElementById('autoSyncToggle');

// ===== Status Panel Elements =====
const statusIcon = document.getElementById('statusIcon');
const statusMessage = document.getElementById('statusMessage');
const statusRepo = document.getElementById('statusRepo');
const statusProxies = document.getElementById('statusProxies');
const statusConfigs = document.getElementById('statusConfigs');
const progressDetail = document.getElementById('progressDetail');
const collectionStatus = document.getElementById('collectionStatus');

const CURRENT_VERSION = '1.0.0';
let isRunning = false;
let logExpanded = false;
let repositories = {};
let showDeadConfigs = false;
let repositoryStatus = {};
let autoSyncEnabled = false;

// ===== State for Pinger =====
let aliveConfigs = [];
let deadConfigs = [];
let allConfigs = [];

// ===== More Button State =====
let configLoadCounts = {
    vless: 100,
    vmess: 100,
    trojan: 100,
    shadowsocks: 100,
    other: 100,
    http: 100,
    mtproto: 100
};

// ============================================================
//  Logging
// ============================================================
function log(message, level = 'info', source = '') {
    const colors = {
        info: '#58a6ff',
        success: '#3fb950',
        error: '#f85149',
        warning: '#d29922',
        debug: '#8b949e'
    };
    
    const icons = {
        info: '📌',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        debug: '🔍'
    };
    
    const timestamp = new Date().toLocaleTimeString();
    const color = colors[level] || '#8b949e';
    const icon = icons[level] || '📌';
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry level-${level}`;
    logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-level">${icon} ${level.toUpperCase()}</span>
        <span class="log-message">${message}</span>
        ${source ? `<span class="log-source">${source}</span>` : ''}
    `;
    
    const currentFilter = logFilter ? logFilter.value || 'all' : 'all';
    if (currentFilter !== 'all' && currentFilter !== level) {
        logEntry.style.display = 'none';
    }
    
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// ============================================================
//  Settings Management
// ============================================================
function getSettings() {
    const protocolCheckboxes = document.querySelectorAll('#protocolsContainer input[type="checkbox"]');
    const protocols = Array.from(protocolCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    return {
        outputDir: outputDirInput.value || './proxy_output',
        ports: portsInput.value ? portsInput.value.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p)) : [],
        pingTimes: parseInt(pingTimesInput.value) || 1,
        timeout: parseInt(timeoutInput.value) || 10,
        verifyLiveness: verifyCheckbox.checked,
        csvOutput: csvCheckbox.checked,
        fullJson: fullJsonCheckbox.checked,
        txtOutput: txtOutputCheckbox.checked,
        speedTest: speedTestCheckbox.checked,
        protocols,
        theme: themeSelect.value,
        killSwitch: false,
        trayEnabled: trayToggle.checked,
        showDeadConfigs: showDeadCheckbox.checked
    };
}

function saveSettings() {
    try {
        const settings = getSettings();
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
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
            applySettings(DEFAULT_SETTINGS);
            saveSettings();
            return true;
        }
    } catch (error) {
        applySettings(DEFAULT_SETTINGS);
        return false;
    }
}

function applySettings(settings) {
    if (settings.outputDir) outputDirInput.value = settings.outputDir;
    if (settings.ports !== undefined) portsInput.value = settings.ports.join(',');
    if (settings.pingTimes) pingTimesInput.value = settings.pingTimes;
    if (settings.timeout) timeoutInput.value = settings.timeout;
    
    verifyCheckbox.checked = settings.verifyLiveness !== undefined ? settings.verifyLiveness : true;
    csvCheckbox.checked = settings.csvOutput || false;
    fullJsonCheckbox.checked = settings.fullJson || false;
    txtOutputCheckbox.checked = settings.txtOutput !== undefined ? settings.txtOutput : true;
    speedTestCheckbox.checked = settings.speedTest !== undefined ? settings.speedTest : true;
    
    if (settings.trayEnabled !== undefined) {
        trayToggle.checked = settings.trayEnabled;
    }
    if (settings.showDeadConfigs !== undefined) {
        showDeadCheckbox.checked = settings.showDeadConfigs;
        showDeadConfigs = settings.showDeadConfigs;
    }
    
    if (settings.theme) {
        themeSelect.value = settings.theme;
        document.body.className = settings.theme;
        console.log('🎨 Theme applied from settings:', settings.theme);
    }
    
    if (settings.protocols) {
        document.querySelectorAll('#protocolsContainer input[type="checkbox"]').forEach(cb => {
            cb.checked = settings.protocols.includes(cb.value);
        });
    }
}

function setRunning(state) {
    isRunning = state;
    startBtn.disabled = state;
    stopBtn.disabled = !state;
}

// ============================================================
//  Theme Management
// ============================================================
themeSelect.addEventListener('change', function() {
    const theme = this.value;
    document.body.className = theme;
    console.log('🎨 Theme changed to:', theme);
    log('🌙 Theme changed to ' + theme, 'debug');
    saveSettings();
});

// ============================================================
//  Update Status
// ============================================================
function updateStatus(data) {
    if (!data) return;
    
    if (data.message) {
        statusMessage.textContent = data.message;
    }
    
    // ===== پیشرفت (حتی اگر total 0 باشه) =====
    if (data.current !== undefined && data.total !== undefined) {
        // اگر total 0 باشه، درصد رو 0 بذار
        const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
        progressDetail.textContent = `📊 ${data.current} / ${data.total} repositories`;
    }
    
    if (data.proxiesFound !== undefined) {
        statusProxies.textContent = `🌐 Proxies: ${data.proxiesFound}`;
    }
    
    if (data.configsFound !== undefined) {
        statusConfigs.textContent = `📋 Configs: ${data.configsFound}`;
    }
    
    if (data.currentRepo) {
        statusRepo.textContent = `📁 Repository: ${data.currentRepo}`;
    }
    
    // وضعیت
    if (data.status === 'collecting' || data.status === 'downloading' || data.status === 'processing') {
        collectionStatus.textContent = '⏳ Collecting...';
        collectionStatus.className = 'collecting';
        statusIcon.textContent = '⏳';
    } else if (data.status === 'done') {
        collectionStatus.textContent = '✅ Done';
        collectionStatus.className = 'done';
        statusIcon.textContent = '✅';
    } else if (data.status === 'error') {
        collectionStatus.textContent = '❌ Error';
        collectionStatus.className = 'error';
        statusIcon.textContent = '❌';
    } else {
        collectionStatus.textContent = '⏸️ Idle';
        collectionStatus.className = '';
        statusIcon.textContent = '⏸️';
    }
}

// ============================================================
//  Tab Switching
// ============================================================
document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const tabName = item.dataset.tab;
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

ipcRenderer.on('switch-tab', (event, tabName) => {
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

clearLogBtn.addEventListener('click', () => {
    logContent.innerHTML = '';
});

copyLogBtn.addEventListener('click', () => {
    const entries = document.querySelectorAll('.log-entry .log-message');
    const text = Array.from(entries).map(el => el.textContent).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
});

if (logFilter) {
    logFilter.addEventListener('change', function() {
        const filter = this.value;
        document.querySelectorAll('.log-entry').forEach(entry => {
            if (filter === 'all') {
                entry.style.display = '';
            } else {
                entry.style.display = entry.classList.contains(`level-${filter}`) ? '' : 'none';
            }
        });
    });
}

// ============================================================
//  Title Bar
// ============================================================
minimizeBtn.addEventListener('click', () => ipcRenderer.invoke('minimize-window'));
maximizeBtn.addEventListener('click', () => ipcRenderer.invoke('maximize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.invoke('close-window'));

// ============================================================
//  Auto-Sync
// ============================================================
if (autoSyncBtn) {
    autoSyncBtn.addEventListener('click', function() {
        autoSyncEnabled = !autoSyncEnabled;
        this.textContent = autoSyncEnabled ? '🔁 Auto-sync: ON' : '🔁 Auto-sync: OFF';
        this.style.background = autoSyncEnabled ? '#238636' : '#21262d';
        
        if (autoSyncEnabled) {
            log('🔄 Auto-sync enabled', 'info');
            if (window.autoSyncInterval) {
                clearInterval(window.autoSyncInterval);
            }
            window.autoSyncInterval = setInterval(() => {
                if (autoSyncEnabled) {
                    syncRepositories();
                }
            }, 300000);
        } else {
            log('⏹️ Auto-sync disabled', 'info');
            if (window.autoSyncInterval) {
                clearInterval(window.autoSyncInterval);
                window.autoSyncInterval = null;
            }
        }
    });
}

// ============================================================
//  Repository Status (ذخیره و بازیابی)
// ============================================================
async function loadRepositoryStatus() {
    try {
        const status = await ipcRenderer.invoke('get-repositories-status');
        repositoryStatus = status || {};
        console.log('📂 Loaded repository status:', repositoryStatus);
    } catch (error) {
        console.error('Error loading repository status:', error);
        repositoryStatus = {};
    }
}

async function saveRepositoryStatus() {
    try {
        await ipcRenderer.invoke('save-repositories-status', repositoryStatus);
        console.log('💾 Saved repository status:', repositoryStatus);
    } catch (error) {
        console.error('Error saving repository status:', error);
    }
}

// ============================================================
//  Repository Management
// ============================================================
async function loadRepositories() {
    try {
        const repos = await ipcRenderer.invoke('get-repositories');
        repositories = repos || {};
        console.log('📂 Loaded repositories:', Object.keys(repositories).length);
        
        for (const name of Object.keys(repositories)) {
            if (repositoryStatus[name] === undefined) {
                repositoryStatus[name] = true;
            }
        }
        
        renderRepoList();
    } catch (error) {
        log('❌ Error loading repos: ' + error.message, 'error');
        console.error('Error loading repos:', error);
    }
}

function renderRepoList() {
    repoList.innerHTML = '';
    const entries = Object.entries(repositories);
    
    if (entries.length === 0) {
        repoList.innerHTML = '<div class="repo-item" style="color:#8b949e;padding:12px;">No repositories found. Click "Sync Now" to add some.</div>';
        return;
    }
    
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    
    entries.forEach(([name, repo]) => {
        if (!repo || typeof repo !== 'object') {
            console.warn('Invalid repo:', name, repo);
            return;
        }
        
        const types = Array.isArray(repo.type) ? repo.type.join(', ') : (repo.type || 'unknown');
        const files = repo.files || [];
        const isEnabled = repositoryStatus[name] !== false;
        
        const div = document.createElement('div');
        div.className = 'repo-item';
        div.innerHTML = `
            <input type="checkbox" class="repo-select" data-name="${name}" ${isEnabled ? 'checked' : ''}>
            <div class="repo-info">
                <div>
                    <span class="repo-name">${name}</span>
                    <span class="repo-type">[${types}]</span>
                    ${isEnabled ? '<span class="repo-badge enabled">✅ Active</span>' : '<span class="repo-badge disabled">⛔ Disabled</span>'}
                </div>
                <div class="repo-urls">${files.map(url => `<span>${url.split('/').pop()}</span>`).join('')}</div>
            </div>
            <div class="repo-actions">
                <button class="toggle-repo-btn" data-name="${name}" title="${isEnabled ? 'Disable' : 'Enable'}">
                    ${isEnabled ? '⏸️' : '▶️'}
                </button>
                <button class="delete-btn" data-name="${name}" title="Delete">🗑️</button>
            </div>
        `;
        repoList.appendChild(div);
        
        // دکمه حذف
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = deleteBtn.dataset.name;
            if (name && confirm(`Delete repository "${name}"?`)) {
                try {
                    await ipcRenderer.invoke('remove-repository', name);
                    delete repositoryStatus[name];
                    await saveRepositoryStatus();
                    await loadRepositories();
                    log('🗑️ Repository "' + name + '" deleted', 'success');
                } catch (error) {
                    log('❌ Error deleting repository: ' + error.message, 'error');
                }
            }
        });
        
        // دکمه فعال/غیرفعال
        const toggleBtn = div.querySelector('.toggle-repo-btn');
        toggleBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = toggleBtn.dataset.name;
            if (name) {
                repositoryStatus[name] = !repositoryStatus[name];
                await saveRepositoryStatus();
                renderRepoList();
                log(`🔄 Repository "${name}" ${repositoryStatus[name] ? 'enabled' : 'disabled'}`, 'info');
            }
        });
        
        // چک‌باکس
        const checkbox = div.querySelector('.repo-select');
        checkbox.addEventListener('change', async (e) => {
            e.stopPropagation();
            const name = checkbox.dataset.name;
            if (name) {
                repositoryStatus[name] = checkbox.checked;
                await saveRepositoryStatus();
                const badge = div.querySelector('.repo-badge');
                if (badge) {
                    if (checkbox.checked) {
                        badge.className = 'repo-badge enabled';
                        badge.textContent = '✅ Active';
                    } else {
                        badge.className = 'repo-badge disabled';
                        badge.textContent = '⛔ Disabled';
                    }
                }
                const toggleBtnInner = div.querySelector('.toggle-repo-btn');
                if (toggleBtnInner) {
                    toggleBtnInner.textContent = checkbox.checked ? '⏸️' : '▶️';
                }
            }
        });
    });
}

// ============================================================
//  Enable All / Disable All
// ============================================================
enableAllBtn.addEventListener('click', async () => {
    try {
        document.querySelectorAll('.repo-select').forEach(cb => {
            cb.checked = true;
            const name = cb.dataset.name;
            if (name) repositoryStatus[name] = true;
        });
        await saveRepositoryStatus();
        renderRepoList();
        log('✅ All repositories enabled', 'success');
    } catch (error) {
        log('❌ Error enabling all: ' + error.message, 'error');
    }
});

disableAllBtn.addEventListener('click', async () => {
    try {
        document.querySelectorAll('.repo-select').forEach(cb => {
            cb.checked = false;
            const name = cb.dataset.name;
            if (name) repositoryStatus[name] = false;
        });
        await saveRepositoryStatus();
        renderRepoList();
        log('❌ All repositories disabled', 'warning');
    } catch (error) {
        log('❌ Error disabling all: ' + error.message, 'error');
    }
});

// ============================================================
//  Delete Selected
// ============================================================
deleteRepoBtn.addEventListener('click', async () => {
    try {
        const selected = document.querySelectorAll('.repo-select:checked');
        if (selected.length === 0) {
            log('⚠️ No repositories selected', 'warning');
            return;
        }
        
        const names = Array.from(selected).map(cb => cb.dataset.name).filter(Boolean);
        if (names.length === 0) return;
        
        if (!confirm(`Delete ${names.length} repository(s)?`)) return;
        
        let deleted = 0;
        for (const name of names) {
            try {
                await ipcRenderer.invoke('remove-repository', name);
                delete repositoryStatus[name];
                deleted++;
            } catch (error) {
                log('❌ Error deleting "' + name + '": ' + error.message, 'error');
            }
        }
        
        await saveRepositoryStatus();
        await loadRepositories();
        log('🗑️ Deleted ' + deleted + ' repository(s)', 'success');
    } catch (error) {
        log('❌ Error deleting repositories: ' + error.message, 'error');
    }
});

// ============================================================
//  Sync Repositories
// ============================================================
async function syncRepositories() {
    log('🔄 Syncing repositories from GitHub...', 'info');
    syncRepoBtn.disabled = true;
    syncRepoBtn.textContent = '⏳ Syncing...';
    try {
        const result = await ipcRenderer.invoke('sync-repositories');
        if (result.success) {
            log('✅ Synced ' + result.count + ' repositories from GitHub', 'success');
            
            const repos = await ipcRenderer.invoke('get-repositories');
            repositories = repos || {};
            
            for (const name of Object.keys(repositories)) {
                if (repositoryStatus[name] === undefined) {
                    repositoryStatus[name] = true;
                }
            }
            
            await saveRepositoryStatus();
            renderRepoList();
            await refreshResults();
            syncStatus.textContent = `🔄 Last sync: ${new Date().toLocaleString()}`;
        } else {
            log('❌ Failed to sync: ' + result.error, 'error');
        }
    } catch (error) {
        log('❌ Error syncing: ' + error.message, 'error');
    } finally {
        syncRepoBtn.disabled = false;
        syncRepoBtn.textContent = '🔄 Sync Now';
    }
}

syncRepoBtn.addEventListener('click', syncRepositories);

// ============================================================
//  Refresh Repository List (Reload)
// ============================================================

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

        const LIMIT = 100;
        
        configLoadCounts = {
            vless: 100,
            vmess: 100,
            trojan: 100,
            shadowsocks: 100,
            other: 100,
            http: 100,
            mtproto: 100
        };
        
        const vlessConfigs = await ipcRenderer.invoke('get-configs-by-type', 'vless', LIMIT);
        vlessList.value = vlessConfigs.join('\n');
        vlessCount.textContent = String(vlessConfigs.length);
        const vlessMoreBtn = document.querySelector('.more-btn[data-type="vless"]');
        if (vlessMoreBtn) vlessMoreBtn.textContent = `More (${vlessConfigs.length})`;

        const vmessConfigs = await ipcRenderer.invoke('get-configs-by-type', 'vmess', LIMIT);
        vmessList.value = vmessConfigs.join('\n');
        vmessCount.textContent = String(vmessConfigs.length);
        const vmessMoreBtn = document.querySelector('.more-btn[data-type="vmess"]');
        if (vmessMoreBtn) vmessMoreBtn.textContent = `More (${vmessConfigs.length})`;

        const trojanConfigs = await ipcRenderer.invoke('get-configs-by-type', 'trojan', LIMIT);
        trojanList.value = trojanConfigs.join('\n');
        trojanCount.textContent = String(trojanConfigs.length);
        const trojanMoreBtn = document.querySelector('.more-btn[data-type="trojan"]');
        if (trojanMoreBtn) trojanMoreBtn.textContent = `More (${trojanConfigs.length})`;

        const ssConfigs = await ipcRenderer.invoke('get-configs-by-type', 'shadowsocks', LIMIT);
        ssList.value = ssConfigs.join('\n');
        ssCount.textContent = String(ssConfigs.length);
        const ssMoreBtn = document.querySelector('.more-btn[data-type="shadowsocks"]');
        if (ssMoreBtn) ssMoreBtn.textContent = `More (${ssConfigs.length})`;

        const otherProtocols = ['ssr', 'socks', 'http'];
        let otherConfigs = [];
        for (const proto of otherProtocols) {
            const configs = await ipcRenderer.invoke('get-configs-by-type', proto, LIMIT);
            otherConfigs = otherConfigs.concat(configs);
        }
        otherConfigsList.value = otherConfigs.join('\n');
        otherConfigsCount.textContent = String(otherConfigs.length);
        const otherMoreBtn = document.querySelector('.more-btn[data-type="other"]');
        if (otherMoreBtn) otherMoreBtn.textContent = `More (${otherConfigs.length})`;

        const httpProxies = await ipcRenderer.invoke('get-proxies', 'http', LIMIT);
        httpList.value = httpProxies.join('\n');
        httpCount.textContent = String(httpProxies.length);
        const httpMoreBtn = document.querySelector('.more-btn[data-type="http"]');
        if (httpMoreBtn) httpMoreBtn.textContent = `More (${httpProxies.length})`;

        const mtprotoProxies = await ipcRenderer.invoke('get-proxies', 'mtproto', LIMIT);
        mtprotoList.value = mtprotoProxies.join('\n');
        mtprotoCount.textContent = String(mtprotoProxies.length);
        const mtprotoMoreBtn = document.querySelector('.more-btn[data-type="mtproto"]');
        if (mtprotoMoreBtn) mtprotoMoreBtn.textContent = `More (${mtprotoProxies.length})`;

        await loadConfigsForPinger();

    } catch (error) {
        log('❌ Error refreshing results: ' + error.message, 'error');
    }
}

// ============================================================
//  More Button - Load More Configs/Proxies
// ============================================================
document.querySelectorAll('.more-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const type = btn.getAttribute('data-type');
        const targetId = btn.getAttribute('data-target');
        const textarea = document.getElementById(targetId);
        
        if (!type || !textarea) return;
        
        const currentCount = configLoadCounts[type] || 100;
        const newLimit = currentCount + 100;
        configLoadCounts[type] = newLimit;
        
        try {
            let configs = [];
            if (type === 'http' || type === 'mtproto') {
                configs = await ipcRenderer.invoke('get-proxies', type, newLimit);
            } else {
                configs = await ipcRenderer.invoke('get-configs-by-type', type, newLimit);
            }
            
            textarea.value = configs.join('\n');
            
            const countEl = document.getElementById(`${type}Count`);
            if (countEl) {
                countEl.textContent = String(configs.length);
            }
            
            const totalCount = configs.length;
            btn.textContent = `More (${totalCount})`;
            
            if (configs.length < newLimit) {
                btn.textContent = `✅ All (${totalCount})`;
                btn.disabled = true;
                btn.style.opacity = '0.5';
            }
            
            log(`📄 Loaded ${configs.length} ${type} configs/proxies`, 'info');
            
        } catch (error) {
            log('❌ Error loading more: ' + error.message, 'error');
        }
    });
});

// ============================================================
//  Pinger Management
// ============================================================
async function loadConfigsForPinger() {
    try {
        const protocols = ['vless', 'vmess', 'trojan', 'shadowsocks', 'ssr', 'socks', 'http'];
        let all = [];
        const LIMIT = 20000;
        for (const proto of protocols) {
            const configs = await ipcRenderer.invoke('get-configs-by-type', proto, LIMIT);
            for (const raw of configs) {
                all.push({ raw, protocol: proto, name: generateConfigName(raw, proto), latency: -1 });
            }
        }
        allConfigs = all;
        pingerTotal.textContent = String(all.length);
        renderPinger();
    } catch (error) {
        log('❌ Error loading configs for pinger: ' + error.message, 'error');
    }
}

function generateConfigName(raw, protocol) {
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

function renderPinger() {
    const alive = aliveConfigs;
    const dead = deadConfigs;

    aliveCount.textContent = String(alive.length);
    deadCount.textContent = String(dead.length);
    pingerAlive.textContent = String(alive.length);
    pingerDead.textContent = String(dead.length);

    reviveDeadBtn.disabled = dead.length === 0;

    if (dead.length === 0) {
        deadSection.style.display = 'none';
    } else if (showDeadConfigs) {
        deadSection.style.display = 'block';
    } else {
        deadSection.style.display = 'none';
    }

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
                    <button class="copy-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}">📄</button>
                </div>
            </div>
        `).join('');
        
        aliveList.querySelectorAll('.copy-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-raw');
                if (raw) {
                    navigator.clipboard.writeText(raw).then(() => {
                        log('📄 Config copied to clipboard', 'success');
                    }).catch(() => {
                        const temp = document.createElement('textarea');
                        temp.value = raw;
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand('copy');
                        temp.remove();
                        log('📄 Config copied to clipboard', 'success');
                    });
                }
            });
        });
    }

    if (showDeadConfigs && dead.length > 0) {
        deadSection.style.display = 'block';
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
                    <button class="retry-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}">🔄</button>
                    <button class="copy-single-btn" data-raw="${c.raw.replace(/"/g, '&quot;')}">📄</button>
                </div>
            </div>
        `).join('');
        
        deadList.querySelectorAll('.retry-single-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const raw = btn.getAttribute('data-raw');
                if (raw) {
                    await pingSingleConfig(raw, false);
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
                    }).catch(() => {
                        const temp = document.createElement('textarea');
                        temp.value = raw;
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand('copy');
                        temp.remove();
                        log('📄 Config copied to clipboard', 'success');
                    });
                }
            });
        });
    } else {
        deadSection.style.display = 'none';
    }
}

async function pingSingleConfig(raw, deep = false) {
    try {
        pingerStatus.textContent = '⏳ Pinging single config...';
        const result = await ipcRenderer.invoke(deep ? 'ping-single-config-deep' : 'ping-single-config', raw);
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
        log('❌ Error pinging config: ' + error.message, 'error');
        pingerStatus.textContent = '❌ Error';
    }
}

// ============================================================
//  Pinger Events
// ============================================================
async function runPing(handler, statusMessage) {
    pingAllBtn.disabled = true;
    deepScanBtn.disabled = true;
    pingerStatus.textContent = statusMessage;
    log(statusMessage, 'info');

    try {
        const result = await ipcRenderer.invoke(handler, allConfigs.map(c => c.raw));
        const latencies = result.latencies || {};

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
        log('❌ Error pinging: ' + error.message, 'error');
        pingerStatus.textContent = '❌ Error';
    } finally {
        pingAllBtn.disabled = false;
        deepScanBtn.disabled = false;
    }
}

pingAllBtn.addEventListener('click', () => runPing('ping-all-configs', '📡 Pinging all configs...'));
deepScanBtn.addEventListener('click', () => runPing('deep-scan-configs', '🔥 Deep Scan...'));

clearDeadBtn.addEventListener('click', () => {
    if (deadConfigs.length === 0) return;
    if (!confirm(`Delete ${deadConfigs.length} dead configs?`)) return;
    deadConfigs = [];
    allConfigs = allConfigs.filter(c => c.latency > 0);
    renderPinger();
    log('🗑️ Cleared dead configs', 'info');
});

retryDeadBtn.addEventListener('click', async () => {
    if (deadConfigs.length === 0) return;
    retryDeadBtn.disabled = true;
    pingerStatus.textContent = '⏳ Retrying dead configs...';
    log('🔄 Retrying ' + deadConfigs.length + ' dead configs...', 'info');

    try {
        const deadRaws = deadConfigs.map(c => c.raw);
        const result = await ipcRenderer.invoke('ping-all-configs', deadRaws);
        const latencies = result.latencies || {};

        const newAlive = [];
        const stillDead = [];

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
        log('❌ Error retrying dead configs: ' + error.message, 'error');
        pingerStatus.textContent = '❌ Error';
    } finally {
        retryDeadBtn.disabled = false;
    }
});

reviveDeadBtn.addEventListener('click', async () => {
    if (deadConfigs.length === 0) {
        log('⚠️ No dead configs to revive', 'warning');
        return;
    }
    reviveDeadBtn.disabled = true;
    reviveDeadBtn.textContent = '⏳ Reviving...';
    pingerStatus.textContent = '⏳ Trying to revive dead configs...';
    log('🔄 Trying to revive ' + deadConfigs.length + ' dead configs...', 'info');

    try {
        const deadRaws = deadConfigs.map(c => c.raw);
        const result = await ipcRenderer.invoke('deep-scan-configs', deadRaws);
        const latencies = result.latencies || {};

        const revived = [];
        const stillDead = [];

        for (const config of deadConfigs) {
            const latency = latencies[config.raw] ?? -1;
            config.latency = latency;
            if (latency > 0) {
                revived.push(config);
                const inAll = allConfigs.find(c => c.raw === config.raw);
                if (inAll) inAll.latency = latency;
            } else {
                stillDead.push(config);
            }
        }

        deadConfigs = stillDead;
        aliveConfigs = aliveConfigs.concat(revived);
        aliveConfigs.sort((a, b) => a.latency - b.latency);

        pingerStatus.textContent = `✅ Revived: ${revived.length}, Still dead: ${stillDead.length}`;
        log('✅ Revived ' + revived.length + ' configs, ' + stillDead.length + ' still dead', 'success');
        
        if (deadConfigs.length === 0) {
            deadSection.style.display = 'none';
        }
        
        renderPinger();

    } catch (error) {
        log('❌ Error reviving dead configs: ' + error.message, 'error');
        pingerStatus.textContent = '❌ Error';
    } finally {
        reviveDeadBtn.disabled = false;
        reviveDeadBtn.textContent = '🔄 Revive Dead';
    }
});

refreshResultsBtn.addEventListener('click', refreshResults);

openResultsFolderBtn.addEventListener('click', async () => {
    const dir = outputDirInput.value || './proxy_output';
    await ipcRenderer.invoke('open-output', dir);
});

// ============================================================
//  Xray Events
// ============================================================
async function checkXrayInstalled() {
    try {
        const xrayPath = await ipcRenderer.invoke('get-xray-path');
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

downloadXrayBtn.addEventListener('click', async () => {
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
            await ipcRenderer.invoke('set-xray-path', result.path);
            xrayStatus.textContent = '✅ Installed';
            xrayStatus.style.color = '#3fb950';
            log('✅ Xray core installed successfully', 'success');
        } else {
            xrayStatus.textContent = '❌ Error: ' + result.error;
            xrayStatus.style.color = '#f85149';
            log('❌ Error downloading Xray: ' + result.error, 'error');
        }
    } catch (error) {
        xrayStatus.textContent = '❌ Error';
        xrayStatus.style.color = '#f85149';
        log('❌ Error downloading Xray: ' + error.message, 'error');
    } finally {
        downloadXrayBtn.disabled = false;
        setTimeout(() => {
            xrayProgressRow.style.display = 'none';
        }, 3000);
    }
});

selectXrayBtn.addEventListener('click', async () => {
    try {
        const result = await ipcRenderer.invoke('select-xray-file');
        if (result) {
            await ipcRenderer.invoke('set-xray-path', result);
            await checkXrayInstalled();
            log('✅ Xray path selected: ' + result, 'success');
        }
    } catch (error) {
        log('❌ Error selecting Xray: ' + error.message, 'error');
    }
});

ipcRenderer.on('xray-download-progress', (event, data) => {
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
//  Tray Events
// ============================================================
trayToggle.addEventListener('change', async () => {
    const enabled = trayToggle.checked;
    await ipcRenderer.invoke('toggle-tray', enabled);
    log('🖥️ System Tray ' + (enabled ? 'enabled' : 'disabled'), 'info');
    saveSettings();
});

showDeadCheckbox.addEventListener('change', () => {
    showDeadConfigs = showDeadCheckbox.checked;
    renderPinger();
    saveSettings();
});

// ============================================================
//  Update Check
// ============================================================
async function checkForUpdates(showLog = true) {
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
                log('⬆ Update available: v' + result.latestVersion, 'success');
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
                updateInfoRow.appendChild(downloadBtn);
            }
        } else {
            updateInfo.textContent = '✅ You are using the latest version';
            updateInfo.style.color = '#3fb950';
            if (showLog) log('✅ You are using the latest version', 'success');
        }
    } catch (error) {
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
    const type = repoTypeSelect.value;
    
    if (!name) {
        log('❌ Repository name is required', 'error');
        return;
    }
    if (urls.length === 0) {
        log('❌ At least one URL is required', 'error');
        return;
    }
    
    const repo = { type: type, files: urls };
    
    try {
        await ipcRenderer.invoke('add-repository', name, repo);
        await loadRepositories();
        log('✅ Repository "' + name + '" added successfully', 'success');
        repoNameInput.value = '';
        repoUrlsInput.value = '';
    } catch (error) {
        log('❌ Error adding repository: ' + error.message, 'error');
    }
});

// ============================================================
//  IPC Events from Main
// ============================================================
ipcRenderer.on('collector-log', (event, data) => {
    log(data.message, data.level || 'info');
});

ipcRenderer.on('collector-progress', (event, data) => {
    console.log('📊 Progress received:', data);
    if (data && data.current !== undefined && data.total !== undefined) {
        updateStatus({
            current: data.current,
            total: data.total,
            message: data.message || `📥 Processing...`,
            status: 'processing'
        });
    }
});

ipcRenderer.on('collector-status', (event, data) => {
    if (typeof data === 'string') {
        updateStatus({ 
            message: data, 
            status: data.includes('✅') ? 'done' : 'collecting' 
        });
    } else if (data && typeof data === 'object') {
        updateStatus(data);
    }
});

ipcRenderer.on('collector-complete', (event, stats) => {
    if (stats) {
        updateStatus({
            message: `✅ Done! ${stats.totalProxies} proxies, ${stats.totalConfigs} configs`,
            proxiesFound: stats.totalProxies,
            configsFound: stats.totalConfigs,
            status: 'done'
        });
        setRunning(false);
        refreshResults();
    }
});

ipcRenderer.on('collector-error', (event, error) => {
    if (error) {
        updateStatus({
            message: `❌ Error: ${error.message || error}`,
            status: 'error'
        });
        setRunning(false);
    }
});

ipcRenderer.on('tray-start', () => {
    startBtn.click();
});

ipcRenderer.on('repositories-loaded', (event, repos) => {
    repositories = repos;
    renderRepoList();
    log('📂 Loaded ' + Object.keys(repos).length + ' repositories', 'success');
});

ipcRenderer.on('new-repositories-available', (event, data) => {
    log('📢 ' + data.count + ' new repositories available! Click "Sync Now" to add them.', 'success');
});

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

function copyContent(targetId) {
    if (targetId === 'aliveList') {
        const rawConfigs = aliveConfigs.map(c => c.raw).join('\n');
        if (!rawConfigs) {
            log('⚠️ No alive configs to copy', 'warning');
            return;
        }
        navigator.clipboard.writeText(rawConfigs).then(() => {
            log('📄 All alive configs copied to clipboard', 'success');
        }).catch(() => {
            const temp = document.createElement('textarea');
            temp.value = rawConfigs;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            temp.remove();
            log('📄 All alive configs copied to clipboard (fallback)', 'success');
        });
        return;
    }

    if (targetId === 'deadList') {
        const rawConfigs = deadConfigs.map(c => c.raw).join('\n');
        if (!rawConfigs) {
            log('⚠️ No dead configs to copy', 'warning');
            return;
        }
        navigator.clipboard.writeText(rawConfigs).then(() => {
            log('📄 All dead configs copied to clipboard', 'success');
        }).catch(() => {
            const temp = document.createElement('textarea');
            temp.value = rawConfigs;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            temp.remove();
            log('📄 All dead configs copied to clipboard (fallback)', 'success');
        });
        return;
    }

    const element = document.getElementById(targetId);
    if (!element) {
        log('❌ Target element "' + targetId + '" not found', 'error');
        return;
    }
    let text = '';
    if (element.tagName === 'TEXTAREA') {
        text = element.value;
    } else {
        text = element.textContent || '';
    }
    if (!text) {
        log('⚠️ No content to copy', 'warning');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        log('📄 ' + targetId + ' copied to clipboard', 'success');
    }).catch(() => {
        try {
            if (element.tagName === 'TEXTAREA') {
                element.select();
                document.execCommand('copy');
            } else {
                const range = document.createRange();
                range.selectNode(element);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
                document.execCommand('copy');
                window.getSelection()?.removeAllRanges();
            }
            log('📄 ' + targetId + ' copied to clipboard (fallback)', 'success');
        } catch (e) {
            log('❌ Failed to copy', 'error');
        }
    });
}

// ============================================================
//  Event Listeners
// ============================================================
startBtn.addEventListener('click', async () => {
    log('🚀 Starting collection...', 'info');
    setRunning(true);
    
    updateStatus({
        message: '🚀 Starting collection...',
        status: 'collecting',
        proxiesFound: 0,
        configsFound: 0
    });
    
    const settings = getSettings();
    try {
        await ipcRenderer.invoke('start-collection', settings);
    } catch (error) {
        log('❌ Error: ' + error.message, 'error');
        setRunning(false);
        updateStatus({
            message: `❌ Error: ${error.message}`,
            status: 'error'
        });
    }
});

stopBtn.addEventListener('click', async () => {
    log('⏹️ Stopping collection...', 'warning');
    try {
        await ipcRenderer.invoke('stop-collection');
        setRunning(false);
        log('⏹️ Stopped by user', 'warning');
    } catch (error) {
        log('❌ Error stopping: ' + error.message, 'error');
    }
});

refreshBtn.addEventListener('click', async () => {
    log('🔄 Refreshing repositories...', 'info');
    try {
        await ipcRenderer.invoke('load-repositories');
        await loadRepositories();
        log('✅ Repositories refreshed', 'success');
    } catch (error) {
        log('❌ Error: ' + error.message, 'error');
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
        log('❌ Error: ' + error.message, 'error');
    }
});

updateRepoBtn.addEventListener('click', async () => {
    log('🔄 Updating all repositories...', 'info');
    try {
        await ipcRenderer.invoke('load-repositories');
        await loadRepositories();
        log('✅ All repositories updated', 'success');
    } catch (error) {
        log('❌ Error updating repositories: ' + error.message, 'error');
    }
});

resetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
        outputDirInput.value = DEFAULT_SETTINGS.outputDir || './proxy_output';
        portsInput.value = '';
        pingTimesInput.value = String(DEFAULT_SETTINGS.pingTimes || 1);
        timeoutInput.value = String(DEFAULT_SETTINGS.timeout || 10);
        verifyCheckbox.checked = DEFAULT_SETTINGS.verifyLiveness !== undefined ? DEFAULT_SETTINGS.verifyLiveness : true;
        csvCheckbox.checked = DEFAULT_SETTINGS.csvOutput || false;
        fullJsonCheckbox.checked = DEFAULT_SETTINGS.fullJson || false;
        txtOutputCheckbox.checked = DEFAULT_SETTINGS.txtOutput !== undefined ? DEFAULT_SETTINGS.txtOutput : true;
        speedTestCheckbox.checked = DEFAULT_SETTINGS.speedTest !== undefined ? DEFAULT_SETTINGS.speedTest : true;
        trayToggle.checked = DEFAULT_SETTINGS.trayEnabled !== undefined ? DEFAULT_SETTINGS.trayEnabled : true;
        showDeadCheckbox.checked = DEFAULT_SETTINGS.showDeadConfigs || false;
        showDeadConfigs = DEFAULT_SETTINGS.showDeadConfigs || false;
        themeSelect.value = DEFAULT_SETTINGS.theme || 'dark';
        document.body.className = DEFAULT_SETTINGS.theme || 'dark';
        document.querySelectorAll('#protocolsContainer input[type="checkbox"]').forEach(cb => {
            const defaultProtocols = DEFAULT_SETTINGS.protocols || ['http', 'socks5'];
            cb.checked = defaultProtocols.includes(cb.value);
        });
        saveSettings();
        log('🔄 All settings reset to defaults', 'info');
    }
});

// ============================================================
//  Initialization
// ============================================================
loadSettings();
checkXrayInstalled();
versionDisplay.textContent = 'v' + CURRENT_VERSION;

setTimeout(async () => {
    await loadRepositoryStatus();
    await loadRepositories();
    await loadConfigsForPinger();
    console.log('✅ All initialized');
}, 500);

document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('change', () => {
        saveSettings();
    });
});

log('🚀 Vasler v' + CURRENT_VERSION + ' started successfully!', 'success');
log('💡 Select protocols and click "Start Collection" to begin.', 'info');