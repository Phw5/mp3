const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');
const { ApiError, requireValue, validId, userInput, taskInput } = require('./validation');

async function findResource(Model, id, session) {
    const label = Model.modelName;
    if (!validId(id)) throw new ApiError(404, `${label} not found.`);
    const document = await Model.findById(id).session(session);
    if (!document) throw new ApiError(404, `${label} not found.`);
    return document;
}

async function saveUser(id, body) {
    return mongoose.connection.transaction(async session => {
        const user = id ? await findResource(User, id, session) : new User();
        const values = userInput(body);
        const duplicate = await User.exists({ email: values.email, _id: { $ne: user._id } }).session(session);
        requireValue(!duplicate, 'That email is already used by another user.');
        const tasks = await Task.find({ _id: { $in: values.pendingTasks } }).session(session);
        if (tasks.length !== values.pendingTasks.length) throw new ApiError(404, 'One or more pending tasks were not found.');
        requireValue(tasks.every(task => !task.completed), 'Completed tasks cannot be included in pending tasks.');
        const userId = user._id.toString();
        const removed = user.pendingTasks.filter(taskId => !values.pendingTasks.includes(taskId));
        user.set(values);
        await user.save({ session });
        await Task.updateMany({ _id: { $in: removed }, assignedUser: userId },
            { $set: { assignedUser: '', assignedUserName: 'unassigned' } }, { session });
        await User.updateMany({ _id: { $ne: user._id }, pendingTasks: { $in: values.pendingTasks } },
            { $pull: { pendingTasks: { $in: values.pendingTasks } } }, { session });
        await Task.updateMany({ _id: { $in: values.pendingTasks } },
            { $set: { assignedUser: userId, assignedUserName: user.name } }, { session });
        await Task.updateMany({ assignedUser: userId }, { $set: { assignedUserName: user.name } }, { session });
        return user.toObject();
    });
}

async function saveTask(id, body) {
    return mongoose.connection.transaction(async session => {
        const task = id ? await findResource(Task, id, session) : new Task();
        const values = taskInput(body);
        let user;
        if (values.assignedUser) {
            user = await User.findById(values.assignedUser).session(session);
            if (!user) throw new ApiError(404, 'Assigned user not found.');
            requireValue(values.assignedUserName === undefined || values.assignedUserName === user.name,
                'Assigned user name must match the assigned user.');
            values.assignedUserName = user.name;
        } else {
            values.assignedUserName = 'unassigned';
        }
        task.set(values);
        await task.save({ session });
        const taskId = task._id.toString();
        await User.updateMany({ pendingTasks: taskId }, { $pull: { pendingTasks: taskId } }, { session });
        if (user) {
            const update = task.completed ? { $pull: { pendingTasks: taskId } } : { $addToSet: { pendingTasks: taskId } };
            update.$inc = { __v: 1 };
            await User.updateOne({ _id: user._id }, update, { session });
        }
        return task.toObject();
    });
}

async function deleteResource(Model, id) {
    return mongoose.connection.transaction(async session => {
        const resource = await findResource(Model, id, session);
        if (Model === User) {
            await Task.updateMany({ assignedUser: resource._id.toString() },
                { $set: { assignedUser: '', assignedUserName: 'unassigned' } }, { session });
        } else {
            await User.updateMany({ pendingTasks: resource._id.toString() },
                { $pull: { pendingTasks: resource._id.toString() } }, { session });
        }
        await resource.deleteOne({ session });
    });
}

module.exports = { findResource, saveUser, saveTask, deleteResource };
