export declare const dimensionResolvers: {
    groupBy: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    groupByEach: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    combine: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    default: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    join: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    leftJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    rightJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    fullJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    innerJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    leftOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    rightOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
    fullOuterJoin: (tree: DocumentNode, query: any, knex: import("knex").Knex<any, any[]>) => any;
};
