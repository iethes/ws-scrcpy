import { TrackerChangeSet } from '@dead50f7/adbkit/lib/TrackerChangeSet';
import { Device } from '../Device';
import { Service } from '../../services/Service';
import AdbKitClient from '@dead50f7/adbkit/lib/adb/client';
import { AdbExtended } from '../adb';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import Tracker from '@dead50f7/adbkit/lib/adb/tracker';
import Timeout = NodeJS.Timeout;
import { BaseControlCenter } from '../../services/BaseControlCenter';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import * as os from 'os';
import * as crypto from 'crypto';
import { DeviceState } from '../../../common/DeviceState';
import { MobileScraperRecord } from '../../../common/NocoDBClient';
import { NocoDBApi } from '../../services/NocoDBApi';

export class ControlCenter extends BaseControlCenter<GoogDeviceDescriptor> implements Service {
    private static readonly defaultWaitAfterError = 1000;
    private static instance?: ControlCenter;

    private initialized = false;
    private client: AdbKitClient = AdbExtended.createClient();
    private tracker?: Tracker;
    private waitAfterError = 1000;
    private restartTimeoutId?: Timeout;
    private deviceMap: Map<string, Device> = new Map();
    private descriptors: Map<string, GoogDeviceDescriptor> = new Map();
    private readonly id: string;
    private nocodbApi = NocoDBApi.getInstance();
    private allKnownDevices: Map<string, MobileScraperRecord> = new Map();
    private refreshAllDevicesTimeoutId?: Timeout;

    protected constructor() {
        super();
        const idString = `goog|${os.hostname()}|${os.uptime()}`;
        this.id = crypto.createHash('md5').update(idString).digest('hex');
    }

    public static getInstance(): ControlCenter {
        if (!this.instance) {
            this.instance = new ControlCenter();
        }
        return this.instance;
    }

    public static hasInstance(): boolean {
        return !!ControlCenter.instance;
    }

    private restartTracker = (): void => {
        if (this.restartTimeoutId) {
            return;
        }
        console.log(`Device tracker is down. Will try to restart in ${this.waitAfterError}ms`);
        this.restartTimeoutId = setTimeout(() => {
            this.stopTracker();
            this.waitAfterError *= 1.2;
            this.init();
        }, this.waitAfterError);
    };

    private onChangeSet = (changes: TrackerChangeSet): void => {
        this.waitAfterError = ControlCenter.defaultWaitAfterError;
        if (changes.added.length) {
            for (const item of changes.added) {
                const { id, type } = item;
                this.handleConnected(id, type);
            }
        }
        if (changes.removed.length) {
            for (const item of changes.removed) {
                const { id } = item;
                this.handleConnected(id, DeviceState.DISCONNECTED);
            }
        }
        if (changes.changed.length) {
            for (const item of changes.changed) {
                const { id, type } = item;
                this.handleConnected(id, type);
            }
        }
    };

    private onDeviceUpdate = (device: Device): void => {
        const { udid, descriptor } = device;
        this.descriptors.set(udid, descriptor);
        this.emit('device', descriptor);
    };

    private handleConnected(udid: string, state: string): void {
        let device = this.deviceMap.get(udid);
        if (device) {
            const existingDescriptor = this.descriptors.get(udid);
            device.setState(state);
            if (state !== DeviceState.DEVICE && existingDescriptor) {
                device.descriptor.interfaces = [...existingDescriptor.interfaces];
            }
        } else {
            device = new Device(udid, state);
            device.on('update', this.onDeviceUpdate);
            this.deviceMap.set(udid, device);
        }
    }

    private async refreshAllKnownDevices(): Promise<void> {
        try {
            this.allKnownDevices = await this.nocodbApi.getMobileScraperData();
            const visibleDevices = Array.from(this.allKnownDevices.entries()).filter(([, record]) =>
                this.nocodbApi.matchesOrchestrator(record),
            );
            console.log(
                `[${this.getName()}] Fetched ${visibleDevices.length} visible devices from ${
                    this.allKnownDevices.size
                } NocoDB records`,
            );
            console.log(`[${this.getName()}] Known devices: ${visibleDevices.map(([ztnetIp]) => ztnetIp).join(', ')}`);
            await this.updateDeviceList();
        } catch (error) {
            console.error(`[${this.getName()}] Error refreshing known devices:`, error);
        }
    }

    private async updateDeviceList(): Promise<void> {
        const oldDevices = new Set(this.descriptors.keys());
        const newDevices = new Set<string>();
        console.log(
            `[${this.getName()}] Updating device list. Current descriptors: ${this.descriptors.size}, Known devices: ${
                this.allKnownDevices.size
            }`,
        );

        for (const [ztnetIp, record] of this.allKnownDevices.entries()) {
            if (!this.nocodbApi.matchesOrchestrator(record)) {
                continue;
            }
            newDevices.add(ztnetIp);
            let descriptor = this.descriptors.get(ztnetIp);
            const device = this.deviceMap.get(ztnetIp);
            const isConnected = device?.isConnected() ?? false;

            if (!descriptor) {
                console.log(
                    `[${this.getName()}] Creating new descriptor for ${ztnetIp} (ADB connected: ${isConnected})`,
                );
                descriptor = this.createDescriptorFromNocoDBRecord(record);
                if (isConnected) {
                    descriptor.state = DeviceState.DEVICE;
                }
                this.descriptors.set(ztnetIp, descriptor);
                console.log(`[${this.getName()}] Emitting new device: ${ztnetIp}`);
                this.emit('device', descriptor);
            } else {
                const wasConnected = descriptor.state === DeviceState.DEVICE;

                if (wasConnected && !isConnected && descriptor.state !== DeviceState.DISCONNECTED) {
                    descriptor.state = DeviceState.DISCONNECTED;
                    descriptor.pid = -1;
                    console.log(`[${this.getName()}] Device disconnected: ${ztnetIp}`);
                    this.emit('device', descriptor);
                } else if (!wasConnected && isConnected && descriptor.state !== DeviceState.DEVICE) {
                    descriptor.state = DeviceState.DEVICE;
                    console.log(`[${this.getName()}] Device reconnected: ${ztnetIp}`);
                    this.emit('device', descriptor);
                }
            }
        }

        for (const oldDevice of oldDevices) {
            if (!newDevices.has(oldDevice) && !this.deviceMap.has(oldDevice)) {
                console.log(`[${this.getName()}] Removing device: ${oldDevice}`);
                this.descriptors.delete(oldDevice);
            }
        }

        console.log(`[${this.getName()}] Device list updated. Total descriptors: ${this.descriptors.size}`);
    }

    private createDescriptorFromNocoDBRecord(record: MobileScraperRecord): GoogDeviceDescriptor {
        const [ipOnly, portStr] = record.ztnet_ip.split(':');
        const port = portStr ? parseInt(portStr, 10) : 5555;
        const descriptor = {
            udid: record.ztnet_ip,
            state: DeviceState.DISCONNECTED,
            interfaces: [{ name: 'default', ipv4: ipOnly }],
            pid: -1,
            'wifi.interface': '',
            'ro.build.version.release': '',
            'ro.build.version.sdk': '',
            'ro.product.manufacturer': '',
            'ro.product.model': '',
            'ro.product.cpu.abi': '',
            'last.update.timestamp': Date.now(),
            'screenshot.path': '',
            'screenshot.timestamp': 0,
            'connection.port': port,
        };
        console.log(`[${this.getName()}] Created descriptor for device: ${record.ztnet_ip} (${record.label})`);
        return descriptor;
    }

    public async init(): Promise<void> {
        if (this.initialized) {
            return;
        }
        await this.refreshAllKnownDevices();
        this.tracker = await this.startTracker();
        const list = await this.client.listDevices();
        console.log(`[${this.getName()}] Found ${list.length} ADB devices: ${list.map((d) => d.id).join(', ')}`);
        list.forEach((device) => {
            const { id, type } = device;
            this.handleConnected(id, type);
        });
        this.startAllDevicesRefresh();
        this.initialized = true;
    }

    private startAllDevicesRefresh(): void {
        const refreshInterval = 60000;
        this.refreshAllDevicesTimeoutId = setInterval(() => {
            this.refreshAllKnownDevices();
        }, refreshInterval);
    }

    private stopAllDevicesRefresh(): void {
        if (this.refreshAllDevicesTimeoutId) {
            clearInterval(this.refreshAllDevicesTimeoutId);
            this.refreshAllDevicesTimeoutId = undefined;
        }
    }

    private async startTracker(): Promise<Tracker> {
        if (this.tracker) {
            return this.tracker;
        }
        const tracker = await this.client.trackDevices();
        tracker.on('changeSet', this.onChangeSet);
        tracker.on('end', this.restartTracker);
        tracker.on('error', this.restartTracker);
        return tracker;
    }

    private stopTracker(): void {
        if (this.tracker) {
            this.tracker.off('changeSet', this.onChangeSet);
            this.tracker.off('end', this.restartTracker);
            this.tracker.off('error', this.restartTracker);
            this.tracker.end();
            this.tracker = undefined;
        }
        this.tracker = undefined;
        this.initialized = false;
    }

    public getDevices(): GoogDeviceDescriptor[] {
        return Array.from(this.descriptors.values());
    }

    public getDevice(udid: string): Device | undefined {
        return this.deviceMap.get(udid);
    }

    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return `aDevice Tracker [${os.hostname()}]`;
    }

    public start(): Promise<void> {
        return this.init().catch((e) => {
            console.error(`Error: Failed to init "${this.getName()}". ${e.message}`);
        });
    }

    public release(): void {
        this.stopAllDevicesRefresh();
        this.stopTracker();
    }

    public async runCommand(command: ControlCenterCommand): Promise<void> {
        const udid = command.getUdid();
        let device = this.getDevice(udid);
        if (!device) {
            if (command.getType() !== ControlCenterCommand.RECONNECT_DEVICE) {
                console.error(`Device with udid:"${udid}" not found`);
                return;
            }
            device = new Device(udid, DeviceState.DISCONNECTED);
            device.on('update', this.onDeviceUpdate);
            this.deviceMap.set(udid, device);
            console.log(`[${this.getName()}] Created device instance for reconnection: ${udid}`);
        }
        const type = command.getType();
        switch (type) {
            case ControlCenterCommand.KILL_SERVER:
                await device.killServer(command.getPid());
                return;
            case ControlCenterCommand.START_SERVER:
                await device.startServer();
                return;
            case ControlCenterCommand.UPDATE_INTERFACES:
                await device.updateInterfaces();
                return;
            case ControlCenterCommand.SCREENSHOT:
                await this.handleScreenshot(device);
                return;
            case ControlCenterCommand.RECONNECT_DEVICE:
                await device.reconnect(command.getIpv4(), command.getPort());
                return;
            default:
                throw new Error(`Unsupported command: "${type}"`);
        }
    }

    private async handleScreenshot(device: Device): Promise<void> {
        const screenshotPath = await device.captureScreenshot();
        const descriptor = device.descriptor;
        descriptor['screenshot.path'] = screenshotPath;
        descriptor['screenshot.timestamp'] = Date.now();
        this.emit('device', descriptor);
    }
}
