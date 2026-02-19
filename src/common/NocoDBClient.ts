const TAG = '[NocoDBClient]';

export interface MobileScraperRecord {
    Id: number;
    CreatedAt: string;
    UpdatedAt: string;
    ztnet_ip: string;
    label: string;
    regions: string;
    loggedin: string;
    operator: string;
    remote_stream: string | null;
    active: boolean;
}

export class NocoDBClient {
    private static instance: NocoDBClient;
    private cache: Map<string, MobileScraperRecord> = new Map();
    private cacheTimestamp = 0;
    private readonly CACHE_TTL = 60000;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {}

    public static getInstance(): NocoDBClient {
        if (!this.instance) {
            this.instance = new NocoDBClient();
        }
        return this.instance;
    }

    private isCacheValid(): boolean {
        return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
    }

    private async fetchRecords(): Promise<MobileScraperRecord[]> {
        console.log(TAG, 'Fetching from /api/mobile-scrapers');
        try {
            const response = await fetch('/api/mobile-scrapers');
            console.log(TAG, `Response status: ${response.status}`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(TAG, `Failed to fetch mobile-scrapers data: ${response.statusText}`, errorText);
                throw Error(`Failed to fetch mobile-scrapers data: ${response.statusText}`);
            }
            const data = await response.json();
            console.log(TAG, 'Received data:', JSON.stringify(data));
            return data.records || [];
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(TAG, 'Fetch error:', errorMessage);
            throw error;
        }
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
            console.log(TAG, `Received ${records.length} records from API`);
            this.cache.clear();
            records.forEach((record) => {
                const ztnetIp = record.ztnet_ip;
                console.log(TAG, `Caching: ${ztnetIp} -> ${record.label} (active: ${record.active})`);
                this.cache.set(ztnetIp, record);
            });
            this.cacheTimestamp = Date.now();
            console.log(TAG, `Cached ${this.cache.size} records from mobile-scrapers table`);
            console.log(TAG, `Cache keys: ${Array.from(this.cache.keys()).join(', ')}`);
            return this.cache;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(TAG, 'Failed to fetch mobile-scraper data:', errorMessage);
            return this.cache;
        }
    }

    public getRecordByZtnetIp(ztnetIp: string): MobileScraperRecord | undefined {
        return this.cache.get(ztnetIp);
    }

    public invalidateCache(): void {
        this.cache.clear();
        this.cacheTimestamp = 0;
    }
}
