'use strict';

/**
 * Various utilities.
 */

const crypto = require('crypto');
const debug = require('debug');
const LOG_APP_NAME = 'qless';
const LOG_LEVELS = ['debug', 'info', 'error'];

let customLogger;

// Used by generateJid(). does effectively a sprintf("%02x", byteVal)
function byteToPaddedHex(byteVal) {
  return (0x100 + byteVal).toString(16).substr(1);
}


/**
 * Generates a new securely random, 16-byte hex qless job id.
 */
function generateJid() {
  const bytes = Array.from(crypto.randomBytes(16));
  return bytes.map(byteToPaddedHex).join('');
}

function setLogger(loggerImpl) {
  customLogger = loggerImpl;
}

/**
 * Default function for providing contextual logging
 *
 * @param job
 * @returns {
 * {data: {whiz: string},
 *  dependencies: Array,
 *  dependents: Array,
 *  expiresAt: number,
 *  jid: string,
 *  klassName: string,
 *  originalRetries: number,
 *  priority: number,
 *  queueName: string,
 *  retriesLeft: number,
 *  tags: [string],
 *  workerName: string,
 *  resources: {}}
 * }
 */
function logJobContext(job) {
  const result = {};
  if (!job) {
    return result;
  }

  const ctxMap = [
    'expiresAt',
    'jid',
    'klassName',
    'originalRetries',
    'priority',
    'queueName',
    'retriesLeft',
    'tags',
    'workerName',
    'resources',
  ];

  ctxMap.forEach((key) => {
    result[key] = job[key];
  });

  return result;
}

/**
 * Generate a properly namespaced logger with the debug(), info() etc.
 * functions for the given module name.
 */
function logger(module) {
  if (customLogger) {
    return customLogger;
  }

  const result = {};
  for (const level of LOG_LEVELS) {
    /* eslint-disable no-loop-func */
    /* eslint-disable func-names */
    result[level] = function () {
      // preserve original context free debug default
      // need no named func to get a new arguments
      debug(`${LOG_APP_NAME}:${module}:${process.pid}:${level}`)(arguments[0]);
    };
    /* eslint-enable no-loop-func func-names */
    /* eslint-enable func-names */
  }
  return result;
}

/**
 * Makes a callback that:
 * - on error, calls the callback function with the error and value
 * - on success, calls the success function with one argument, the value.
 * Encapsulates the common pattern:
 *   foo(arg1, arg2, (err, val) => {
 *     if (err) return cb err;
 *     // do something with val...
 *   });
 */
function makeCb(errorCb, successCb) {
  return (err, value) => {
    if (err) return errorCb(err, value);
    successCb(value);
  };
}

module.exports = { generateJid, setLogger, logJobContext, logger, makeCb };
