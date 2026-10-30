require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const app = require('./app');
const User = require('./models/user');
const Task = require('./models/task');

async function start() {
    if (!process.env.MONGODB_URI) throw new Error('missing configuration');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([User.init(), Task.init()]);
    const server = app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
        console.log(`Server running on port ${server.address().port}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            server.close(async () => {
                await mongoose.disconnect();
                process.exit(0);
            });
        });
    }
}

start().catch(() => {
    console.error('Unable to start the API. Check MONGODB_URI and database network access.');
    process.exit(1);
});
