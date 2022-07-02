const async = require('async');
const { log } = require('./utils');

const DEFAULTS = {
    concurrency: 25,
    logLatency: 1000
}

const logProgress = (remaining, logLatency) => {
    if (remaining > 0 && remaining % logLatency === 0) {
        log(`Remaining ${remaining} files`);
    }
}

const createQueue = params => {
    const { concurrency, logLatency, log = true } = { ...DEFAULTS, ...(params || {})};
    let queue;
    queue = async.queue((task, completed) => {
        task().then(() => completed(null, () => log ? logProgress(queue.length(), logLatency) : {}));
    }, concurrency);
    queue.log = log;
    return queue;
}
  
const addTask = (queue, task) => {
    queue.push(task, (error, callback)=>{
        callback();
    })
}

const waitForEnd = async (queue) => {
    await new Promise((resolve) => queue.drain(() => {
        if (queue.log) {
            log('Successfully processed all items');
        }
        resolve();
    }));
};

const waitIf = async (queue, { length }) => {
    if (queue.length() > length) {
        await waitForEnd(queue, { log: false });
    }
}

module.exports = { createQueue, addTask, waitForEnd, waitIf };