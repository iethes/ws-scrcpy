import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import SvgImage from '../../ui/SvgImage';
import { html } from '../../ui/HtmlTag';
import Util from '../../Util';
import { Attribute } from '../../Attribute';
import { DeviceState } from '../../../common/DeviceState';
import { Message } from '../../../types/Message';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';
import { NocoDBClient } from '../../../common/NocoDBClient';

const TAG = '[DeviceTracker]';

type Field = keyof GoogDeviceDescriptor | ((descriptor: GoogDeviceDescriptor) => string);
type DescriptionColumn = { title: string; field: Field };

const DESC_COLUMNS: DescriptionColumn[] = [
    {
        title: 'Net Interface',
        field: 'interfaces',
    },
    {
        title: 'Server PID',
        field: 'pid',
    },
];

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    public static readonly CREATE_DIRECT_LINKS = true;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';
    private static nocodbClient = NocoDBClient.getInstance();
    private mobileScraperData = new Map<
        string,
        { label: string; regions: string; loggedin: string; operator: string }
    >();

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.openNewConnection();
    }

    private mobileScraperDataFetched = false;

    private async ensureMobileScraperData(): Promise<void> {
        if (!this.mobileScraperDataFetched) {
            await this.fetchMobileScraperData();
            this.mobileScraperDataFetched = true;
        }
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        const fullName = decodeURIComponent(selectElement.getAttribute(Attribute.FULL_NAME) || '');
        const udid = selectElement.getAttribute(Attribute.UDID) || '';
        this.updateLink({ url, name, fullName, udid, store: true });
    };

    private updateLink(params: { url: string; name: string; fullName: string; udid: string; store: boolean }): void {
        const { url, name, fullName, udid, store } = params;
        const playerTds = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixPlayerFor}${fullName}`),
        );
        if (typeof udid !== 'string') {
            return;
        }
        if (store) {
            const localStorageKey = DeviceTracker.getLocalStorageKey(fullName || '');
            if (localStorage && name) {
                localStorage.setItem(localStorageKey, name);
            }
        }
        const action = ACTION.STREAM_SCRCPY;
        playerTds.forEach((item) => {
            item.innerHTML = '';
            const playerFullName = item.getAttribute(DeviceTracker.AttributePlayerFullName);
            const playerCodeName = item.getAttribute(DeviceTracker.AttributePlayerCodeName);
            if (!playerFullName || !playerCodeName) {
                return;
            }
            const decodedPlayerFullName = decodeURIComponent(playerFullName);
            const linkText =
                decodedPlayerFullName === 'H264 Converter' ? 'Remote Device Stream' : decodedPlayerFullName;
            const link = DeviceTracker.buildLink(
                {
                    action,
                    udid,
                    player: decodeURIComponent(playerCodeName),
                    ws: url,
                },
                linkText,
                this.params,
            );
            item.appendChild(link);
        });
    }

    onActionButtonClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        const pidString = button.getAttribute(Attribute.PID) || '';
        const command = button.getAttribute(Attribute.COMMAND) as string;
        const pid = parseInt(pidString, 10);
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: typeof udid === 'string' ? udid : undefined,
                pid: isNaN(pid) ? undefined : pid,
            },
        };

        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    };

    private static getLocalStorageKey(udid: string): string {
        return `device_list::${udid}::interface`;
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected static createInterfaceOption(name: string, url: string): HTMLOptionElement {
        const optionElement = document.createElement('option');
        optionElement.setAttribute(Attribute.URL, url);
        optionElement.setAttribute(Attribute.NAME, name);
        optionElement.innerText = `proxy over adb`;
        return optionElement;
    }

    private static titleToClassName(title: string): string {
        return title.toLowerCase().replace(/\s/g, '_');
    }

    private async fetchMobileScraperData(): Promise<void> {
        try {
            const data = await DeviceTracker.nocodbClient.getMobileScraperData();
            this.mobileScraperData.clear();
            data.forEach((record, ztnetIp) => {
                this.mobileScraperData.set(ztnetIp, {
                    label: record.label,
                    regions: record.regions,
                    loggedin: record.loggedin,
                    operator: record.operator,
                });
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(TAG, 'Failed to fetch mobile-scraper data:', errorMessage);
        }
    }

    private getDeviceLabel(device: GoogDeviceDescriptor): string {
        console.log(TAG, `Looking up label for device ${device.udid}`);
        console.log(TAG, `Cached ztnet_ips: ${Array.from(this.mobileScraperData.keys()).join(', ')}`);
        const data = this.mobileScraperData.get(device.udid);
        console.log(TAG, `Found match for ${device.udid}: ${!!data}`);
        if (data && data.label) {
            return data.label;
        }
        return `${device['ro.product.manufacturer']} ${device['ro.product.model']}`;
    }

    private renderRegionsBlock(
        services: Element,
        device: GoogDeviceDescriptor,
        regions: string,
        loggedin: string,
        _fullName: string,
        blockClass: string,
    ): void {
        const regionList = regions
            ? regions
                  .split(',')
                  .map((r) => r.trim())
                  .filter((r) => r)
            : [];
        const loggedinList = loggedin
            ? loggedin
                  .split(',')
                  .map((r) => r.trim())
                  .filter((r) => r)
            : [];
        const td = document.createElement('div');
        td.classList.add('regions', blockClass);
        const container = document.createElement('div');
        container.className = 'regions-checkboxes';
        loggedinList.forEach((country) => {
            const label = document.createElement('label');
            label.className = 'region-checkbox-label';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = country;
            checkbox.checked = regionList.includes(country);
            checkbox.className = 'region-checkbox';
            checkbox.onchange = async () => {
                const checkedBoxes = container.querySelectorAll<HTMLInputElement>('.region-checkbox:checked');
                const activeRegions = Array.from(checkedBoxes)
                    .map((cb) => cb.value)
                    .join(',');
                await this.updateRegions(device, activeRegions);
            };
            const span = document.createElement('span');
            span.textContent = country.toUpperCase();
            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });
        td.appendChild(container);
        services.appendChild(td);
    }

    private async updateRegions(device: GoogDeviceDescriptor, activeRegions: string): Promise<void> {
        try {
            const response = await fetch('/api/mobile-scrapers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ztnet_ip: device.udid, regions: activeRegions }),
            });
            if (response.ok) {
                console.log(TAG, `Updated regions for ${device.udid}: ${activeRegions}`);
                await this.fetchMobileScraperData();
            } else {
                console.error(TAG, `Failed to update regions for ${device.udid}: ${response.statusText}`);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(TAG, `Error updating regions for ${device.udid}: ${errorMessage}`);
        }
    }

    protected override onSocketMessage(event: MessageEvent): void {
        this.ensureMobileScraperData().then(() => {
            super.onSocketMessage(event);
        });
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        let selectedInterfaceUrl = '';
        let selectedInterfaceName = '';
        const blockClass = 'desc-block';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.DEVICE;
        let hasPid = false;
        const servicesId = `device_services_${fullName}`;
        const screenshotId = `screenshot_${fullName}`;
        const deviceData = this.mobileScraperData.get(device.udid);
        const row = html`<div class="device ${isActive ? 'active' : 'not-active'}">
            <div class="device-header">
                <div class="device-name">${this.getDeviceLabel(device)}</div>
                <div class="device-serial">${device.udid}</div>
                <div class="device-version">
                    <div class="release-version">${device['ro.build.version.release']}</div>
                    <div class="sdk-version">${device['ro.build.version.sdk']}</div>
                </div>
                <div class="device-state" title="State: ${device.state}"></div>
            </div>
            <div id="${servicesId}" class="services"></div>
            <div id="${screenshotId}" class="screenshot-container"></div>
        </div>`.content;
        const services = row.getElementById(servicesId);
        if (!services) {
            return;
        }

        const toggleButton = document.createElement('button');
        toggleButton.className = 'services-toggle-button';
        toggleButton.innerHTML = '▼ Services';
        toggleButton.onclick = () => {
            services.classList.toggle('services-expanded');
            toggleButton.innerHTML = services.classList.contains('services-expanded') ? '▲ Services' : '▼ Services';
        };
        services.appendChild(toggleButton);
        const servicesContent = document.createElement('div');
        servicesContent.className = 'services-content';
        services.appendChild(servicesContent);

        DeviceTracker.tools.forEach((tool) => {
            const entry = tool.createEntryForDeviceList(device, blockClass, this.params);
            if (entry) {
                if (Array.isArray(entry)) {
                    entry.forEach((item) => {
                        item && servicesContent.appendChild(item);
                    });
                } else {
                    servicesContent.appendChild(entry);
                }
            }
        });

        const streamEntry = StreamClientScrcpy.createEntryForDeviceList(device, blockClass, fullName, this.params);
        streamEntry && servicesContent.appendChild(streamEntry);

        if (deviceData) {
            this.renderRegionsBlock(services, device, deviceData.regions, deviceData.loggedin, fullName, blockClass);
        }

        const screenshotContainer = row.getElementById(screenshotId);
        if (screenshotContainer && isActive) {
            const screenshotTd = document.createElement('div');
            screenshotTd.classList.add(blockClass);
            const screenshotButton = document.createElement('button');
            screenshotButton.className = 'action-button screenshot-button active';
            screenshotButton.title = 'Take screenshot';
            screenshotButton.innerText = 'Take screenshot';
            screenshotButton.setAttribute(Attribute.UDID, device.udid);
            screenshotButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.SCREENSHOT);
            screenshotButton.onclick = this.onActionButtonClick;
            screenshotTd.appendChild(screenshotButton);
            services.appendChild(screenshotTd);

            if (device['screenshot.path']) {
                const screenshotDisplay = document.createElement('div');
                screenshotDisplay.className = 'screenshot-display';
                const img = document.createElement('img');
                img.src = device['screenshot.path'];
                img.alt = `Screenshot of ${device.udid}`;
                const timestampDisplay = document.createElement('div');
                timestampDisplay.className = 'screenshot-timestamp';
                const updateTimestamp = () => {
                    const elapsed = Math.floor((Date.now() - device['screenshot.timestamp']) / 1000);
                    if (elapsed < 60) {
                        timestampDisplay.innerText = `taken ${elapsed}s ago`;
                    } else if (elapsed < 3600) {
                        const minutes = Math.floor(elapsed / 60);
                        timestampDisplay.innerText = `taken ${minutes}m ago`;
                    } else {
                        const hours = Math.floor(elapsed / 3600);
                        timestampDisplay.innerText = `taken ${hours}h ago`;
                    }
                };
                updateTimestamp();
                setInterval(updateTimestamp, 1000);
                screenshotDisplay.appendChild(img);
                screenshotDisplay.appendChild(timestampDisplay);
                screenshotContainer.appendChild(screenshotDisplay);
            }
        }

        if (DeviceTracker.CREATE_DIRECT_LINKS) {
            const name = `${DeviceTracker.AttributePrefixPlayerFor}${fullName}`;
            StreamClientScrcpy.getPlayers().forEach((playerClass) => {
                const { playerCodeName, playerFullName } = playerClass;
                const playerTd = document.createElement('div');
                playerTd.classList.add(blockClass);
                playerTd.setAttribute('name', encodeURIComponent(name));
                playerTd.setAttribute(DeviceTracker.AttributePlayerFullName, encodeURIComponent(playerFullName));
                playerTd.setAttribute(DeviceTracker.AttributePlayerCodeName, encodeURIComponent(playerCodeName));
                if (playerFullName === 'H264 Converter') {
                    services.appendChild(playerTd);
                } else {
                    servicesContent.appendChild(playerTd);
                }
            });
        }

        DESC_COLUMNS.forEach((item) => {
            const { title } = item;
            const fieldName = item.field;
            let value: string;
            if (typeof item.field === 'string') {
                value = '' + device[item.field];
            } else {
                value = item.field(device);
            }
            const td = document.createElement('div');
            td.classList.add(DeviceTracker.titleToClassName(title), blockClass);
            servicesContent.appendChild(td);
            if (fieldName === 'pid') {
                hasPid = value !== '-1';
                const actionButton = document.createElement('button');
                actionButton.className = 'action-button kill-server-button';
                actionButton.setAttribute(Attribute.UDID, device.udid);
                actionButton.setAttribute(Attribute.PID, value);
                let command: string;
                if (isActive) {
                    actionButton.classList.add('active');
                    actionButton.onclick = this.onActionButtonClick;
                    if (hasPid) {
                        command = ControlCenterCommand.KILL_SERVER;
                        actionButton.title = 'Kill server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.CANCEL));
                    } else {
                        command = ControlCenterCommand.START_SERVER;
                        actionButton.title = 'Start server';
                        actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    }
                    actionButton.setAttribute(Attribute.COMMAND, command);
                } else {
                    const timestamp = device['last.update.timestamp'];
                    if (timestamp) {
                        const date = new Date(timestamp);
                        actionButton.title = `Last update on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
                    } else {
                        actionButton.title = `Not active`;
                    }
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.OFFLINE));
                }
                const span = document.createElement('span');
                span.innerText = value;
                actionButton.appendChild(span);
                td.appendChild(actionButton);
            } else if (fieldName === 'interfaces') {
                const proxyInterfaceUrl = DeviceTracker.createUrl(this.params, device.udid).toString();
                const proxyInterfaceName = 'proxy';
                const localStorageKey = DeviceTracker.getLocalStorageKey(fullName);
                const lastSelected = localStorage && localStorage.getItem(localStorageKey);
                const selectElement = document.createElement('select');
                selectElement.setAttribute(Attribute.UDID, device.udid);
                selectElement.setAttribute(Attribute.FULL_NAME, fullName);
                selectElement.setAttribute(
                    'name',
                    encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`),
                );
                /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
                device.interfaces.forEach((value) => {
                    const params = {
                        ...this.params,
                        secure: false,
                        hostname: value.ipv4,
                        port: SERVER_PORT,
                    };
                    const url = DeviceTracker.createUrl(params).toString();
                    const optionElement = DeviceTracker.createInterfaceOption(value.name, url);
                    optionElement.innerText = `${value.name}: ${value.ipv4}`;
                    selectElement.appendChild(optionElement);
                    if (lastSelected) {
                        if (lastSelected === value.name || !selectedInterfaceName) {
                            optionElement.selected = true;
                            selectedInterfaceUrl = url;
                            selectedInterfaceName = value.name;
                        }
                    } else if (device['wifi.interface'] === value.name) {
                        optionElement.selected = true;
                    }
                });
                /// #else
                selectedInterfaceUrl = proxyInterfaceUrl;
                selectedInterfaceName = proxyInterfaceName;
                td.classList.add('hidden');
                /// #endif
                if (isActive) {
                    const adbProxyOption = DeviceTracker.createInterfaceOption(proxyInterfaceName, proxyInterfaceUrl);
                    if (lastSelected === proxyInterfaceName || !selectedInterfaceName) {
                        adbProxyOption.selected = true;
                        selectedInterfaceUrl = proxyInterfaceUrl;
                        selectedInterfaceName = proxyInterfaceName;
                    }
                    selectElement.appendChild(adbProxyOption);
                    const actionButton = document.createElement('button');
                    actionButton.className = 'action-button update-interfaces-button active';
                    actionButton.title = `Update information`;
                    actionButton.appendChild(SvgImage.create(SvgImage.Icon.REFRESH));
                    actionButton.setAttribute(Attribute.UDID, device.udid);
                    actionButton.setAttribute(Attribute.COMMAND, ControlCenterCommand.UPDATE_INTERFACES);
                    actionButton.onclick = this.onActionButtonClick;
                    td.appendChild(actionButton);
                }
                selectElement.onchange = this.onInterfaceSelected;
                td.appendChild(selectElement);
            } else {
                td.innerText = value;
            }
        });

        tbody.appendChild(row);
        if (DeviceTracker.CREATE_DIRECT_LINKS && hasPid && selectedInterfaceUrl) {
            this.updateLink({
                url: selectedInterfaceUrl,
                name: selectedInterfaceName,
                fullName,
                udid: device.udid,
                store: false,
            });
        }
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}
