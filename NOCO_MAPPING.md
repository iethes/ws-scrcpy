# NocoDB Mapping Documentation

## Overview

This document describes how the device tracker maps device data from ADB to NocoDB's mobile-scrapers table to display custom labels and metadata, and allows editing of active regions.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  NocoDB API    │◀────│  Server API   │────▶│  Frontend       │
│  (mobile-scrapers)│     │  /api/mobile-      │     │  Device Tracker │
│                 │     │   scrapers          │     │                 │
└─────────────────┘     └──────────────┘     └─────────────────┘
         ▲                      │                       │
         │ (PATCH updates)       │                       │
         └──────────────────────┘                       │
                                                   │
                                                   ▼
                                     ┌─────────────────────────┐
                                     │  Browser UI           │
                                     │  - Display Label      │
                                     │  - Region Checkboxes  │
                                     └─────────────────────────┘
```

## Environment Variables

Add to `.env` file:

```bash
NOCODB_API_TOKEN="-DNW9DinHU3Ho-zrf9SB7SgDwkfirASHjyIbmjbn"
NOCODB_BASE_URL="https://nocodb.magpie.co.id/"
NOCODB_TABLE_ID="p4ct2g2urhzcfnz"
NOCODB_ORCHESTRATOR_ID="BPP-G1"
```

### Required Variables

-   `NOCODB_API_TOKEN` - Authentication token for NocoDB API
-   `NOCODB_BASE_URL` - Base URL of NocoDB instance
-   `NOCODB_TABLE_ID` - Table ID for mobile-scrapers table
-   `NOCODB_ORCHESTRATOR_ID` - Optional: only list records assigned to this mobile-orch instance

## Data Mapping

### Device → NocoDB Mapping

| Device Property                             | NocoDB Field                 | Description                        |
| ------------------------------------------- | ---------------------------- | ---------------------------------- |
| `device.udid` (e.g., `10.121.17.140:55555`) | `ztnet_ip`                   | Primary key for matching           |
| Device label display                        | `label`                      | Custom device name                 |
| Region checkboxes (editable)                | `regions` (comma-separated)  | Active regions (checked in UI)     |
| Available regions (from `loggedin`)         | `loggedin` (comma-separated) | Available countries for checkboxes |
| Device metadata                             | `operator`                   | Discord operator ID                |
| Orchestrator assignment                     | `orchestrator_id`            | mobile-orch instance ID/name       |

### Mobile-scrapers Table Schema

```typescript
interface MobileScraperRecord {
    Id: number;
    CreatedAt: string;
    UpdatedAt: string;
    ztnet_ip: string; // Format: "10.121.17.140:55555"
    label: string; // Display name: "magpie-infinix-zt-2"
    regions: string; // Comma-separated regions
    loggedin: string; // Comma-separated logged-in countries
    operator: string; // Discord operator ID
    remote_stream: string | null;
    orchestrator_id: string;
    active: boolean;
}
```

## Implementation Files

### Server-side

1. **`src/server/EnvName.ts`**

    - Added environment variable names: `NOCODB_API_TOKEN`, `NOCODB_BASE_URL`, `NOCODB_TABLE_ID`

2. **`src/server/services/NocoDBApi.ts`**

    - Fetches data from NocoDB API
    - Fetches all records for label lookup on connected ADB devices
    - Uses `NOCODB_ORCHESTRATOR_ID` when showing disconnected NocoDB devices
    - Implements caching (60s TTL)
    - Maps `ztnet_ip` to device records
    - `updateRecord()` method to update device records in NocoDB
    - Returns cached data to avoid excessive API calls

3. **`src/server/services/HttpServer.ts`**

    - Provides GET endpoint `/api/mobile-scrapers` to fetch device data
    - Provides POST endpoint `/api/mobile-scrapers` to update regions
    - Serves cached mobile-scrapers data to frontend
    - Returns JSON array of records
    - Supports CORS for cross-origin requests

### Client-side

4. **`src/common/NocoDBClient.ts`**

    - Fetches data from `/api/mobile-scrapers` endpoint
    - Implements client-side caching (60s TTL)
    - Singleton pattern for shared instance across trackers

5. **`src/types/MobileScraper.d.ts`**

    - TypeScript interfaces for NocoDB response
    - Defines `MobileScraperRecord` and `MobileScraperResponse`

6. **`src/app/googDevice/client/DeviceTracker.ts`**

    - Fetches NocoDB data on device list updates
    - Matches device `udid` to `ztnet_ip`
    - Displays `label` instead of manufacturer/model
    - Example: Shows "magpie-infinix-zt-2" instead of "INFINIX Infinix X6833B"
    - Renders checkboxes for each region from `loggedin` field
    - Active regions (from `regions` field) are checked
    - `updateRegions()` method sends POST request to update NocoDB
    - Auto-refreshes data after successful update

7. **`src/style/devicelist.css`**

    - Styling for region checkboxes
    - Follows `desc-block` pattern (border, border-radius, etc.)

## How It Works

### 1. Server Startup

```typescript
// src/server/index.ts
dotenv.config(); // Load .env file

// NocoDBApi singleton initialized with env vars
const nocodb = NocoDBApi.getInstance();
```

### 2. Data Fetch Flow

```
Frontend DeviceTracker
    │
    ├──> ensureMobileScraperData()
    │       │
    │       └──> NocoDBClient.getMobileScraperData()
    │               │
    │               ├──> fetch('/api/mobile-scrapers')
    │               │       │
    │               │       └──> HttpServer GET /api/mobile-scrapers
    │               │               │
    │               │               └──> NocoDBApi.getMobileScraperData()
    │               │                       │
    │               │                       └──> GET https://nocodb.magpie.co.id/api/v2/tables/{table_id}/records
    │               │                               │
    │               │                               └──> Response: { list: [...] }
    │               │
    │               └──< Cache records by ztnet_ip
    │
    └──< Cache populated
```

### 3. Device Label Resolution

```typescript
// src/app/googDevice/client/DeviceTracker.ts
private getDeviceLabel(device: GoogDeviceDescriptor): string {
    const data = this.mobileScraperData.get(device.udid);
    if (data && data.label) {
        return data.label; // "magpie-infinix-zt-2"
    }
    return `${device['ro.product.manufacturer']} ${device['ro.product.model']}`; // Fallback
}
```

### 4. Region Selection UI

**UI Rendering:**

```typescript
// src/app/googDevice/client/DeviceTracker.ts
private renderRegionsBlock(services, device, regions, loggedin, fullName, blockClass) {
    // Parse loggedin countries into array
    const loggedinList = loggedin.split(',').map(r => r.trim()).filter(r => r);

    // Parse active regions into array
    const regionList = regions.split(',').map(r => r.trim()).filter(r => r);

    // Create checkbox for each loggedin country
    loggedinList.forEach((country) => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = country;
        checkbox.checked = regionList.includes(country); // Active regions are checked
        checkbox.onchange = () => updateRegions(...); // Update on change
    });
}
```

**Update Flow:**

```
User checks/unchecks region
    │
    ├──> checkbox.onchange()
    │       │
    │       └──> updateRegions(device, activeRegions)
    │               │
    │               └──> fetch('/api/mobile-scrapers', { method: 'POST', ... })
    │                       │
    │                       └──> HttpServer POST /api/mobile-scrapers
    │                               │
    │                               └──> NocoDBApi.updateRecord()
    │                                       │
    │                                       └──> PATCH NocoDB API
    │                                               │
    │                                               └──> Update 'regions' field
    │
    └──< fetchMobileScraperData() - Refresh cache
```

### 5. Example Mapping

**ADB Device:**

-   udid: `10.121.17.140:55555`

**NocoDB Record:**

-   ztnet_ip: `10.121.17.140:55555`
-   label: `magpie-infinix-zt-2`
-   regions: `id,th` (active regions)
-   loggedin: `id,vn,th,my,ph` (all available countries)
-   operator: `<@403527393484210187>`

**UI Display:**

```
Device: magpie-infinix-zt-2
Regions: [☑ ID] [☐ VN] [☑ TH] [☐ MY] [☐ PH]
```

**User Action:**

-   Check "MY" → POST to update regions to `id,th,my`
-   Uncheck "ID" → POST to update regions to `th,my`

## API Endpoints

### Server Endpoints

**GET** `/api/mobile-scrapers`

Fetches all mobile-scrapers records from NocoDB.

**Response:**

```json
{
    "records": [
        {
            "Id": 4,
            "CreatedAt": "2026-02-03 05:22:35+00:00",
            "UpdatedAt": "2026-02-12 10:22:32+00:00",
            "ztnet_ip": "10.121.17.140:55555",
            "label": "magpie-infinix-zt-2",
            "regions": "id,th",
            "loggedin": "id,vn,th,my,ph",
            "operator": "<@403527393484210187>",
            "remote_stream": null,
            "active": true
        }
    ]
}
```

**POST** `/api/mobile-scrapers`

Updates the `regions` field for a device in NocoDB.

**Request Body:**

```json
{
    "ztnet_ip": "10.121.17.140:55555",
    "regions": "id,th,my"
}
```

**Response:**

```json
{
    "success": true
}
```

**Error Responses:**

-   `400 Bad Request` - Invalid request body
-   `404 Not Found` - Device not found in NocoDB
-   `500 Internal Server Error` - NocoDB API error

## Caching Strategy

### Server-side (NocoDBApi)

-   TTL: 60 seconds
-   Cache invalidated by HTTP endpoint calls
-   Prevents excessive NocoDB API requests

### Client-side (NocoDBClient)

-   TTL: 60 seconds
-   Cache shared across all tracker instances
-   Reduces HTTP requests to server

## Troubleshooting

### Labels Not Showing

**Check browser console:**

```javascript
[NocoDBClient] Fetching from /api/mobile-scrapers
[NocoDBClient] Response status: 200
[NocoDBClient] Caching: 10.121.17.140:55555 -> magpie-infinix-zt-2
[DeviceTracker] Looking up label for device 10.121.17.140:55555
[DeviceTracker] Found match for 10.121.17.140:55555: true
```

**Check server logs:**

```
[NocoDBApi] Cached 5 records from mobile-scrapers table
```

### Regions Not Updating

**Check browser console:**

```javascript
[DeviceTracker] Updated regions for 10.121.17.140:55555: id,th,my
```

**Check server logs:**

```
[HttpServer] Record 4 updated successfully
```

**Common Issues:**

1. **Environment variables not set**

    - Ensure `.env` file exists in project root
    - Check server logs for warnings about missing env vars

2. **ztnet_ip mismatch**

    - Verify device `udid` matches NocoDB `ztnet_ip` exactly
    - Includes port: `10.121.17.140:55555`

3. **API token invalid**

    - Check `NOCODB_API_TOKEN` is correct
    - Verify token has read AND write access to mobile-scrapers table

4. **Table ID incorrect**

    - Verify `NOCODB_TABLE_ID` matches NocoDB table ID
    - Table ID can be found in NocoDB API URL

5. **CORS error**

    - Check browser console for CORS errors
    - Ensure HttpServer has CORS headers configured

6. **POST endpoint not found (404)**

    - Ensure the server has been rebuilt (`npm run dist:dev`)
    - Check that `/api/mobile-scrapers` POST route is registered in HttpServer

## Future Enhancements

Potential improvements:

-   Add operator information display
-   Refresh cache on device connect/disconnect
-   Filter devices by region/operator
-   Real-time updates via NocoDB webhooks
-   Undo/redo for region changes
-   Bulk update regions across multiple devices
