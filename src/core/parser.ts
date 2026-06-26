import { Proxy, Config, ProxyProtocol } from '../types';

export class Parser {
    private settings: any;

    constructor(settings: any) {
        this.settings = settings;
    }

    parse(text: string, source: string, repoType: string): { proxies: Proxy[], configs: Config[] } {
        const proxies: Proxy[] = [];
        const configs: Config[] = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            // MTProto full links
            if (trimmed.startsWith('https://t.me/proxy?') || trimmed.startsWith('tg://proxy?')) {
                proxies.push({
                    ip: '', port: 0, protocol: 'mtproto', source: source,
                    isAlive: true, latency: 0, rawLink: trimmed
                });
                continue;
            }

            // V2Ray configs - پشتیبانی از همه فرمت‌ها
            const v2rayMatch = trimmed.match(/^(vmess|vless|trojan|shadowsocks):\/\//i);
            if (v2rayMatch) {
                const protocol = v2rayMatch[1].toLowerCase();
                // حتی اگر پروتکل در فیلتر نباشد، اضافه کن (چون کاربر می‌خواهد همه را ببیند)
                configs.push({
                    name: `${protocol}_${configs.length}`,
                    protocol: protocol,
                    raw: trimmed,
                    source: source
                });
                continue;
            }

            // Regular proxies
            const proxy = this.parseProxyLine(trimmed, source);
            if (proxy) {
                // ===== FIX: اگر پروتکل unknown بود، آن را http در نظر بگیر =====
                if (proxy.protocol === 'unknown') {
                    proxy.protocol = 'http';
                }
                // فیلتر پورت و پروتکل را اعمال کن (اگر کاربر چیزی انتخاب کرده باشد)
                if (this.settings.ports && this.settings.ports.length > 0) {
                    if (!this.settings.ports.includes(proxy.port)) continue;
                }
                if (this.settings.protocols && this.settings.protocols.length > 0) {
                    if (!this.settings.protocols.includes(proxy.protocol)) continue;
                }
                proxies.push(proxy);
            }
        }

        return { proxies, configs };
    }

    parseProxyLine(line: string, source: string): Proxy | null {
        let clean = line;
        let protocol: ProxyProtocol = 'unknown';

        if (line.startsWith('http://')) { clean = line.substring(7); protocol = 'http'; }
        else if (line.startsWith('https://')) { clean = line.substring(8); protocol = 'https'; }
        else if (line.startsWith('socks4://')) { clean = line.substring(9); protocol = 'socks4'; }
        else if (line.startsWith('socks5://')) { clean = line.substring(9); protocol = 'socks5'; }
        else if (line.startsWith('socks://')) { clean = line.substring(8); protocol = 'socks5'; }

        // حذف @ و ... اگر وجود داشته باشد
        if (clean.includes('@')) {
            const parts = clean.split('@');
            clean = parts[parts.length - 1];
        }
        // حذف توضیحات اضافی بعد از فاصله
        clean = clean.split(' ')[0];
        clean = clean.split('/')[0];

        // الگوی IP:PORT
        const match = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
        if (match) {
            return {
                ip: match[1],
                port: parseInt(match[2]),
                protocol: protocol,  // اگر unknown باشد، در collector به http تبدیل می‌شود
                source: source,
                isAlive: true,
                latency: 0
            };
        }
        // الگوی IP PORT (با فاصله)
        const match2 = clean.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)$/);
        if (match2) {
            return {
                ip: match2[1],
                port: parseInt(match2[2]),
                protocol: protocol,
                source: source,
                isAlive: true,
                latency: 0
            };
        }
        return null;
    }
}