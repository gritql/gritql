export interface Provider {
    client: string;
    keywords: string[];
    getConnector: () => any;
    getConnection: (conf: any, connector: any) => any;
    execute: (connection: any, sql: any) => any;
    connection?: any;
    configuration?: any;
}
export declare const providers: {
    pg: {
        client: string;
        keywords: string[];
        getConnector: () => any;
        getConnection: (configuration: any, connector: any) => any;
        execute(connection: any, sql: any): any;
    };
    snowflake: {
        client: string;
        keywords: string[];
        getConnector: () => any;
        getConnection: (configuration: any, connector: any) => any;
        execute: (connection: any, sql: any) => any;
    };
};
