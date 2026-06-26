import * as fs from 'fs';
import * as path from 'path';
import { Proxy, Config, CollectionStats } from '../types';

export class Exporter {
    private outputDir: string;

    constructor(outputDir: string) {
        this.outputDir = outputDir;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    async exportAll(proxies: Proxy[], configs: Config[], stats: CollectionStats, settings: any): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        const repoDir = path.join(this.outputDir, 'repositories');
        if (!fs.existsSync(repoDir)) fs.mkdirSync(repoDir, { recursive: true });

        const bySource = new Map<string, Map<string, Proxy[]>>();
        for (const proxy of proxies) {
            if (!bySource.has(proxy.source)) bySource.set(proxy.source, new Map());
            const sourceMap = bySource.get(proxy.source)!;
            if (!sourceMap.has(proxy.protocol)) sourceMap.set(proxy.protocol, []);
            sourceMap.get(proxy.protocol)!.push(proxy);
        }
        for (const [source, protocolMap] of bySource) {
            const safeName = source.replace(/[^a-zA-Z0-9]/g, '_');
            const sourceDir = path.join(repoDir, safeName);
            if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true });
            for (const [protocol, proxyList] of protocolMap) {
                const filePath = path.join(sourceDir, `${protocol}.txt`);
                const content = proxyList.filter(p => !p.rawLink).map(p => `${p.ip}:${p.port}`).join('\n');
                fs.writeFileSync(filePath, content);
            }
        }

        // all_proxies
        const allProxiesPath = path.join(this.outputDir, `all_proxies_${timestamp}.txt`);
        const allContent = this.generateAllProxies(proxies);
        fs.writeFileSync(allProxiesPath, allContent);

        // all_mtproto
        const mtprotoPath = path.join(this.outputDir, `all_mtproto_${timestamp}.txt`);
        const mtprotoContent = proxies.filter(p => p.protocol === 'mtproto' && p.rawLink).map(p => p.rawLink).join('\n');
        fs.writeFileSync(mtprotoPath, mtprotoContent);

        // all_configs
        if (configs.length > 0) {
            const configsPath = path.join(this.outputDir, `all_configs_${timestamp}.txt`);
            const configContent = configs.map(c => c.raw).join('\n');
            fs.writeFileSync(configsPath, configContent);
        }

        // JSON summary
        const jsonPath = path.join(this.outputDir, `proxies_${timestamp}.json`);
        const portStatsObj: {[key: string]: number} = {};
        for (const [port, count] of stats.portStats) portStatsObj[port.toString()] = count;
        const protocolStatsObj: {[key: string]: number} = {};
        for (const [protocol, count] of stats.protocolStats) protocolStatsObj[protocol] = count;
        const jsonData = {
            timestamp, version: '1.0.0',
            summary: {
                totalProxies: stats.totalProxies,
                totalConfigs: stats.totalConfigs,
                sourcesProcessed: stats.successfulSources,
                totalSources: stats.totalSources,
                durationSeconds: (stats.endTime ? stats.endTime.getTime() - stats.startTime.getTime() : 0) / 1000
            },
            protocols: protocolStatsObj,
            ports: portStatsObj
        };
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    }

    private generateAllProxies(proxies: Proxy[]): string {
        const groups = new Map<string, Proxy[]>();
        for (const proxy of proxies) {
            if (proxy.rawLink) continue;
            if (!groups.has(proxy.protocol)) groups.set(proxy.protocol, []);
            groups.get(proxy.protocol)!.push(proxy);
        }
        let result = `# All Proxies - ${new Date().toISOString()}\n`;
        result += '#' + '─'.repeat(50) + '\n\n';
        for (const [protocol, list] of groups) {
            result += `\n[${protocol.toUpperCase()}]\n`;
            list.sort((a, b) => a.ip.localeCompare(b.ip) || a.port - b.port);
            result += list.map(p => `${p.ip}:${p.port}`).join('\n');
            result += '\n';
        }
        return result;
    }
}