"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryTransformer = void 0;
class QueryTransformer {
    constructor() {
        this.queryProcessors = [];
    }
    build(table, tree, queries = [], idx = undefined, builder, options, context = {
        fragments: {},
        types: {},
        variablesValidator: {},
        variables: {},
        typeDefinitions: {},
    }) {
        return [];
    }
    use(processor) {
        this.queryProcessors.push(processor);
    }
}
exports.QueryTransformer = QueryTransformer;
