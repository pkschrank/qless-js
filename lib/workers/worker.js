'use strict';

const util = require('../util');
const errors = require('../errors');
const DEFAULT_INTERVAL = 5000; // ms
const DEFAULT_QUEUE = 'default';

class Worker { // when have other kinds of workers, can move to a different file
  constructor(queueName, client, options) {
    this.client = client;
    this.queueName = queueName;
    this.queue = this.client.queue(queueName || DEFAULT_QUEUE);
    this.options = options || {};
    this.options.interval = this.options.interval || DEFAULT_INTERVAL;
    this.logger = util.logger('worker');
    this.shutdown = false;

    // Graceful exit
    process.on('SIGINT', () => {
      this.logger.info('SIGINT received.  Setting stop flag.');
      this.stop();
    });

    // Force exit
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received.  Setting stop flag.');
      this.stop();
    });
  }

  stop() {
    this.shutdown = true;
  }

  _checkQueue(queues, cb) {
    const queue = queues.splice(0, 1)[0];
    try {
      queue.pop((err, job) => {
        if (job !== null) {
          cb(null, job);
          return;
        }

        if (queues.length === 0) {
          cb(null, null);
          return;
        }

        this._checkQueue(queues, cb);
      });
    } catch (err) {
      cb(err);
    }
  }

  reserve(cb) {
    if (!Array.isArray(this.queue)) {
      // maintain original single queue string support
      this.queue.pop(cb);
    } else {
      // @TODO refactor async loop
      this._checkQueue(this.queue.slice(0), cb);
    }
  }

  perform(job, cb) {
    job.perform(this.options, err => {
      if (err) return this.failJob(job, err, cb);
      return this.tryComplete(job, cb);
    });
  }

  tryComplete(job, cb) {
    if (job.isStateChanged()) return cb();
    job.complete(err => {
      if (err && err instanceof errors.LuaScriptError) {
        // There's not much we can do here. Complete fails in a few cases:
        //   - The job is already failed (i.e. by another worker)
        //   - The job is being worked on by another worker
        //   - The job has been cancelled
        //
        // We don't want to (or are able to) fail the job with this error in
        // any of these cases, so the best we can do is log the failure.
        this.logger.error(`Failed to complete ${job}: ${err.message}`);
        return cb();
      } else if (err) {
        return cb(err);
      } else {
        return cb();
      }
    });
  }

  failJob(job, err, cb) {
    let group;
    let message;

    if (err instanceof Error) {
      group = err.name;
      message = `${err.message}\n\n${err.stack}`;
    } else {
      group = message = err.toString();
    }

    this.logger.error(`Got ${group} failure from ${job}: ${message}`, util.logJobContext(job));

    job.fail(group, message, failErr => {
      if (failErr instanceof errors.LuaScriptError) {
        // There's not much we can do here. Another worker may have cancelled it,
        // or we might not own the job, etc. Logging is the best we can do.
        this.logger.error(`Failed to fail ${job}: ${message}`, util.logJobContext(job));
        return cb();
      }
      return cb(failErr);
    });
  }

}

module.exports = { Worker };
