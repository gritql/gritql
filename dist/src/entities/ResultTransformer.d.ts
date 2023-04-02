import { ResultProcessor } from './ResultProcessor';
export declare class ResultTransformer {
    resultProcessors: ResultProcessor[];
    constructor();
    use(processor: ResultProcessor): void;
}
