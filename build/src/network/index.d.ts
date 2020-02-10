export = Network;
declare class Network {
    constructor(config: any, logger: any);
    app: any;
    sn: any;
    logger: any;
    mainLogger: any;
    netLogger: any;
    ipInfo: {};
    timeout: number;
    internalRoutes: {};
    externalRoutes: any[];
    extServer: any;
    intServer: any;
    verboseLogsNet: boolean;
    InternalTellCounter: number;
    InternalAskCounter: number;
    _setupExternal(): Promise<any>;
    _setupInternal(): Promise<void>;
    tell(nodes: any, route: any, message: any, logged?: boolean): Promise<void>;
    ask(node: any, route: any, message: any, logged?: boolean): Promise<any>;
    setup(ipInfo: any): Promise<void>;
    shutdown(): Promise<void>;
    _registerExternal(method: any, route: any, handler: any): void;
    _applyExternal(): void;
    setExternalCatchAll(handler: any): void;
    externalCatchAll: any;
    registerExternalGet(route: any, handler: any): void;
    registerExternalPost(route: any, handler: any): void;
    registerExternalPut(route: any, handler: any): void;
    registerExternalDelete(route: any, handler: any): void;
    registerExternalPatch(route: any, handler: any): void;
    registerInternal(route: any, handler: any): void;
    unregisterInternal(route: any): void;
}
