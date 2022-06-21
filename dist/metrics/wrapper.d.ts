import type { DocumentNode } from 'graphql';
import type { InferProps, ValidationMap } from 'prop-types';
import { Knex } from 'knex';
declare const defaultPropTypes: {
    sort: any;
    limit: any;
    offset: any;
};
export declare const metricWrapper: <T = ValidationMap<any>>(metric: (alias: string, args: import("prop-types").InferPropsInner<Pick<T, import("prop-types").RequiredKeys<T>>> & Partial<import("prop-types").InferPropsInner<Pick<T, Exclude<keyof T, import("prop-types").RequiredKeys<T>>>>> & import("prop-types").InferPropsInner<Pick<{
    sort: any;
    limit: any;
    offset: any;
}, never>> & Partial<import("prop-types").InferPropsInner<Pick<{
    sort: any;
    limit: any;
    offset: any;
}, "sort" | "offset" | "limit">>>, query: any, knex: Knex, extras: {
    tree: DocumentNode;
}) => void, properties?: T, keywords?: string[]) => (tree: DocumentNode, query: any, knex: Knex) => void;
export {};
