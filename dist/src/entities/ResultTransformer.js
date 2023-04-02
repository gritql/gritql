"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultTransformer = void 0;
class ResultTransformer {
    constructor() {
        this.resultProcessors = [];
    }
    use(processor) {
        this.resultProcessors.push(processor);
    }
}
exports.ResultTransformer = ResultTransformer;
