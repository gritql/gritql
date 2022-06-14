"use strict";
exports.__esModule = true;
exports.changeQueryTable = exports.join = exports.Kind = exports.getEnumKeyByValue = exports.JoinType = void 0;
var wrapper_1 = require("./dimensions/wrapper");
var filters_1 = require("./filters");
var wrapper_2 = require("./metrics/wrapper");
var types_1 = require("./types");
var JoinType;
(function (JoinType) {
    JoinType["DEFAULT"] = "join";
    JoinType["LEFT"] = "leftJoin";
    JoinType["RIGHT"] = "rightJoin";
    JoinType["FULL"] = "fullJoin";
    JoinType["INNER"] = "innerJoin";
    JoinType["LEFT_OUTER"] = "leftOuterJoin";
    JoinType["RIGHT_OUTER"] = "rightOuterJoin";
    JoinType["FULL_OUTER"] = "fullOuterJoin";
})(JoinType = exports.JoinType || (exports.JoinType = {}));
function getEnumKeyByValue(enumObj, value) {
    var index = Object.values(enumObj).indexOf(value);
    return Object.keys(enumObj)[index];
}
exports.getEnumKeyByValue = getEnumKeyByValue;
var Kind;
(function (Kind) {
    Kind["DIMENSION"] = "dimension";
    Kind["METRIC"] = "metric";
})(Kind = exports.Kind || (exports.Kind = {}));
function join(type, kind) {
    if (kind === void 0) { kind = Kind.METRIC; }
    return (kind === Kind.METRIC ? wrapper_2.metricWrapper : wrapper_1.dimensionWrapper)(function Join(_, args, query, knex, extras) {
        if (!args.table)
            throw "Join function requires 'table' as argument";
        var byKeys = [
            'by',
            'by_gt',
            'by_gte',
            'by_lt',
            'by_lte',
            'by_like',
            'by_in',
        ].filter(function (key) { return args[key] !== undefined; });
        if (!byKeys.length && (!args.on || Object.keys(args.on).length === 0))
            throw "Join function requires 'by' or 'on' as argument";
        var promise;
        if (byKeys.length) {
            var filters_2 = filters_1.transformFilters((extras.tree.arguments || extras.tree.fields)
                .filter(function (_a) {
                var value = _a.name.value;
                return byKeys.includes(value);
            })
                .concat({ name: { value: 'from' }, value: { value: args.table } }), query);
            promise = query.promise[type](args.table, function () {
                var _this = this;
                filters_2.forEach(function (_a, index) {
                    var _ = _a[0], operator = _a[1], value = _a[2];
                    var onFunc = index === 0 ? _this.on : _this.andOn;
                    var _b = value.split(':'), leftSide = _b[0], rightSide = _b[1];
                    if (!leftSide || !rightSide) {
                        throw "'by' argument inside Join function must include two fields (divided with :)";
                    }
                    leftSide = filters_1.buildFullName({}, query, leftSide);
                    rightSide = filters_1.buildFullName({ from: args.table }, query, rightSide);
                    onFunc.call(_this, leftSide, operator, rightSide);
                });
            });
        }
        else {
            promise = filters_1.applyRawJoin(query, knex, type, args.table, args.on);
        }
        query.joins = query.joins || [];
        query.joins.push(args.table);
        return promise;
    }, {
        table: types_1.PropTypes.string.isRequired,
        on: types_1.PropTypes.shape({}),
        by: types_1.PropTypes.string,
        by_lt: types_1.PropTypes.string,
        by_gt: types_1.PropTypes.string,
        by_gte: types_1.PropTypes.string,
        by_lte: types_1.PropTypes.string,
        by_like: types_1.PropTypes.string,
        by_in: types_1.PropTypes.string
    }, Array.from(new Set([
        "" + getEnumKeyByValue(JoinType, type)
            .replace('DEFAULT', 'JOIN')
            .replace('_', ' '),
        'JOIN',
        'ON',
    ])));
}
exports.join = join;
function changeQueryTable(query, knex, table, dropJoins) {
    if (table !== query.table) {
        query.table = table;
        query.promise.from(query.table);
        if (dropJoins) {
            query.joins = [];
        }
        query.search = {};
        query.preparedAdvancedFilters = filters_1.parseAdvancedFilters(query, knex, query.advancedFilters, true);
    }
    return query;
}
exports.changeQueryTable = changeQueryTable;
