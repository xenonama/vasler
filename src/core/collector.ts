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
                if (repo && typeof repo === 'object' && repo.files && Array.isArray(repo.files)) {
                    this.repositories.set(name, repo);
                }
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

        // ارسال وضعیت شروع
        this.emit('status', {
            message: '🚀 Initializing collection...',
            status: 'collecting',
            proxiesFound: 0,
            configsFound: 0
        });

        const protocols: string[] = settings.protocols || [];
        let filteredRepositories = this.repositories;

        if (protocols.length > 0) {
            const allowedTypes: string[] = [];
            if (protocols.some((p: string) => ['vless', 'vmess', 'trojan', 'shadowsocks', 'v2ray'].includes(p))) {
                allowedTypes.push('v2ray');
            }
            if (protocols.some((p: string) => ['mtproto'].includes(p))) {
                allowedTypes.push('mtproto');
            }
            if (protocols.some((p: string) => ['http', 'https', 'socks4', 'socks5'].includes(p))) {
                allowedTypes.push('proxy_list');
            }
            if (allowedTypes.length === 0) {
                allowedTypes.push('v2ray', 'mtproto', 'proxy_list');
            }

            const filtered = new Map<string, Repository>();
            for (const [name, repo] of this.repositories) {
                const repoType = Array.isArray(repo.type) ? repo.type : [repo.type];
                if (repoType.some((t: string) => allowedTypes.includes(t))) {
                    filtered.set(name, repo);
                }
            }
            filteredRepositories = filtered;
            this.emit('log', {
                message: `🔍 Filtered to ${filtered.size} repositories based on protocols: ${allowedTypes.join(', ')}`,
                level: 'debug',
                timestamp: new Date()
            });
        }

        const parser = new Parser(settings);
        const validator = new Validator(settings);
        const exporter = new Exporter(this.outputDir);

        let completed = 0;
        const total = filteredRepositories.size;

        // ارسال وضعیت اولیه
        this.emit('status', {
            message: `📊 Processing ${total} repositories...`,
            current: 0,
            total: total,
            proxiesFound: 0,
            configsFound: 0,
            currentRepo: '',
            status: 'collecting'
        });

        for (const [name, repo] of filteredRepositories) {
            if (this.stopFlag) break;
            completed++;

            // ارسال وضعیت مخزن فعلی
            this.emit('status', {
                message: `📥 Processing: ${name}`,
                current: completed,
                total: total,
                proxiesFound: this.stats.totalProxies,
                configsFound: this.stats.totalConfigs,
                currentRepo: name,
                status: 'downloading'
            });

            this.emit('log', {
                message: `📥 Processing repository: ${name} (${completed}/${total})`,
                level: 'info',
                timestamp: new Date()
            });

            await new Promise(resolve => setImmediate(resolve));

            const files = repo.files || [];
            if (!Array.isArray(files)) {
                this.emit('log', {
                    message: `⚠️ Repository "${name}" has invalid files format. Skipping.`,
                    level: 'warning',
                    timestamp: new Date()
                });
                continue;
            }

            let fileIndex = 0;
            for (const fileUrl of files) {
                if (this.stopFlag) break;
                fileIndex++;

                const fileName = fileUrl.split('/').pop() || fileUrl;

                // ارسال وضعیت دانلود
                this.emit('status', {
                    message: `📥 Downloading: ${fileName}`,
                    current: completed,
                    total: total,
                    proxiesFound: this.stats.totalProxies,
                    configsFound: this.stats.totalConfigs,
                    currentRepo: name,
                    status: 'downloading'
                });

                this.emit('log', {
                    message: `  📥 Downloading: ${fileName}`,
                    level: 'debug',
                    timestamp: new Date()
                });

                await new Promise(resolve => setImmediate(resolve));

                try {
                    const content = await this.fetchUrl(fileUrl);
                    if (!content) {
                        this.emit('log', {
                            message: `  ❌ Failed to fetch: ${fileUrl}`,
                            level: 'error',
                            timestamp: new Date()
                        });
                        continue;
                    }

                    this.emit('log', {
                        message: `  ✅ Downloaded: ${fileName} (${content.length} bytes)`,
                        level: 'debug',
                        timestamp: new Date()
                    });

                    // ارسال وضعیت پارس
                    this.emit('status', {
                        message: `🔍 Parsing: ${fileName}`,
                        current: completed,
                        total: total,
                        proxiesFound: this.stats.totalProxies,
                        configsFound: this.stats.totalConfigs,
                        currentRepo: name,
                        status: 'processing'
                    });

                    const repoType = Array.isArray(repo.type) ? repo.type[0] : repo.type;
                    const result = parser.parse(content, name, repoType || 'proxy_list');

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

                    // آپدیت وضعیت بعد از هر فایل
                    this.emit('status', {
                        message: `✅ ${fileName} done (${proxyCount} proxies, ${configCount} configs)`,
                        current: completed,
                        total: total,
                        proxiesFound: this.stats.totalProxies,
                        configsFound: this.stats.totalConfigs,
                        currentRepo: name,
                        status: 'processing'
                    });

                    this.emit('log', {
                        message: `  ✅ ${fileName}: ${proxyCount} proxies, ${configCount} configs`,
                        level: 'success',
                        timestamp: new Date()
                    });

                } catch (error: any) {
                    this.emit('log', {
                        message: `  ❌ Error: ${error.message}`,
                        level: 'error',
                        timestamp: new Date()
                    });
                }
            }
            this.stats.successfulSources++;
        }

        if (this.stopFlag) {
            this.emit('log', { message: '⏹️ Stopped by user', level: 'warning', timestamp: new Date() });
            this.emit('status', {
                message: '⏹️ Stopped by user',
                status: 'error'
            });
            this.isRunning = false;
            return;
        }

        const allProxies = this.getAllProxies();

        if (settings.verifyLiveness && allProxies.length > 0) {
            this.emit('status', {
                message: '🔍 Verifying proxy liveness...',
                status: 'processing',
                proxiesFound: this.stats.totalProxies,
                configsFound: this.stats.totalConfigs
            });
            this.emit('log', { message: '🔍 Verifying proxy liveness...', level: 'info', timestamp: new Date() });
            await validator.verifyAll(allProxies);
        }

        this.emit('status', {
            message: '📤 Exporting results...',
            status: 'processing',
            proxiesFound: this.stats.totalProxies,
            configsFound: this.stats.totalConfigs
        });
        this.emit('log', { message: '📤 Exporting results...', level: 'info', timestamp: new Date() });
        
        this.stats.endTime = new Date();
        await exporter.exportAll(allProxies, this.configs, this.stats, settings);

        if (settings.speedTest && allProxies.length > 0) {
            this.emit('status', {
                message: '🚀 Running speed test...',
                status: 'processing',
                proxiesFound: this.stats.totalProxies,
                configsFound: this.stats.totalConfigs
            });
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
        
        // وضعیت نهایی
        this.emit('status', {
            message: `✅ Done! Found ${this.stats.totalProxies} proxies and ${this.stats.totalConfigs} configs`,
            current: total,
            total: total,
            proxiesFound: this.stats.totalProxies,
            configsFound: this.stats.totalConfigs,
            currentRepo: '',
            status: 'done'
        });

        this.emit('complete', this.stats);
        this.emit('log', {
            message: `✅ Done! Found ${this.stats.totalProxies} proxies and ${this.stats.totalConfigs} configs`,
            level: 'success',
            timestamp: new Date()
        });
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            return await response.text();
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log(`⏱️ Timeout: ${url}`);
            }
            return null;
        }
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

    stop(): void {
        this.stopFlag = true;
        this.emit('log', { message: '⏹️ Stopping... Please wait', level: 'warning', timestamp: new Date() });
        this.emit('status', {
            message: '⏹️ Stopping collection...',
            status: 'error'
        });
    }
}