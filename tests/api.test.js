const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/user');
const Task = require('../models/task');

let database;
let server;
let base;
const missingId = '000000000000000000000001';
const deadline = '2026-11-03T23:59:00-06:00';

before(async () => {
    database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(database.getUri());
    await Promise.all([User.init(), Task.init()]);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    if (database) await database.stop();
});

beforeEach(async () => {
    await Task.deleteMany({});
    await User.deleteMany({});
});

async function request(path, method = 'GET', body, expected = 200) {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${path}: ${text}`);
    if (expected === 204) {
        assert.equal(text, '');
        return;
    }
    const result = JSON.parse(text);
    assert.deepEqual(Object.keys(result).sort(), ['data', 'message']);
    assert.equal(typeof result.message, 'string');
    if (expected >= 400) {
        assert.ok(result.message.length > 0);
        assert.doesNotMatch(result.message, /mongoose|MongoServer|CastError|E11000|stack/i);
    }
    return result.data;
}

async function user(name = 'Alice', extra = {}) {
    return request('/users', 'POST', { name, email: `${name}@example.com`, ...extra }, 201);
}

async function task(extra = {}) {
    return request('/tasks', 'POST', { name: 'Finish MP3', deadline, ...extra }, 201);
}

async function snapshot() {
    return JSON.stringify({ users: await User.find().sort('_id').lean(), tasks: await Task.find().sort('_id').lean() });
}

async function consistent() {
    const users = await User.find().lean();
    const tasks = await Task.find().lean();
    for (const u of users) {
        assert.equal(new Set(u.pendingTasks).size, u.pendingTasks.length);
        const actual = tasks.filter(t => t.assignedUser === u._id.toString() && !t.completed).map(t => t._id.toString()).sort();
        assert.deepEqual([...u.pendingTasks].sort(), actual);
    }
    for (const t of tasks) {
        if (t.assignedUser) {
            const owner = users.find(u => u._id.toString() === t.assignedUser);
            assert.ok(owner);
            assert.equal(t.assignedUserName, owner.name);
        } else {
            assert.equal(t.assignedUserName, 'unassigned');
        }
    }
}

test('creates users and tasks with server defaults and ignores client creation dates', async () => {
    const u = await user('Alice', { dateCreated: '2000-01-01', _id: missingId });
    assert.deepEqual(u.pendingTasks, []);
    assert.notEqual(u._id, missingId);
    assert.ok(new Date(u.dateCreated).getFullYear() >= 2026);
    const t = await task({ dateCreated: '2000-01-01' });
    assert.equal(t.description, '');
    assert.equal(t.completed, false);
    assert.equal(t.assignedUser, '');
    assert.equal(t.assignedUserName, 'unassigned');
    assert.ok(new Date(t.dateCreated).getFullYear() >= 2026);
});

test('validates required fields and strict types', async () => {
    for (const body of [{}, { name: 'A' }, { email: 'a@b' }, { name: 4, email: 'a@b' },
        { name: ' ', email: 'a@b' }, { name: 'A', email: [] }, { name: 'A', email: 'a@b', pendingTasks: 'bad' },
        { name: 'A', email: 'a@b', pendingTasks: [3] }, null, []]) {
        await request('/users', 'POST', body, 400);
    }
    for (const body of [{}, { name: 'A' }, { deadline }, { name: false, deadline },
        { name: 'A', deadline: 'invalid' }, { name: 'A', deadline: null }, { name: 'A', deadline: {} },
        { name: 'A', deadline, completed: 'false' }, { name: 'A', deadline, description: 4 },
        { name: 'A', deadline, assignedUser: null }, { name: 'A', deadline, assignedUserName: [] }]) {
        await request('/tasks', 'POST', body, 400);
    }
    assert.equal(await User.countDocuments(), 0);
    assert.equal(await Task.countDocuments(), 0);
});

test('rejects duplicate emails on create and update without changing data', async () => {
    await user();
    const bob = await user('Bob');
    const initial = await snapshot();
    await request('/users', 'POST', { name: 'Other', email: 'Alice@example.com' }, 400);
    await request(`/users/${bob._id}`, 'PUT', { name: 'Bob', email: 'Alice@example.com' }, 400);
    assert.equal(await snapshot(), initial);
    await request(`/users/${bob._id}`, 'PUT', { name: 'Bob', email: bob.email });
});

test('returns 404 for malformed and nonexistent URL ids before body validation', async () => {
    for (const path of ['users', 'tasks']) {
        for (const id of ['bad-id', missingId]) {
            await request(`/${path}/${id}`, 'GET', undefined, 404);
            await request(`/${path}/${id}`, 'PUT', {}, 404);
            await request(`/${path}/${id}`, 'DELETE', undefined, 404);
        }
    }
});

test('validates reference formats and existence without writes', async () => {
    const u = await user();
    const t = await task();
    const initial = await snapshot();
    for (const id of ['invalid', missingId]) {
        const status = id === missingId ? 404 : 400;
        await request('/users', 'POST', { name: 'Bob', email: 'bob@b', pendingTasks: [id] }, status);
        await request(`/users/${u._id}`, 'PUT', { name: 'New', email: u.email, pendingTasks: [id] }, status);
        await request('/tasks', 'POST', { name: 'New', deadline, assignedUser: id }, status);
        await request(`/tasks/${t._id}`, 'PUT', { name: 'New', deadline, assignedUser: id }, status);
    }
    assert.equal(await snapshot(), initial);
});

test('checks field errors before missing references', async () => {
    await request('/users', 'POST', { name: 'A', email: 4, pendingTasks: [missingId] }, 400);
    await request('/tasks', 'POST', { name: 'T', deadline, completed: 4, assignedUser: missingId }, 400);
});

test('assigns pending tasks on task creation and validates names', async () => {
    const u = await user();
    const t = await task({ assignedUser: u._id });
    assert.equal(t.assignedUserName, u.name);
    const initial = await snapshot();
    await request('/tasks', 'POST', { name: 'Bad', deadline, assignedUser: u._id, assignedUserName: 'Wrong' }, 400);
    await request(`/tasks/${t._id}`, 'PUT', { name: 'Bad', deadline, assignedUser: u._id, assignedUserName: 'Wrong' }, 400);
    await request('/tasks', 'POST', { name: 'Bad', deadline, assignedUserName: 'Someone' }, 400);
    assert.equal(await snapshot(), initial);
    await consistent();
});

test('POST user moves and deduplicates pending tasks', async () => {
    const a = await user();
    const t = await task({ assignedUser: a._id });
    const b = await user('Bob', { pendingTasks: [t._id, t._id.toUpperCase()] });
    assert.deepEqual(b.pendingTasks, [t._id]);
    assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, []);
    assert.equal((await request(`/tasks/${t._id}`)).assignedUser, b._id);
    await consistent();
});

test('PUT user moves added tasks, unassigns removed tasks, renames completed tasks, and preserves creation date', async () => {
    const a = await user();
    const b = await user('Bob');
    const removed = await task({ assignedUser: a._id });
    const retained = await task({ assignedUser: a._id });
    const completed = await task({ assignedUser: a._id, completed: true });
    const moved = await task({ assignedUser: b._id });
    const updated = await request(`/users/${a._id}`, 'PUT', {
        name: 'Alice New', email: a.email, pendingTasks: [retained._id, moved._id], dateCreated: '2000-01-01'
    });
    assert.equal(updated.dateCreated, a.dateCreated);
    assert.equal((await request(`/tasks/${removed._id}`)).assignedUser, '');
    assert.equal((await request(`/tasks/${completed._id}`)).assignedUserName, 'Alice New');
    assert.equal((await request(`/tasks/${moved._id}`)).assignedUser, a._id);
    await consistent();
});

test('PUT user defaults pendingTasks to empty and preserves completed assignments', async () => {
    const u = await user();
    const pending = await task({ assignedUser: u._id });
    const done = await task({ assignedUser: u._id, completed: true });
    const result = await request(`/users/${u._id}`, 'PUT', { name: 'Changed', email: u.email });
    assert.deepEqual(result.pendingTasks, []);
    assert.equal((await request(`/tasks/${pending._id}`)).assignedUser, '');
    assert.equal((await request(`/tasks/${done._id}`)).assignedUser, u._id);
    await consistent();
});

test('rejects completed tasks in user requests atomically', async () => {
    const u = await user();
    const t = await task({ completed: true });
    const pending = await task({ assignedUser: u._id });
    const initial = await snapshot();
    await request('/users', 'POST', { name: 'Bob', email: 'bob@b', pendingTasks: [t._id] }, 400);
    await request(`/users/${u._id}`, 'PUT', { name: 'Changed', email: u.email, pendingTasks: [pending._id, t._id] }, 400);
    assert.equal(await snapshot(), initial);
});

test('task replacement supports reassignment, completion, reopening, and unassignment', async () => {
    const a = await user();
    const b = await user('Bob');
    const t = await task({ assignedUser: a._id });
    for (const values of [
        { assignedUser: b._id }, { assignedUser: b._id, completed: true },
        { assignedUser: a._id, completed: true }, { assignedUser: a._id, completed: false }, { assignedUser: '' }
    ]) {
        const updated = await request(`/tasks/${t._id}`, 'PUT', { name: t.name, deadline, ...values });
        assert.equal(updated.dateCreated, t.dateCreated);
        await consistent();
    }
});

test('PUT task resets omitted optional fields instead of patching', async () => {
    const u = await user();
    const t = await task({ assignedUser: u._id, completed: true, description: 'old' });
    const updated = await request(`/tasks/${t._id}`, 'PUT', { name: 'Replacement', deadline, dateCreated: '2000-01-01' });
    assert.equal(updated.description, '');
    assert.equal(updated.completed, false);
    assert.equal(updated.assignedUser, '');
    assert.equal(updated.assignedUserName, 'unassigned');
    assert.equal(updated.dateCreated, t.dateCreated);
    await consistent();
});

test('DELETE task removes user reference and then returns 404', async () => {
    const u = await user();
    const t = await task({ assignedUser: u._id });
    await request(`/tasks/${t._id}`, 'DELETE', undefined, 204);
    await request(`/tasks/${t._id}`, 'GET', undefined, 404);
    await request(`/tasks/${t._id}`, 'DELETE', undefined, 404);
    await consistent();
});

test('DELETE user unassigns pending and completed tasks', async () => {
    const u = await user();
    await task({ assignedUser: u._id });
    await task({ assignedUser: u._id, completed: true });
    await request(`/users/${u._id}`, 'DELETE', undefined, 204);
    await request(`/users/${u._id}`, 'GET', undefined, 404);
    const tasks = await request('/tasks');
    assert.ok(tasks.every(t => t.assignedUser === '' && t.assignedUserName === 'unassigned'));
    await consistent();
});

test('single-resource select works and ignores collection query parameters', async () => {
    const u = await user();
    const t = await task();
    for (const [path, resource] of [['users', u], ['tasks', t]]) {
        const query = new URLSearchParams({ select: JSON.stringify({ name: 1, _id: 0 }), where: '{bad', count: 'bad', limit: 'bad', skip: 'bad', sort: 'bad' });
        assert.deepEqual(await request(`/${path}/${resource._id}?${query}`), { name: resource.name });
        const excluded = await request(`/${path}/${resource._id}?select=${encodeURIComponent('{"_id":0}')}`);
        assert.equal(excluded._id, undefined);
        await request(`/${path}/${resource._id}?select=bad`, 'GET', undefined, 400);
    }
});

test('collection where, sort, select, skip, limit and count combine correctly', async () => {
    for (const name of ['Charlie', 'Alice', 'Bob', 'Zoe']) await task({ name, completed: name === 'Zoe' });
    const query = new URLSearchParams({ where: '{"completed":false}', sort: '{"name":1}', select: '{"name":1,"_id":0}', skip: '1', limit: '1' });
    assert.deepEqual(await request(`/tasks?${query}`), [{ name: 'Bob' }]);
    query.set('count', 'true');
    assert.equal(await request(`/tasks?${query}`), 3);
    assert.deepEqual(await request('/tasks?where=%7B%22name%22%3A%22missing%22%7D'), []);
    assert.equal(await request('/users?count=true'), 0);
    const t = (await request('/tasks'))[0];
    const ids = new URLSearchParams({ where: JSON.stringify({ _id: { $in: [t._id] } }) });
    assert.equal((await request(`/tasks?${ids}`)).length, 1);
});

test('users support all collection query parameters', async () => {
    for (const name of ['Charlie', 'Alice', 'Bob']) await user(name);
    const query = new URLSearchParams({ where: '{"name":{"$ne":"Charlie"}}', sort: '{"name":-1}', select: '{"name":1,"_id":0}', skip: '1', limit: '1' });
    assert.deepEqual(await request(`/users?${query}`), [{ name: 'Alice' }]);
    query.set('count', 'true');
    assert.equal(await request(`/users?${query}`), 2);
});

test('tasks default to 100 results, users have no default limit, and limit=0 is unlimited', async () => {
    await Task.insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `Task ${i}`, deadline })));
    await User.insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `User ${i}`, email: `u${i}@example.com` })));
    assert.equal((await request('/tasks')).length, 100);
    assert.equal((await request('/users')).length, 105);
    assert.equal((await request('/tasks?limit=0')).length, 105);
    assert.equal(await request('/tasks?count=true'), 105);
});

test('rejects malformed query JSON and invalid query values', async () => {
    for (const key of ['where', 'sort', 'select', 'skip', 'limit', 'count']) {
        await request(`/tasks?${key}=%7Bbad`, 'GET', undefined, 400);
    }
    for (const query of ['where=[]', 'where=null', 'sort={"name":0}', 'select={"name":2}',
        'select={"name":1,"email":0}', 'skip=-1', 'skip=1.5', 'limit="3"', 'limit=-1', 'count=1', 'count="true"',
        'where={"_id":"invalid"}', 'where={"name":{"$unknown":1}}', 'where={"$unknown":1}']) {
        await request(`/tasks?${encodeURI(query)}`, 'GET', undefined, 400);
    }
});

test('handles malformed JSON, unknown routes and CORS preflight', async () => {
    const response = await fetch(`${base}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(await response.json()).sort(), ['data', 'message']);
    await request('/unknown', 'GET', undefined, 404);
    const preflight = await fetch(`${base}/tasks`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('rolls back all writes on a database failure and hides internal details', async () => {
    const u = await user();
    const t = await task({ assignedUser: u._id });
    const initial = await snapshot();
    const original = Task.updateMany;
    Task.updateMany = () => { throw new Error('private database failure details'); };
    try {
        await request(`/users/${u._id}`, 'PUT', { name: 'Changed', email: u.email, pendingTasks: [] }, 500);
    } finally {
        Task.updateMany = original;
    }
    assert.equal(await snapshot(), initial);
    assert.equal((await request(`/tasks/${t._id}`)).assignedUser, u._id);
    await consistent();
});

test('concurrent creates enforce unique email and concurrent moves preserve references', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Same', email: 'same@example.com' })
    })));
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 400, 400, 400]);
    const a = await user();
    const b = await user('Bob');
    const t = await task();
    await Promise.all([a, b].map(u => request(`/tasks/${t._id}`, 'PUT', { name: 'Moved', deadline, assignedUser: u._id })));
    await consistent();
});

test('concurrent completed task creation and user rename keep assignment names synchronized', async () => {
    const u = await user();
    await Promise.all([
        ...Array.from({ length: 6 }, () => task({ assignedUser: u._id, completed: true })),
        request(`/users/${u._id}`, 'PUT', { name: 'Renamed', email: u.email })
    ]);
    await consistent();
});
