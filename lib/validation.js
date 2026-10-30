class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function requireValue(condition, message) {
    if (!condition) throw new ApiError(400, message);
}

function validId(value) {
    return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function bodyObject(body) {
    requireValue(body && typeof body === 'object' && !Array.isArray(body), 'Provide a JSON object as the request body.');
}

function requiredString(value, field) {
    requireValue(typeof value === 'string' && value.trim().length > 0, `${field} must be a nonempty string.`);
    return value.trim();
}

function userInput(body) {
    bodyObject(body);
    const name = requiredString(body.name, 'Name');
    const email = requiredString(body.email, 'Email');
    const pendingTasks = body.pendingTasks === undefined ? [] : body.pendingTasks;
    requireValue(Array.isArray(pendingTasks), 'Pending tasks must be an array of task ids.');
    requireValue(pendingTasks.every(validId), 'Every pending task must have a valid task id.');
    return { name, email, pendingTasks: [...new Set(pendingTasks.map(id => id.toLowerCase()))] };
}

function taskInput(body) {
    bodyObject(body);
    const name = requiredString(body.name, 'Name');
    requireValue((typeof body.deadline === 'string' && body.deadline.trim() !== '') ||
        (typeof body.deadline === 'number' && Number.isFinite(body.deadline)), 'Deadline must be a valid date.');
    const deadline = new Date(body.deadline);
    requireValue(!Number.isNaN(deadline.getTime()), 'Deadline must be a valid date.');
    const description = body.description === undefined ? '' : body.description;
    const completed = body.completed === undefined ? false : body.completed;
    const assignedUser = body.assignedUser === undefined ? '' : body.assignedUser;
    requireValue(typeof description === 'string', 'Description must be a string.');
    requireValue(typeof completed === 'boolean', 'Completed must be true or false.');
    requireValue(assignedUser === '' || validId(assignedUser), 'Assigned user must be an empty string or a valid user id.');
    requireValue(body.assignedUserName === undefined || typeof body.assignedUserName === 'string', 'Assigned user name must be a string.');
    if (assignedUser === '' && body.assignedUserName !== undefined) {
        requireValue(body.assignedUserName === 'unassigned', 'An unassigned task must use the name "unassigned".');
    }
    return { name, deadline, description, completed, assignedUser: assignedUser.toLowerCase(),
        assignedUserName: body.assignedUserName };
}

module.exports = { ApiError, requireValue, validId, userInput, taskInput };
