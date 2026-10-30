const { ApiError, requireValue } = require('./validation');

function parse(query, field, fallback) {
    if (query[field] === undefined) return fallback;
    try {
        requireValue(typeof query[field] === 'string', `${field} must be JSON encoded.`);
        return JSON.parse(query[field]);
    } catch {
        throw new ApiError(400, `${field} must contain valid JSON.`);
    }
}

function objectParameter(query, field) {
    const value = parse(query, field, {});
    requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${field} must be a JSON object.`);
    return value;
}

function selection(query) {
    const select = objectParameter(query, 'select');
    const entries = Object.entries(select);
    requireValue(entries.every(([key, value]) => !key.startsWith('$') && (value === 0 || value === 1)), 'Select values must be 0 or 1.');
    const modes = new Set(entries.filter(([key]) => key !== '_id').map(([, value]) => value));
    requireValue(modes.size <= 1, 'Select cannot mix included and excluded fields, except for _id.');
    return select;
}

function collectionQuery(query, defaultLimit) {
    const where = objectParameter(query, 'where');
    const sort = objectParameter(query, 'sort');
    const select = selection(query);
    const skip = parse(query, 'skip', 0);
    const limit = parse(query, 'limit', defaultLimit);
    const count = parse(query, 'count', false);
    requireValue(Object.entries(sort).every(([key, value]) => !key.startsWith('$') && (value === 1 || value === -1)), 'Sort values must be 1 or -1.');
    requireValue(Number.isSafeInteger(skip) && skip >= 0, 'Skip must be a nonnegative integer.');
    requireValue(Number.isSafeInteger(limit) && limit >= 0, 'Limit must be a nonnegative integer.');
    requireValue(typeof count === 'boolean', 'Count must be true or false.');
    return { where, sort, select, skip, limit, count };
}

module.exports = { selection, collectionQuery };
