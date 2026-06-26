import * as net from 'net';
import { Proxy } from '../types';

export class Validator {
    private settings: any;

    constructor(settings: any) {
        this.settings = settings;
    }

    async verifyAll(proxies: Proxy[]): Promise<Proxy[]> {
        const alive: Proxy[] = [];
        const timeout = this.settings.timeout || 3;
        const tries = this.settings.pingTimes || 1;
        const maxCheck = Math.min(200, proxies.length);

        const testProxies = proxies.slice(0, maxCheck);
        let checked = 0;

        const tasks = testProxies.map(async (proxy) => {
            if (proxy.rawLink) {
                return null;
            }
            const latency = await this.checkLatency(proxy, timeout, tries);
            if (latency >= 0) {
                proxy.isAlive = true;
                proxy.latency = latency;
                return proxy;
            }
            proxy.isAlive = false;
            return null;
        });

        const results = await Promise.all(tasks);
        const aliveProxies = results.filter((p): p is Proxy => p !== null);
        
        // Update the original proxies
        for (const proxy of proxies) {
            const found = aliveProxies.find(p => p.ip === proxy.ip && p.port === proxy.port);
            if (found) {
                proxy.isAlive = true;
                proxy.latency = found.latency;
            } else {
                proxy.isAlive = false;
            }
        }

        return aliveProxies;
    }

    private async checkLatency(proxy: Proxy, timeout: number, tries: number): Promise<number> {
        let totalTime = 0;
        let success = 0;

        for (let i = 0; i < tries; i++) {
            try {
                const start = Date.now();
                await this.connectWithTimeout(proxy.ip, proxy.port, timeout);
                totalTime += Date.now() - start;
                success++;
            } catch {
                // Connection failed
            }
        }

        if (success > 0) {
            return totalTime / success;
        }
        return -1;
    }

    private connectWithTimeout(host: string, port: number, timeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error('Timeout'));
            }, timeout * 1000);

            socket.connect(port, host, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve();
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                socket.destroy();
                reject(err);
            });
        });
    }
}