/* global Emissary:true */
/* global EmissaryTest:true*/
/* jshint esnext:true */

var queuepid = Npm.require('queuepid');

var queueURL = (Meteor.settings.emissary && Meteor.settings.emissary.messagesQueue) ||
  process.env.EMISSARY_MESSAGES_QUEUE;

Emissary.connect = Meteor.wrapAsync(function (cb) {
  Emissary.queue = new queuepid.Queue('notifications_messages', new queuepid.SQSDriver({
    queueUrl: queueURL,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1'
  }), {
    mongoUrl: process.env.MONGO_URL,
    retryLimit: 10
  });

  Emissary.queue.connect().then(function () {
    console.log('Connected to queue');
    cb();
  }).catch(function (err) {
    cb(err);
  });
});

var externalIds = Emissary.collections.externalIds;
EmissaryTest = {
  externalIds: externalIds
};
/**
 * Start the workers to send notifications
 */
Emissary.workQueue = function () {
  Emissary.pool = new queuepid.WorkerPool(Emissary.queue, {
    maxConcurrent: Meteor.settings.emissary && Meteor.settings.emissary.concurrent || process.env.EMISSARY_CONCURRENT ||
      10,
    wait: 500
  }, Meteor.bindEnvironment(function (job) {
    Emissary.log('Sending ' + job.info.data.task);
    let info = job.info;

    let worker = Emissary._workers[info.data.task];
    if (!worker) {
      job.done(new Error('No worker registered for ' + info.data.task));
    } else {
      try {
        worker(job);
      } catch (err) {
        job.done(err);
      }
    }
  }));

  Emissary.pool.start();

};

/**
 * Stop the workers (stop sending notifications)
 */
Emissary.stopWorkingQueue = function () {
  Emissary.pool.stop();
};

/**
 * Update a job given an interpreted response from the transport.
 *
 * Transports can use this function to update a job given a particular "response" received from a third-party. The
 * transport is expected to format the response into the below "check" format, which is the interpreted by this
 * function to decide how to proceed.
 *
 * @param  {Object} response The response
 * @param {Boolean} resonse.ok Is the response an "ok" response (IE, not an error)
 * @param {Boolean} response.done Is this the final response? Has the notification been sent successfully?
 * @param {String} response.error Is there an error?
 * @param {Number} response.errorLevel The level of the error, according to the above Emissary.ERROR_LEVEL defs
 * @param {String} response.status The current status, just to update the job log. E.g. "queued"
 * @param {String} response.resolution The proposed resolution if the errorLevel is fatal or worse. For example, Twilio
 *                                     can blacklist a number and you won't be able to send to that number unless the
 *                                     recipient fixes it. This is simply passed through to the "turnOff" event
 * @return {[type]}          [description]
 */
Emissary.handleResponse = function (job, response) {
  check(response, {
    ok: Boolean,
    done: Boolean,
    error: Match.OneOf(null, String),
    errorLevel: Number,
    status: Match.Optional(String),
    resolution: Match.Optional(String)
  });

  job.log('Current status: ' + response.status);
  if (response.ok) {
    if (response.done) {
      return job.done();
    }
    // Do nothing - need to wait for the next status
  } else {
    var turnOffNotifications = false;
    var errorConstructor = Emissary.Error;
    // If it's fatal or worse, we don't want to retry the job
    if (response.errorLevel >= Emissary.ERROR_LEVEL.FATAL) {
      errorConstructor = Emissary.FatalError;
      turnOffNotifications = true;
    }

    // If we need to turn off future notifications until it's resolved, do it now by adding a configuration error
    if (turnOffNotifications) {
      Emissary.turnOffFutureNotifications(job, response.error, response.resolution);
    }

    // If it's catastrophic, wake everyone up
    if (response.errorLevel >= Emissary.ERROR_LEVEL.CATASTROPHIC) {
      Emissary.emit('error.catastrophic', new Error('Catastrophic notifications ' + 'error: ' + response.message +
        '(JOB ID:' + this.getId() + ')'));
    }

    // Call done with the error, which delegates to job.fail();
    return job.done(new errorConstructor(response.error));

  }
};

/**
 * Emits an event signaling that notifications to the recipient should be discontinued until a problem is resolved.
 * Intentionally vague so the engineer can decide how to handle it.
 * @param  {String} reason     The reason the notifications need to be turned off
 * @param  {String} resolution A potential solution to the above issue
 */
Emissary.turnOffFutureNotifications = function (job, reason, resolution) {
  Emissary.emit('turnOff', {
    job: job,
    reason: reason,
    resolution: resolution
  });
};

/**
 * Register a function to work the queue for a specific task.
 *
 * @see  https://github.com/vsivsi/meteor-job-collection#jq--jcprocessjobstype
 *       -options-worker---anywhere
 * @param  {String} taskName The name of the task to handle
 * @param  {Object} options  Options to be passed directly to JobCollection.processJobs
 * @param  {Function} worker   Function that takes the job as its only argument. The worker is expected to run
 *                             `job.done()` or `job.done(err)` as needed.
 *
 * @todo  Make timeout configurable
 */

Emissary._workers = {};

Emissary.registerWorker = function (taskName, options, worker) {
  if (!Emissary._types.hasOwnProperty(taskName)) {
    throw new Emissary.Error('There is no type registered with name %s', taskName);
  }

  Emissary._workers[taskName] = worker;
};

/**
 * Queues a task to be run by a worker
 *
 * @see  https://github.com/vsivsi/meteor-job-collection#user-content-job-api
 * @param  {String} taskName The name of the task. Must match the taskName in `registerWorker` in order to be handled
 * @param  {Object} data Arbitrary data to pass to the worker
 *
 * @return {EmissaryJob} The job
 */
Emissary.queueTask = function (taskName, data) {
  if (!Emissary._types.hasOwnProperty(taskName)) {
    throw new Emissary.Error('There is no type registered with name %s', taskName);
  }

  // "Cancel If" logic will go here when we want to add it
  Emissary.log('Queuing task: ' + taskName);
  try {
    check(data, {
      bodyTemplate: String,
      timeout: Match.Optional(Number),
      delay: Match.Optional(Number),
      subjectTemplate: Match.Optional(String),
      templateData: Match.Optional(Object),

      // Format depends on the transport
      transportConfig: Emissary._types[taskName],

      // Put any additional data here
      recipient: Match.Optional(Match.Any)
    });

  } catch (err) {
    Emissary.emit('error', err);
    console.warn('Invalid Emissary message format!');
    throw err;
  }

  // Instead of queuing message, just send it.

  return Emissary.queue.sendMessage({
    task: taskName,
    payload: data
  });
};
