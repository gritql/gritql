export declare const dimensionResolvers: {
    groupBy: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    groupByEach: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    combine: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    default: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    join: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    leftJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    rightJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    fullJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    innerJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    leftOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    rightOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
    fullOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => void;
};
