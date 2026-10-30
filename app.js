const express = require('express');
const { ApiError } = require('./lib/validation');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
    res.set('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
require('./routes')(app, express.Router());
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.', data: null }));
app.use((error, req, res, next) => {
    let status = 500;
    let message = 'An unexpected server error occurred. Please try again later.';
    if (error instanceof ApiError) {
        status = error.status;
        message = error.message;
    } else if (error.type === 'entity.parse.failed') {
        status = 400;
        message = 'The request body must contain valid JSON.';
    } else if (error.type === 'entity.too.large') {
        status = 400;
        message = 'The request body is too large.';
    } else if (error.code === 11000) {
        status = 400;
        message = 'That email is already used by another user.';
    } else if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError' ||
        (error.name === 'Error' && /^Can't use \$/.test(error.message))) {
        status = 400;
        message = 'A field or query contains an invalid value.';
    } else if (error.name === 'MongoServerError' && [2, 9, 14, 72, 159, 168, 31253, 31254].includes(error.code)) {
        status = 400;
        message = 'The query contains an invalid filter, sort, or field selection.';
    }
    res.status(status).json({ message, data: null });
});

module.exports = app;
