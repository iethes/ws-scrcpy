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

export interface MobileScraperResponse {
    list: MobileScraperRecord[];
    pageInfo?: {
        totalRows: number;
        page: number;
        pageSize: number;
        isFirstPage: boolean;
        isLastPage: boolean;
    };
}
