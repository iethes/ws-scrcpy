import * as https from 'https';
import * as http from 'http';
import { EnvName } from '../EnvName';
import { MobileScraperResponse, MobileScraperRecord } from '../../types/MobileScraper';

const TAG = '[NocoDBApi]';

export class NocoDBApi {
    private static instance: NocoDBApi;
    private readonly apiToken: string;
    private readonly baseUrl: string;
    private readonly tableId: string;
    private readonly orchestratorId: string;
    private cache: Map<string, MobileScraperRecord> = new Map();
    private cacheTimestamp = 0;
    private readonly CACHE_TTL = 60000;

    private constructor() {
        this.apiToken = process.env[EnvName.NOCODB_API_TOKEN] || '';
        this.baseUrl = (process.env[EnvName.NOCODB_BASE_URL] || '').replace(/\/$/, '');
        this.tableId = process.env[EnvName.NOCODB_TABLE_ID] || '';
        this.orchestratorId = process.env[EnvName.NOCODB_ORCHESTRATOR_ID] || '';

        if (!this.apiToken) {
            console.warn(TAG, 'NOCODB_API_TOKEN not set in environment');
        }
        if (!this.baseUrl) {
            console.warn(TAG, 'NOCODB_BASE_URL not set in environment');
        }
        if (!this.tableId) {
            console.warn(TAG, 'NOCODB_TABLE_ID not set in environment');
        }
        if (!this.orchestratorId) {
            console.warn(TAG, 'NOCODB_ORCHESTRATOR_ID not set in environment; showing all NocoDB devices');
        }
    }

    public static getInstance(): NocoDBApi {
        if (!this.instance) {
            this.instance = new NocoDBApi();
        }
        return this.instance;
    }

    private isCacheValid(): boolean {
        return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
    }

    private async fetchRecords(): Promise<MobileScraperRecord[]> {
        if (!this.apiToken || !this.baseUrl || !this.tableId) {
            return [];
        }

        const allRecords: MobileScraperRecord[] = [];
        let page = 1;
        const pageSize = 100;
        let hasMore = true;

        while (hasMore) {
            const url = `${this.baseUrl}/api/v2/tables/${this.tableId}/records?limit=${pageSize}&offset=${
                (page - 1) * pageSize
            }`;

            const records = await new Promise<MobileScraperRecord[]>((resolve, reject) => {
                const protocol = this.baseUrl.startsWith('https') ? https : http;

                const options = {
                    method: 'GET',
                    headers: {
                        'xc-token': this.apiToken,
                        Accept: 'application/json',
                    },
                };

                const req = protocol.request(url, options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response: unknown = JSON.parse(data);
                            const mobileScraperResponse = response as MobileScraperResponse;
                            const records = mobileScraperResponse.list || [];
                            console.log(
                                TAG,
                                `Fetched page ${page}: ${records.length} records (totalRows: ${
                                    mobileScraperResponse.pageInfo?.totalRows || 'unknown'
                                })`,
                            );
                            resolve(records);
                        } catch (error: any) {
                            console.error(TAG, 'Failed to parse response:', error.message);
                            console.log(TAG, 'Raw response data:', data);
                            reject(error);
                        }
                    });
                });

                req.on('error', (error) => {
                    console.error(TAG, 'Request error:', error.message);
                    reject(error);
                });

                req.end();
            });

            allRecords.push(...records);

            if (records.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        }

        console.log(TAG, `Total records fetched: ${allRecords.length}`);
        return allRecords;
    }

    public async getMobileScraperData(): Promise<Map<string, MobileScraperRecord>> {
        if (this.isCacheValid()) {
            console.log(
                TAG,
                `Returning cached data with ${this.cache.size} devices: ${Array.from(this.cache.keys()).join(', ')}`,
            );
            return this.cache;
        }

        try {
            const records = await this.fetchRecords();
            this.cache.clear();
            records.forEach((record) => {
                const ztnetIp = record.ztnet_ip;
                console.log(TAG, `Caching: ${ztnetIp} -> ${record.label} (active: ${record.active})`);
                this.cache.set(ztnetIp, record);
            });
            this.cacheTimestamp = Date.now();
            console.log(TAG, `Cached ${this.cache.size} records from mobile-scrapers table`);
            return this.cache;
        } catch (error) {
            console.error(TAG, 'Failed to fetch mobile-scraper data:', error);
            return this.cache;
        }
    }

    public getRecordByZtnetIp(ztnetIp: string): MobileScraperRecord | undefined {
        return this.cache.get(ztnetIp);
    }

    public matchesOrchestrator(record: MobileScraperRecord): boolean {
        return !this.orchestratorId || record.orchestrator_id === this.orchestratorId;
    }

    public invalidateCache(): void {
        this.cache.clear();
        this.cacheTimestamp = 0;
    }

    public async updateRecord(recordId: number, updates: Partial<MobileScraperRecord>): Promise<void> {
        if (!this.apiToken || !this.baseUrl || !this.tableId) {
            console.error(TAG, 'NocoDB API credentials not configured');
            return;
        }

        const url = `${this.baseUrl}/api/v2/tables/${this.tableId}/records`;

        return new Promise<void>((resolve, reject) => {
            const protocol = this.baseUrl.startsWith('https') ? https : http;

            const body = JSON.stringify({ id: recordId, ...updates });

            const options = {
                method: 'PATCH',
                headers: {
                    'xc-token': this.apiToken,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            };

            const req = protocol.request(url, options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(TAG, `Record ${recordId} updated successfully`);
                        this.invalidateCache();
                        resolve();
                    } else {
                        console.error(TAG, `Update failed with status ${res.statusCode}:`, data);
                        reject(new Error(`Update failed with status ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error(TAG, 'Update request error:', error.message);
                reject(error);
            });

            req.write(body);
            req.end();
        });
    }
}
