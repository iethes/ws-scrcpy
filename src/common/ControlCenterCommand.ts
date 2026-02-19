import { WDAMethod } from './WDAMethod';

export class ControlCenterCommand {
    public static KILL_SERVER = 'kill_server';
    public static START_SERVER = 'start_server';
    public static UPDATE_INTERFACES = 'update_interfaces';
    public static CONFIGURE_STREAM = 'configure_stream';
    public static RUN_WDA = 'run-wda';
    public static REQUEST_WDA = 'request-wda';
    public static SCREENSHOT = 'screenshot';
    public static RECONNECT_DEVICE = 'reconnect_device';

    private id = -1;
    private type = '';
    private pid = 0;
    private udid = '';
    private method = '';
    private args?: any;
    private data?: any;
    private ipv4 = '';
    private port = 5555;

    public static fromJSON(json: string): ControlCenterCommand {
        const body = JSON.parse(json);
        if (!body) {
            throw new Error('Invalid input');
        }
        const command = new ControlCenterCommand();
        const data = (command.data = body.data);
        command.id = body.id;
        command.type = body.type;

        if (typeof data.udid === 'string') {
            command.udid = data.udid;
        }
        if (typeof data.ipv4 === 'string') {
            command.ipv4 = data.ipv4;
        }
        if (typeof data.port === 'number') {
            command.port = data.port;
        }
        switch (body.type) {
            case ControlCenterCommand.KILL_SERVER:
                if (typeof data.pid !== 'number' && data.pid <= 0) {
                    throw new Error('Invalid "pid" value');
                }
                command.pid = data.pid;
                return command;
            case ControlCenterCommand.REQUEST_WDA:
                if (typeof data.method !== 'string') {
                    throw new Error('Invalid "method" value');
                }
                command.method = data.method;
                command.args = data.args;
                return command;
            case ControlCenterCommand.START_SERVER:
            case ControlCenterCommand.UPDATE_INTERFACES:
            case ControlCenterCommand.CONFIGURE_STREAM:
            case ControlCenterCommand.RUN_WDA:
            case ControlCenterCommand.SCREENSHOT:
            case ControlCenterCommand.RECONNECT_DEVICE:
                return command;
            default:
                throw new Error(`Unknown command "${body.command}"`);
        }
    }

    public getType(): string {
        return this.type;
    }
    public getPid(): number {
        return this.pid;
    }
    public getUdid(): string {
        return this.udid;
    }
    public getId(): number {
        return this.id;
    }
    public getMethod(): WDAMethod | string {
        return this.method;
    }
    public getData(): any {
        return this.data;
    }
    public getArgs(): any {
        return this.args;
    }
    public getIpv4(): string {
        return this.ipv4;
    }
    public getPort(): number {
        return this.port;
    }
}
