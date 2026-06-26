import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Proxy, Config, Repository, CollectionStats, ProxyProtocol } from '../types';
import { Parser } from './parser';
import { Validator } from './validator';
import { Exporter } from './exporter';

const USER_AGENT = 'Vasler/1.0.0';

export class Collector extends EventEmitter {
    public proxies: Map<string, Set<Proxy>>;
    public configs: Config[];
    public stats: CollectionStats;
    public outputDir: string;
    
    private repositories: Map<string, Repository>;
    private isRunning: boolean = false;
    private stopFlag: boolean = false;
    private settings: any;
    private repoFile: string;

    constructor(outputDir: string = './proxy_output', repoFile: string = './repositories.json') {
        super();
        this.outputDir = outputDir;
        this.repoFile = repoFile;
        this.proxies = new Map();
        this.configs = [];
        this.stats = {
            totalSources: 0,
            successfulSources: 0,
            totalProxies: 0,
            totalConfigs: 0,
            startTime: new Date(),
            portStats: new Map(),
            protocolStats: new Map()
        };
        this.repositories = new Map();
        ['http', 'https', 'socks4', 'socks5', 'mtproto', 'v2ray', 'unknown'].forEach(p => {
            this.proxies.set(p, new Set());
        });
    }

    async loadRepositories(): Promise<void> {
        try {
            const data = await fs.promises.readFile(this.repoFile, 'utf-8');
            const repos = JSON.parse(data);
            for (const [name, repo] of Object.entries(repos) as [string, Repository][]) {
                this.repositories.set(name, repo);
            }
            this.emit('log', {
                message: `✅ Loaded ${this.repositories.size} repositories from ${this.repoFile}`,
                level: 'success',
                timestamp: new Date()
            });
        } catch (error) {
            const defaultRepos = this.getDefaultRepositories();
            for (const [name, repo] of Object.entries(defaultRepos) as [string, Repository][]) {
                this.repositories.set(name, repo);
            }
            await fs.promises.writeFile(this.repoFile, JSON.stringify(defaultRepos, null, 2));
            this.emit('log', {
                message: `📁 Created default repositories file: ${this.repoFile}`,
                level: 'info',
                timestamp: new Date()
            });
        }
    }

    private getDefaultRepositories(): Record<string, Repository> {
        return {
            "fvyrf/fresh-proxy-list": {
                "type": "proxy_list",
                "files": [
                    "https://raw.githubusercontent.com/fyvri/fresh-proxy-list/archive/storage/classic/http.txt",
                    "https://raw.githubusercontent.com/fyvri/fresh-proxy-list/archive/storage/classic/https.txt",
                    "https://raw.githubusercontent.com/fyvri/fresh-proxy-list/archive/storage/classic/socks4.txt",
                    "https://raw.githubusercontent.com/fyvri/fresh-proxy-list/archive/storage/classic/socks5.txt"
                ]
            },
            "SoliSpirit/mtproto": {
                "type": "mtproto",
                "files": [
                    "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt"
                ]
            },
            "Grim1313/mtproto-for-telegram": {
                "type": "mtproto",
                "files": [
                    "https://raw.githubusercontent.com/Grim1313/mtproto-for-telegram/master/all_proxies.txt"
                ]
            },
            "barry-far/V2ray-Config": {
                "type": "v2ray",
                "files": [
                    "https://raw.githubusercontent.com/barry-far/V2ray-config/main/All_Configs_Sub.txt"
                ]
            },
            "mahdibland/V2RayAggregator": {
                "type": "v2ray",
                "files": [
                    "https://raw.githubusercontent.com/mahdibland/ShadowsocksAggregator/master/Eternity"
                ]
            }
        };
    }

    async start(settings: any): Promise<void> {
        this.isRunning = true;
        this.stopFlag = false;
        this.stats.startTime = new Date();
        this.settings = settings;

        this.emit('status', 'Collecting...');
        this.emit('log', {
            message: `🔍 Starting collection from ${this.repositories.size} repositories...`,
            level: 'info',
            timestamp: new Date()
        });

        const parser = new Parser(settings);
        const validator = new Validator(settings);
        const exporter = new Exporter(this.outputDir);

        let completed = 0;
        const total = this.repositories.size;

        for (const [name, repo] of this.repositories) {
            if (this.stopFlag) break;
            completed++;
            this.emit('progress', { current: completed, total: total, message: `📥 ${name}` });

            // ===== FIX: بررسی وجود files و آرایه بودن =====
            const files = repo.files || [];
            if (!Array.isArray(files)) {
                this.emit('log', {
                    message: `⚠️ Repository "${name}" has invalid files format. Skipping.`,
                    level: 'warning',
                    timestamp: new Date()
                });
                continue;
            }

            for (const fileUrl of files) {
                if (this.stopFlag) break;
                try {
                    const content = await this.fetchUrl(fileUrl);
                    if (!content) {
                        this.emit('log', { message: `  ❌ Failed to fetch: ${fileUrl}`, level: 'error', timestamp: new Date() });
                        continue;
                    }

                    const preview = content.split('\n').slice(0, 5).join('\n');
                    this.emit('log', {
                        message: `  📄 Preview of ${fileUrl.split('/').pop()}:\n${preview.substring(0, 300)}...`,
                        level: 'debug',
                        timestamp: new Date()
                    });

                    const result = parser.parse(content, name, repo.type);

                    let proxyCount = 0;
                    for (const proxy of result.proxies) {
                        let protocol = proxy.protocol;
                        if (protocol === 'unknown') {
                            protocol = 'http';
                            proxy.protocol = 'http';
                        }

                        if (settings.ports && settings.ports.length > 0) {
                            if (!settings.ports.includes(proxy.port)) continue;
                        }
                        if (settings.protocols && settings.protocols.length > 0) {
                            if (!settings.protocols.includes(protocol)) continue;
                        }

                        const key = protocol;
                        this.proxies.get(key)?.add(proxy);
                        this.stats.totalProxies++;
                        proxyCount++;
                        this.stats.protocolStats.set(key, (this.stats.protocolStats.get(key) || 0) + 1);
                        if (proxy.port) {
                            this.stats.portStats.set(proxy.port, (this.stats.portStats.get(proxy.port) || 0) + 1);
                        }
                    }

                    let configCount = 0;
                    const v2rayProtocols = ['vmess', 'vless', 'trojan', 'shadowsocks'];
                    for (const config of result.configs) {
                        if (settings.protocols && settings.protocols.length > 0) {
                            const isV2RaySelected = settings.protocols.includes('v2ray');
                            const isV2RayConfig = v2rayProtocols.includes(config.protocol);
                            if (isV2RaySelected && isV2RayConfig) {
                                // قبول
                            } else if (!settings.protocols.includes(config.protocol)) {
                                continue;
                            }
                        }
                        this.configs.push(config);
                        this.stats.totalConfigs++;
                        configCount++;
                    }

                    this.emit('log', {
                        message: `  ✅ ${fileUrl.split('/').pop()}: ${proxyCount} proxies, ${configCount} configs`,
                        level: 'success',
                        timestamp: new Date()
                    });

                } catch (error: any) {
                    this.emit('log', { message: `  ❌ Error: ${error.message}`, level: 'error', timestamp: new Date() });
                }
            }
            this.stats.successfulSources++;
        }

        if (this.stopFlag) {
            this.emit('log', { message: '⏹️ Stopped by user', level: 'warning', timestamp: new Date() });
            this.isRunning = false;
            return;
        }

        const allProxies = this.getAllProxies();

        if (settings.verifyLiveness && allProxies.length > 0) {
            this.emit('status', 'Verifying...');
            this.emit('log', { message: '🔍 Verifying proxy liveness...', level: 'info', timestamp: new Date() });
            await validator.verifyAll(allProxies);
        }

        this.emit('status', 'Exporting...');
        this.stats.endTime = new Date();
        await exporter.exportAll(allProxies, this.configs, this.stats, settings);

        // ===== پینگ کانفیگ‌ها با Xray (در صورت فعال بودن) =====
        if (settings.pingConfigs && this.configs.length > 0) {
            this.emit('log', { message: '📡 Testing config latencies with Xray...', level: 'info', timestamp: new Date() });
            const pingResults = await this.testAllConfigs();
            let pingCount = 0;
            for (const [raw, latency] of pingResults) {
                if (latency > 0) {
                    pingCount++;
                }
            }
            this.emit('log', {
                message: `  ✅ ${pingCount} configs responded (out of ${pingResults.size})`,
                level: 'success',
                timestamp: new Date()
            });
        }

        if (settings.speedTest && allProxies.length > 0) {
            this.emit('log', { message: '🚀 Running speed test on top 100 proxies...', level: 'info', timestamp: new Date() });
            const fastest = await this.speedTest(allProxies.slice(0, 100), 10);
            this.emit('log', { message: `🏆 Fastest 10 proxies:`, level: 'success', timestamp: new Date() });
            fastest.forEach((p, i) => {
                this.emit('log', {
                    message: `  ${i+1}. ${p.ip}:${p.port} (${p.protocol}) - ${p.latency.toFixed(1)}ms`,
                    level: 'success',
                    timestamp: new Date()
                });
            });
        }

        this.isRunning = false;
        this.emit('complete', this.stats);
        this.emit('log', {
            message: `✅ Done! Found ${this.stats.totalProxies} proxies and ${this.stats.totalConfigs} configs`,
            level: 'success',
            timestamp: new Date()
        });
        this.emit('status', '✅ Finished');
    }

    private async speedTest(proxies: Proxy[], count: number = 10): Promise<Proxy[]> {
        const results: {proxy: Proxy, latency: number}[] = [];
        for (const proxy of proxies) {
            if (proxy.rawLink) continue;
            try {
                const start = Date.now();
                const socket = await this.connectWithTimeout(proxy.ip, proxy.port, 2000);
                socket.destroy();
                const latency = Date.now() - start;
                results.push({proxy, latency});
            } catch {}
        }
        results.sort((a, b) => a.latency - b.latency);
        const fastest = results.slice(0, count);
        fastest.forEach(({proxy, latency}) => { proxy.latency = latency; });
        return fastest.map(r => r.proxy);
    }

    private connectWithTimeout(host: string, port: number, timeout: number): Promise<any> {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const socket = new net.Socket();
            const timer = setTimeout(() => { socket.destroy(); reject(new Error('Timeout')); }, timeout);
            socket.connect(port, host, () => { clearTimeout(timer); resolve(socket); });
            socket.on('error', (err: any) => { clearTimeout(timer); reject(err); });
        });
    }

    private getAllProxies(): Proxy[] {
        const all: Proxy[] = [];
        for (const set of this.proxies.values()) {
            for (const proxy of set) {
                all.push(proxy);
            }
        }
        return all;
    }

    private async fetchUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(15000)
            });
            if (!response.ok) return null;
            return await response.text();
        } catch { return null; }
    }

    getRepositories(): Map<string, Repository> { return this.repositories; }

    async addRepository(name: string, repo: Repository): Promise<void> {
        this.repositories.set(name, repo);
        await this.saveRepositories();
    }

    async removeRepository(name: string): Promise<void> {
        this.repositories.delete(name);
        await this.saveRepositories();
    }

    private async saveRepositories(): Promise<void> {
        const obj: Record<string, Repository> = {};
        for (const [name, repo] of this.repositories) {
            obj[name] = repo;
        }
        await fs.promises.writeFile(this.repoFile, JSON.stringify(obj, null, 2));
    }

    // ============================================================
    //  Xray Ping Methods
    // ============================================================
    async pingConfigWithXray(rawConfig: string): Promise<number> {
        return -1;
    }

    async testAllConfigs(): Promise<Map<string, number>> {
        const results = new Map<string, number>();
        let xrayPath: string | null = null;
        try {
            const settingsPath = path.join(process.cwd(), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                xrayPath = settings.xrayPath || null;
            }
        } catch {
            // ignore
        }
        if (!xrayPath || !fs.existsSync(xrayPath)) {
            this.emit('log', {
                message: '  ⚠️ Xray not installed. Please download or select path from Settings tab.',
                level: 'warning',
                timestamp: new Date()
            });
            return results;
        }
        const testConfigs = this.configs.slice(0, 20);
        for (const config of testConfigs) {
            const latency = await this.pingConfigWithXray(config.raw);
            results.set(config.raw, latency);
        }
        return results;
    }

    stop(): void {
        this.stopFlag = true;
        this.emit('log', { message: '⏹️ Stopping... Please wait', level: 'warning', timestamp: new Date() });
    }
}