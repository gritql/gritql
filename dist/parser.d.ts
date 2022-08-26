export declare function parseMetric(tree: any, query: any, knex: any): any;
export declare function parseDimension(tree: any, query: any, knex: any): any;
export declare function parseFilters(tree: any, query: any, knex: any): any;
export declare const defaultTypes: {
    Any: any;
    Number: any;
    String: any;
    Bool: any;
    Object: any;
    Array: any;
};
export declare function parseType(type: any, context: any): any;
export declare function parseVariableDefinition(def: any, context: any): any;
export declare function processArguments(args: any, context: any): any;
export declare function processSelections(selections: any, field: any, query: any, context: any): any;
export declare function compileFragment(fragment: any, context: any, query: any, arglist: any): any;
