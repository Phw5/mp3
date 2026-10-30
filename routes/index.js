const User = require('../models/user');
const Task = require('../models/task');
const { ApiError, validId } = require('../lib/validation');
const { selection, collectionQuery } = require('../lib/queries');
const { saveUser, saveTask, deleteResource } = require('../lib/resources');

module.exports = function (app, router) {
    router.get('/', (req, res) => res.json({ message: 'Task management API is running.', data: null }));

    for (const [path, Model, save, defaultLimit] of [
        ['users', User, saveUser, 0], ['tasks', Task, saveTask, 100]
    ]) {
        router.get(`/${path}`, async (req, res) => {
            const { where, sort, select, skip, limit, count } = collectionQuery(req.query, defaultLimit);
            const data = count ? await Model.countDocuments(where) :
                await Model.find(where).sort(sort).select(select).skip(skip).limit(limit).lean();
            res.json({ message: 'OK', data });
        });

        router.get(`/${path}/:id`, async (req, res) => {
            if (!validId(req.params.id)) throw new ApiError(404, `${Model.modelName} not found.`);
            const select = selection(req.query);
            const data = await Model.findById(req.params.id).select(select).lean();
            if (!data) throw new ApiError(404, `${Model.modelName} not found.`);
            res.json({ message: 'OK', data });
        });

        router.post(`/${path}`, async (req, res) => {
            const data = await save(null, req.body);
            res.status(201).json({ message: `${Model.modelName} created.`, data });
        });

        router.put(`/${path}/:id`, async (req, res) => {
            const data = await save(req.params.id, req.body);
            res.json({ message: `${Model.modelName} updated.`, data });
        });

        router.delete(`/${path}/:id`, async (req, res) => {
            await deleteResource(Model, req.params.id);
            res.status(204).end();
        });
    }

    app.use('/api', router);
};
