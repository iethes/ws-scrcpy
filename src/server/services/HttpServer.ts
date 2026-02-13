import * as http from 'http';
import * as https from 'https';
import path from 'path';
import { Service } from './Service';
import { Utils } from '../Utils';
import express, { Express } from 'express';
import { Config } from '../Config';
import { TypedEmitter } from '../../common/TypedEmitter';
import * as process from 'process';
import { EnvName } from '../EnvName';

const DEFAULT_STATIC_DIR = path.join(__dirname, './public');

const PATHNAME = process.env[EnvName.WS_SCRCPY_PATHNAME] || __PATHNAME__;

export type ServerAndPort = {
    server: https.Server | http.Server;
    port: number;
};

interface HttpServerEvents {
    started: boolean;
}

export class HttpServer extends TypedEmitter<HttpServerEvents> implements Service {
    private static instance: HttpServer;
    private static PUBLIC_DIR = DEFAULT_STATIC_DIR;
    private static SERVE_STATIC = true;
    private servers: ServerAndPort[] = [];
    private mainApp?: Express;
    private started = false;

    protected constructor() {
        super();
    }

    public static getInstance(): HttpServer {
        if (!this.instance) {
            this.instance = new HttpServer();
        }
        return this.instance;
    }

    public static hasInstance(): boolean {
        return !!this.instance;
    }

    public static setPublicDir(dir: string): void {
        if (HttpServer.instance) {
            throw Error('Unable to change value after instantiation');
        }
        HttpServer.PUBLIC_DIR = dir;
    }

    public static setServeStatic(enabled: boolean): void {
        if (HttpServer.instance) {
            throw Error('Unable to change value after instantiation');
        }
        HttpServer.SERVE_STATIC = enabled;
    }

    public async getServers(): Promise<ServerAndPort[]> {
        if (this.started) {
            return [...this.servers];
        }
        return new Promise<ServerAndPort[]>((resolve) => {
            this.once('started', () => {
                resolve([...this.servers]);
            });
        });
    }

    public getName(): string {
        return `HTTP(s) Server Service`;
    }

    public async start(): Promise<void> {
        this.mainApp = express();
        this.mainApp.use(express.json());
        if (HttpServer.SERVE_STATIC && HttpServer.PUBLIC_DIR) {
            this.mainApp.use((_req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                next();
            });
            this.mainApp.use(PATHNAME, express.static(HttpServer.PUBLIC_DIR));

            /// #if USE_WDA_MJPEG_SERVER

            const { MjpegProxyFactory } = await import('../mw/MjpegProxyFactory');
            this.mainApp.get('/mjpeg/:udid', new MjpegProxyFactory().proxyRequest);
            /// #endif

            const { NocoDBApi } = await import('./NocoDBApi');
            this.mainApp.get('/api/mobile-scrapers', async (_req, res) => {
                try {
                    const nocodb = NocoDBApi.getInstance();
                    const data = await nocodb.getMobileScraperData();
                    const records = Array.from(data.values());
                    res.json({ records });
                } catch (error: any) {
                    res.status(500).json({ error: error.message });
                }
            });
            this.mainApp.post('/api/mobile-scrapers', async (req, res) => {
                try {
                    const { ztnet_ip, regions } = req.body;
                    if (!ztnet_ip || typeof regions !== 'string') {
                        return res.status(400).json({ error: 'Invalid request body' });
                    }
                    const nocodb = NocoDBApi.getInstance();
                    const record = nocodb.getRecordByZtnetIp(ztnet_ip);
                    if (!record) {
                        return res.status(404).json({ error: 'Device not found' });
                    }
                    await nocodb.updateRecord(record.Id, { regions });
                    return res.json({ success: true });
                } catch (error: any) {
                    console.error('Error updating mobile-scrapers:', error);
                    return res.status(500).json({ error: error.message });
                }
            });
        }
        const config = Config.getInstance();
        config.servers.forEach((serverItem) => {
            const { secure, port, redirectToSecure } = serverItem;
            let proto: string;
            let server: http.Server | https.Server;
            if (secure) {
                if (!serverItem.options) {
                    throw Error('Must provide option for secure server configuration');
                }
                server = https.createServer(serverItem.options, this.mainApp);
                proto = 'https';
            } else {
                const options = serverItem.options ? { ...serverItem.options } : {};
                proto = 'http';
                let currentApp = this.mainApp;
                let host = '';
                let port = 443;
                let doRedirect = false;
                if (redirectToSecure === true) {
                    doRedirect = true;
                } else if (typeof redirectToSecure === 'object') {
                    doRedirect = true;
                    if (typeof redirectToSecure.port === 'number') {
                        port = redirectToSecure.port;
                    }
                    if (typeof redirectToSecure.host === 'string') {
                        host = redirectToSecure.host;
                    }
                }
                if (doRedirect) {
                    currentApp = express();
                    currentApp.use(function (req, res) {
                        const url = new URL(`https://${host ? host : req.headers.host}${req.url}`);
                        if (port && port !== 443) {
                            url.port = port.toString();
                        }
                        return res.redirect(301, url.toString());
                    });
                }
                server = http.createServer(options, currentApp);
            }
            this.servers.push({ server, port });
            server.listen(port, () => {
                Utils.printListeningMsg(proto, port, PATHNAME);
            });
        });
        this.started = true;
        this.emit('started', true);
    }

    public release(): void {
        this.servers.forEach((item) => {
            item.server.close();
        });
    }
}
