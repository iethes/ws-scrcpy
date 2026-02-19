# Device Listing and Reconnection

## Overview

The device list displays all devices from the NocoDB database, showing both connected and disconnected devices with their current state.

## Device List Architecture

### Components

1. **NocoDBApi** (`src/server/services/NocoDBApi.ts`)

    - Server-side API client that directly queries NocoDB REST API
    - Fetches all devices with pagination support
    - Implements 60-second cache TTL
    - Returns devices as `Map<string, MobileScraperRecord>`

2. **ControlCenter** (`src/server/goog-device/services/ControlCenter.ts`)

    - Central device manager
    - Uses `NocoDBApi` to fetch all known devices on initialization
    - Maintains two maps:
        - `descriptors`: Map of all devices (connected + disconnected) shown in UI
        - `deviceMap`: Map of active Device instances (only connected devices)
    - Auto-refreshes device list every 60 seconds
    - Emits device update events via WebSocket

3. **DeviceTracker Middleware** (`src/server/goog-device/mw/DeviceTracker.ts`)

    - WebSocket handler for device list communication
    - Sends initial device list to clients on connection
    - Forwards device update events to clients

4. **DeviceTracker Client** (`src/app/googDevice/client/DeviceTracker.ts`)
    - Frontend client that receives device updates via WebSocket
    - Renders device list in UI
    - Handles Reconnect button clicks

### Initialization Flow

```
1. ControlCenter.init()
   └─> refreshAllKnownDevices()
       └─> NocoDBApi.getMobileScraperData()
           └─> Fetches all devices from NocoDB
               └─> updateDeviceList()
                   └─> Creates descriptors for all devices
                       └─> Emits device events

2. ControlCenter.init() (continued)
   └─> startTracker()
       └─> ADB tracker starts listening for device changes

3. ControlCenter.init() (continued)
   └─> client.listDevices()
       └─> Gets currently connected ADB devices
           └─> handleConnected() for each
               └─> Updates state to 'device'
```

### Device States

-   **`device`**: Device is connected via ADB

    -   Shows as active/green in UI
    -   Full device properties available
    -   Can start/stop scrcpy server
    -   Can take screenshots

-   **`disconnected`**: Device is in NocoDB but not connected via ADB
    -   Shows as inactive/gray in UI
    -   Shows "Reconnect" button
    -   Device properties from NocoDB only
    -   Cannot interact with device

## Reconnection Feature

### Purpose

Allows users to reconnect disconnected devices via ADB without manually running `adb connect` commands.

### Flow

```
User clicks "Reconnect" button
    ↓
DeviceTracker.onActionButtonClick()
    ↓
Sends WebSocket message with:
    - udid: device ID (e.g., "10.121.17.228:55555")
    - ipv4: IP address (e.g., "10.121.17.228")
    - port: Port (e.g., 5555)
    ↓
DeviceTracker middleware receives message
    ↓
ControlCenter.runCommand(RECONNECT_DEVICE)
    ↓
Check if device exists in deviceMap
    ├─ If YES: Use existing Device instance
    └─ If NO: Create new Device instance (for disconnected devices)
        ↓
Device.reconnect(ipv4, port)
    ↓
Spawns: adb connect 10.121.17.228:5555
    ↓
ADB tracker detects new connection
    ↓
Device state changes to 'device'
    ↓
UI updates to show device as connected
```

### Key Implementation Details

1. **On-Demand Device Creation**:

    - Disconnected devices only exist in `descriptors` map
    - When Reconnect is clicked, a Device instance is created if not in `deviceMap`
    - This allows reconnection without device being previously connected

2. **Port Handling**:

    - NocoDB `ztnet_ip` field contains IP:port (e.g., `10.121.17.228:55555`)
    - Port is extracted and stored in `connection.port` property
    - Reconnect uses exact port from NocoDB (doesn't assume 5555)

3. **Network Interface Preservation**:

    - Disconnected devices retain their network interface from NocoDB
    - Allows Reconnect button to know which IP:port to connect to

4. **Event Flow**:
    - ADB tracker detects new connection
    - `onChangeSet` handler calls `handleConnected()`
    - Device state updates to `device`
    - `onDeviceUpdate` emits descriptor to clients
    - UI shows device as connected

## Data Flow

### NocoDB Record Structure

```typescript
interface MobileScraperRecord {
    Id: number;
    CreatedAt: string;
    UpdatedAt: string;
    ztnet_ip: string; // IP:port (e.g., "10.121.17.228:55555")
    label: string; // Device label
    regions: string; // Comma-separated regions
    loggedin: string; // Comma-separated logged-in countries
    operator: string; // Operator name
    remote_stream: string | null;
    active: boolean; // Whether device is active
}
```

### Device Descriptor Structure

```typescript
interface GoogDeviceDescriptor {
    udid: string; // IP:port from NocoDB
    state: string; // 'device' | 'disconnected'
    interfaces: NetInterface[]; // Network interfaces
    pid: number; // scrcpy server PID (-1 if not running)
    'wifi.interface': string;
    'ro.build.version.release': string;
    'ro.build.version.sdk': string;
    'ro.product.manufacturer': string;
    'ro.product.model': string;
    'ro.product.cpu.abi': string;
    'last.update.timestamp': number;
    'screenshot.path': string;
    'screenshot.timestamp': number;
    'connection.port': number; // ADB connection port
}
```

## Auto-Refresh

-   Every 60 seconds, `refreshAllKnownDevices()` is called
-   Fetches updated device list from NocoDB
-   Adds new devices to descriptors
-   Updates device states based on ADB connection
-   Removes devices that are no longer in NocoDB and not connected via ADB

## Troubleshooting

### Device not appearing in list

1. Check NocoDB has the device record
2. Verify device `active` field is `true` in NocoDB
3. Check server logs for: `Fetched X devices from NocoDB`
4. Verify environment variables:
    - `NOCODB_API_TOKEN`
    - `NOCODB_BASE_URL`
    - `NOCODB_TABLE_ID`

### Reconnect button not working

1. Check browser console for WebSocket errors
2. Check server logs for: `Created device instance for reconnection`
3. Verify ADB is accessible: `adb devices`
4. Check device is reachable: `ping <device-ip>`
5. Verify port is correct in NocoDB `ztnet_ip` field
6. Check server logs for `adb process (connect ...) exited with code 0`

### Device shows as disconnected but should be connected

1. Run `adb devices` to verify ADB connection
2. Check server logs for: `Found X ADB devices: ...`
3. Verify device IP:port matches NocoDB `ztnet_ip`
4. Check if device uses default port 5555 or custom port

## File References

-   `src/server/services/NocoDBApi.ts` - NocoDB API client
-   `src/server/goog-device/services/ControlCenter.ts` - Device list manager
-   `src/server/goog-device/mw/DeviceTracker.ts` - WebSocket middleware
-   `src/app/googDevice/client/DeviceTracker.ts` - Frontend client
-   `src/server/goog-device/Device.ts` - Device class with reconnect()
-   `src/common/ControlCenterCommand.ts` - Command definitions including RECONNECT_DEVICE
-   `src/types/GoogDeviceDescriptor.d.ts` - Device descriptor interface
