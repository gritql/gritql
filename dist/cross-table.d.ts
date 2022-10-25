import { DocumentNode } from 'graphql';

export declare enum JoinType {
    DEFAULT = "join",
    LEFT = "leftJoin",
    RIGHT = "rightJoin",
    FULL = "fullJoin",
    INNER = "innerJoin",
    LEFT_OUTER = "leftOuterJoin",
    RIGHT_OUTER = "rightOuterJoin",
    FULL_OUTER = "fullOuterJoin"
}
export declare function getEnumKeyByValue<T = any>(enumObj: T, value: string): string;
export declare enum Kind {
    DIMENSION = "dimension",
    METRIC = "metric"
}
export declare function join(type: JoinType, kind?: Kind): (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
export declare function changeQueryTable(query: any, knex: any, table: string, dropJoins: boolean): any;
