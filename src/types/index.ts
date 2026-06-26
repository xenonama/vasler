// ============================================================
//  Type Definitions
// ============================================================

export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5' | 'mtproto' | 'v2ray' | 'unknown';

export interface Proxy {
    ip: string;
    port: number;
    protocol: ProxyProtocol | string;
    source: string;
    isAlive: boolean;
    latency: number;
    rawLink?: string;
}

export interface Config {
    name: string;
    protocol: string;
    raw: string;
    source: string;
}

export interface Repository {
    type: 'proxy_list' | 'mtproto' | 'v2ray' | 'gfwlist';
    files: string[];
}

export interface RepositoryConfig {
    [key: string]: Repository;
}

export interface CollectionStats {
    totalSources: number;
    successfulSources: number;
    totalProxies: number;
    totalConfigs: number;
    startTime: Date;
    endTime?: Date;
    portStats: Map<number, number>;
    protocolStats: Map<string, number>;
}

export interface AppSettings {
    outputDir: string;
    verifyLiveness: boolean;
    csvOutput: boolean;
    fullJson: boolean;
    protocols: string[];
    ports: number[];
    pingTimes: number;
    timeout: number;
    language: 'en' | 'fa';
    theme: 'dark' | 'light';
}

export interface LogMessage {
    message: string;
    level: 'info' | 'success' | 'error' | 'warning' | 'debug';
    timestamp: Date;
}