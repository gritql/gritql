"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformFilters = exports.withFilters = exports.applyRawJoin = exports.applyFilters = exports.parseAdvancedFilters = exports.buildFilter = exports.buildFullName = void 0;
const _ = __importStar(require("lodash"));
const arguments_1 = require("./arguments");
const cross_table_1 = require("./cross-table");
const filterOperators = [
    'and',
    'eq',
    'gt',
    'gte',
    'in',
    'lt',
    'lte',
    'ne',
    'nin',
    'nor',
    'not',
    'or',
    'regex',
    'search',
    'from',
    'inherited',
];
function buildFullName(args, query, field, evaluateOnlyWithLinkSymbol = true) {
    args = Array.isArray(args) ? (0, arguments_1.argumentsToObject)(args) : args;
    const table = args?.from || query.table;
    if (!field?.startsWith('@') && (evaluateOnlyWithLinkSymbol || !args?.from)) {
        return field;
    }
    else {
        return `${table}.${field.replace(/^@/, '')}`;
    }
}
exports.buildFullName = buildFullName;
function runDefaultRunner(context, operator, field, subQuery) {
    return runOrSkip(context, typeof operator === 'string'
        ? ({ key, value, isField, context }) => context.knex.raw(`?? ${operator} ${isField ? '??' : '?'}`, [
            key,
            value,
        ])
        : operator, ({ context }) => buildFullName({ ...context, from: context.from || context.query.table }, context.query, field, false), '', context.valueTransformer(context, field, subQuery));
}
function runOrSkip(context, runner, key, accum, value) {
    let ctx = context;
    if (typeof key === 'function') {
        key = key({ context: ctx });
    }
    if (key === 'from') {
        if (!ctx.ignoreFrom) {
            ctx.from = value;
        }
        return accum;
    }
    else if (key === 'inherited') {
        ctx.inherited = value;
        return accum;
    }
    if (ctx.onlyInherited &&
        ctx.inherited === false &&
        ![ctx.query.table, ...ctx.query.joins].includes(ctx.from || ctx.query.table)) {
        return accum;
    }
    else {
        const v = value?.isField ? value.value : value?.value || value;
        return runner({ key, value: v, isField: value?.isField, context: ctx });
    }
}
function getCombineRunner(accum, runner, combiner = 'AND') {
    const res = runner();
    if (res) {
        if (accum) {
            return `${accum} ${combiner} (${res})`;
        }
        else {
            return `(${res})`;
        }
    }
    else {
        return accum;
    }
}
function buildFilter(query, context, prefix = '') {
    const ops = _.mapValues(_.keyBy(filterOperators), (op) => `${prefix}${op}`);
    const isOp = (key) => _.includes(_.values(ops), key);
    const getOp = (key) => (isOp(key) ? key : null);
    const sub = (subQuery, op, field, context) => {
        switch (op) {
            case ops.and:
                return runOrSkip(context, ({ context }) => '(' +
                    _.reduce(subQuery, (accum, cur) => {
                        return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => buildFilter(cur, context, prefix)), '', accum, cur);
                    }, '') +
                    ')', '', '', subQuery);
            case ops.or:
                return runOrSkip(context, ({ context }) => '(' +
                    _.reduce(subQuery, (accum, cur) => {
                        return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => buildFilter(cur, context, prefix), 'OR'), '', accum, '');
                    }, '') +
                    ')', '', '', subQuery);
            case ops.nor:
                return runOrSkip(context, ({ context }) => 'NOT (' +
                    _.reduce(subQuery, (accum, cur) => {
                        return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => buildFilter(cur, context, prefix), 'OR'), '', accum, cur);
                    }, '') +
                    ')', '', '', subQuery);
            case ops.in:
                if (!_.isArray(subQuery)) {
                    throw 'IN requries array value';
                }
                return runDefaultRunner(context, ({ key: k, value: v, context }) => context.knex.raw(`?? IN (${_.map(subQuery, () => '?').join(',')})`, [k, ...v]), field, subQuery);
            case ops.nin:
                if (!_.isArray(subQuery)) {
                    throw 'NIN requries array value';
                }
                return runDefaultRunner(context, ({ key: k, value: v, context }) => context.knex.raw(`?? NOT IN(${_.map(subQuery, () => '?').join(',')})`, [k, ...v]), field, subQuery);
            case ops.eq:
                return runDefaultRunner(context, '=', field, subQuery);
            case ops.gt:
                return runDefaultRunner(context, '>', field, subQuery);
            case ops.gte:
                return runDefaultRunner(context, '>=', field, subQuery);
            case ops.lt:
                return runDefaultRunner(context, '<', field, subQuery);
            case ops.lte:
                return runDefaultRunner(context, '<=', field, subQuery);
            case ops.ne:
                return runDefaultRunner(context, '<>', field, subQuery);
            case ops.not:
                return runOrSkip(context, () => `NOT (${buildFilter(subQuery, context, prefix)})`, '', '', subQuery);
            case ops.regex:
                return runDefaultRunner(context, 'LIKE', field, subQuery);
            case ops.search:
                if (_.isObject(subQuery)) {
                    if (_.every(subQuery, isOp)) {
                        throw 'At least one property of search must be related to field';
                    }
                    if (!context.query.providers[context.query.provider].keywords.includes('TO_TSVECTOR')) {
                        throw new Error(`Full text search is not supported by ${context.query.provider} provider`);
                    }
                    return _.reduce(subQuery, (accum, v, k) => {
                        if (isOp(k)) {
                            return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => sub(v, getOp(k), field, { ...context })), k, accum, v);
                        }
                        const key = buildFullName({ ...context, from: context.from || context.query.table }, context.query, k, false);
                        const value = context.valueTransformer(context, k, v);
                        const transformedValue = value?.isField
                            ? value.value
                            : value?.value || value;
                        if (context.query.search?.[key]) {
                            throw `Search for ${key} already defined`;
                        }
                        context.query.search = {
                            ...context.query.search,
                            [key]: context.query.search?.[key] || value,
                        };
                        const tsQuery = context.knex.raw(`to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ${value?.isField ? '??' : '?'})::text || ':*')::tsquery`, [key, transformedValue]);
                        return runOrSkip(context, () => (accum ? `${accum} AND ${tsQuery}` : tsQuery), key, accum, value);
                    }, '');
                }
                else {
                    throw 'Search filter requires object value';
                }
            default:
                return _.isObject(subQuery)
                    ? _.reduce(subQuery, (accum, v, k) => {
                        return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => sub(v, getOp(k), field, { ...context })), k, accum, v);
                    }, '')
                    : field
                        ? runDefaultRunner(context, '=', field, subQuery)
                        : subQuery;
        }
    };
    return _.reduce(query, (accum, subQuery, key) => {
        const field = isOp(key) ? null : key;
        const op = isOp(key) ? key : null;
        return runOrSkip(context, ({ context }) => getCombineRunner(accum, () => sub(subQuery, op, field, { ...context })), key, accum, subQuery);
    }, '');
}
exports.buildFilter = buildFilter;
function parseAdvancedFilters(query, knex, filters, onlyInherited, from) {
    const result = {
        where: '',
        having: '',
    };
    if (filters) {
        let where = _.omit(filters, ['having']);
        if (from) {
            where = { ...where, from };
        }
        result.where = buildFilter(where, {
            query,
            knex,
            onlyInherited,
            valueTransformer(context, k, v) {
                return v;
            },
        });
        if (filters.having) {
            let having = filters.having;
            if (from) {
                having = { ...having, from };
            }
            result.having = buildFilter(having, {
                query,
                knex,
                onlyInherited,
                valueTransformer(context, k, v) {
                    return v;
                },
            });
        }
    }
    return result;
}
exports.parseAdvancedFilters = parseAdvancedFilters;
function applyFilters(query, knexPipe, knex) {
    if (query.preparedAdvancedFilters?.where) {
        knexPipe.where(knex.raw(query.preparedAdvancedFilters.where));
    }
    if (query.preparedAdvancedFilters?.having) {
        knexPipe.having(knex.raw(query.preparedAdvancedFilters.having));
    }
    return knexPipe;
}
exports.applyFilters = applyFilters;
function applyRawJoin(query, knex, joinType, from, on) {
    query.joins = query.joins || [];
    query.joins.push(from);
    return (query.promise = query.promise.joinRaw(`${joinType
        .split(/(?=[A-Z])/)
        .join(' ')
        .toUpperCase()} ?? ON ${buildFilter(on, {
        query,
        knex,
        from,
        ignoreFrom: true,
        valueTransformer(context, k, v) {
            if (typeof v === 'string') {
                return {
                    value: buildFullName({ context, from: context.query.table }, context.query, v, true),
                    isField: v?.startsWith('@'),
                };
            }
            else {
                return v;
            }
        },
    })}`, [from]));
}
exports.applyRawJoin = applyRawJoin;
function withFilters(filters) {
    return (knexPipe, knex) => {
        return filters.reduce((knexNext, filter, i) => {
            const selector = filter[1] === 'in' ? 'whereIn' : i === 0 ? 'where' : 'andWhere';
            return knexNext[selector].apply(knexNext, filter[1] === 'in'
                ? filter.filter((a) => a !== 'in')
                : filter[1] === 'search'
                    ? [
                        knex.raw(`to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery`, [filter[0], filter[2]]),
                    ]
                    : filter);
        }, knexPipe);
    };
}
exports.withFilters = withFilters;
function transformFilters(args, query, knex) {
    return args.reduce((res, arg) => {
        if (arg.name.value === 'from') {
            return res;
        }
        // We need to ensure that we are not in join context
        if (!!knex) {
            if (arg.name.value === 'table') {
                (0, cross_table_1.changeQueryTable)(query, knex, arg.value.value, false);
                return res;
            }
            if (arg.name.value === 'filters') {
                query.advancedFilters = (0, arguments_1.argumentsToObject)(arg.value.fields);
                query.preparedAdvancedFilters = parseAdvancedFilters(query, knex, query.advancedFilters, true);
                return res;
            }
        }
        if (Object.values(cross_table_1.JoinType).includes(arg.name.value)) {
            if (query && knex) {
                (0, cross_table_1.join)(arg.name.value)(arg.value, query, knex);
                return res;
            }
            else {
                throw "Join can't be called inside of join";
            }
        }
        if (arg.name.value === 'search') {
            if (!query.providers[query.provider].keywords.includes('TO_TSVECTOR')) {
                throw new Error(`Full text search is not supported by ${query.provider} provider`);
            }
            const elements = (0, arguments_1.argumentsToObject)(arg.value.fields);
            console.log(elements);
            return res.concat(Object.keys(elements).reduce((accum, k) => {
                const key = buildFullName(args, query, k, false);
                const v = elements[k];
                if (query.search?.[key]) {
                    throw `Search for ${key} already defined`;
                }
                query.search = {
                    ...query.search,
                    [key]: query.search?.[key] || v,
                };
                accum.push([key, 'search', v]);
                return accum;
            }, []));
        }
        if (arg.name.value.endsWith('_gt'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_gt', ''), false),
                    '>',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_gte'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_gte', ''), false),
                    '>=',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_lt'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_lt', ''), false),
                    '<',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_lte'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_lte', ''), false),
                    '<=',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_like'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_like', ''), false),
                    'LIKE',
                    arg.value.value,
                ],
            ]);
        if (arg.name.value.endsWith('_in'))
            return res.concat([
                [
                    buildFullName(args, query, arg.name.value.replace('_in', ''), false),
                    'in',
                    arg.value.value.split('|'),
                ],
            ]);
        return res.concat([
            [buildFullName(args, query, arg.name.value, false), '=', arg.value.value],
        ]);
    }, []);
}
exports.transformFilters = transformFilters;
