/* global JobCollection:false - from vsivsi:jobs-collection */
/* global Job:false - from vsivsi:job-collection package */
/* global Emissary:true */
/* global EmissaryJob:true */
/* global EmissaryTest:true*/

var queue = new JobCollection('Emissary.Jobs');

// We need a place to keep track of the links between external IDs and the internal Job, so we can retrieve a job
// later to mark it as successful/failed based on an asynchronous process. Like a webhook from Twilio or a long-poll
// to check status via another API
var externalIds = new Mongo.Collection('emissary.external_ids');

EmissaryTest = {
  queue: queue,
  externalIds: externalIds
};
/**
 * Start the workers to send notifications
 */
Emissary.workQueue = function () {
  queue.startJobServer();
};

/**
 * Stop the workers (stop sending notifications)
 */
Emissary.stopWorkingQueue = function () {
  queue.shutdownJobServer();
};

/**
 * A wrapper for the vsivsi:job for additional functionality and alternate error 
 * handling
 */
EmissaryJob = function (job) {
  this._job = job;
};

/**
 * Retrieve the message data passed to the job via queueTask
 * @return {Object) The data
 */
EmissaryJob.prototype.getMessage = function () {
  return this._job._doc.data;
};

/**
 * Return info about the job (type, retries, status, etc)
 * @return {Object} The info
 */
EmissaryJob.prototype.getInfo = function () {
  return this._job._doc;
};

/**
 * Finish a job. If the argument is empty, it will be finished successfully. Otherwise if `err` is defined, the job 
 * will be failed. If err is an instance of EmissaryFatalError, the job will be failed fatally, meaning it will not
 * be retried.
 * 
 * @param  {Error}   [err] Error, if the job failed
 */
EmissaryJob.prototype.done = function (err) {
  if (err) {
    var failOptions = {};
    if (err.name === 'EmissaryFatalError') {
      failOptions.fatal = true;
    }

    this._job.fail(err.message, failOptions);
  } else {
    this._job.done();
  }
};

/**
 * Log a message on the job. 
 * @param  {String} level If this is the only argument, it will be used as the "message" argument. Otherwise this will 
 *                        define the log level (e.g. "info" or "error")
 * @param  {String} [msg]   The message, if you want to also define the level
 * @param  {Object} [data]  Arbitrary data relevant to this message
 */
EmissaryJob.prototype.log = function (level, msg, data) {
  if (!msg) {
    msg = level;
    level = 'info';
  }
  data = data || {};
  this._job.log(msg, {
    level: level,
    data: data
  });
};

/**
 * Get the database ID of a job. This is used for continuing work on a job if it was deferred due to some waiting 
 * period.
 * @return {String} The job ID
 */
EmissaryJob.prototype.getId = function () {
  return this._job._doc._id;
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
EmissaryJob.prototype.handleResponse = function (response) {
  check(response, {
    ok: Boolean,
    done: Boolean,
    error: Match.OneOf(null, String),
    errorLevel: Number,
    status: Match.Optional(String),
    resolution: Match.Optional(String)
  });

  this.log('Current status: ' + response.status);
  if (response.ok) {
    if (response.done) {
      return this.done();
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

    // Call done with the error, which delegates to job.fail();
    this.done(new errorConstructor(response.error));

    // If we need to turn off future notifications until it's resolved, do it now by adding a configuration error
    if (turnOffNotifications) {
      this.turnOffFutureNotifications(response.error, response.resolution);
    }

    // If it's catastrophic, wake everyone up
    if (response.errorLevel >= Emissary.ERROR_LEVEL.CATASTROPHIC) {
      Emissary.emit('error.catastrophic', new Error('Catastrophic notifications ' + 'error: ' + response.message +
        '(JOB ID:' + this.getId() + ')'));
    }

  }
};

/**
 * Emits an event signaling that notifications to the recipient should be discontinued until a problem is resolved. 
 * Intentionally vague so the engineer can decide how to handle it.
 * @param  {String} reason     The reason the notifications need to be turned off
 * @param  {String} resolution A potential solution to the above issue
 */
EmissaryJob.prototype.turnOffFutureNotifications = function (reason, resolution) {
  Emissary.emit('turnOff', {
    job: this,
    reason: reason,
    resolution: resolution
  });
};

/**
 * Record a link between this job and some other ID taken from an external source. Transports should use this function 
 * when using an API that is asynchronous, so in another process like an endpoint, the job can be retrieved given the 
 * ID from the API and marked as done/failed
 *   
 * @param  {String} source The source of the external ID. E.g. "Twilio". Defined by the transport
 * @param  {String} id     The external ID
 */
EmissaryJob.prototype.linkToExternalId = function (source, id) {
  externalIds.insert({
    source: source,
    externalId: id,
    jobId: this.getId()
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
Emissary.registerWorker = function (taskName, options, worker) {
  if (!Emissary._types.hasOwnProperty(taskName)) {
    throw new Emissary.Error('There is no type registered with name %s', taskName);
  }

  return queue.processJobs(taskName, _.extend({
    workTimeout: 5 * 60 * 1000
  }, options), function (job, callback) {
    var jobObj = new EventTasker.drivers._JobsCollectionMessage(job);
    try {
      worker(jobObj);
    } catch (err) {
      Emissary.emit('error', err);

      // Thinking is, if the worker threw an error without catching it, then 
      // it's some sort of code-level error rather than a logic error. So the 
      // worker would not have marked it done by itself. We need to fail it 
      // explicitly.
      jobObj.done(err);
    } finally {
      // The callback makes it continue to work the queue. This lets us decide
      // whether or not to "finish" the job inside of the actual worker and even 
      // defer it to be handled later (e.g. for asynchronous callbacks for 
      // certain message transports)
      callback();
    }
  });
};

/**
 * Queues a task to be run by a worker
 *
 * @see  https://github.com/vsivsi/meteor-job-collection#user-content-job-api
 * @param  {String} taskName The name of the task. Must match the taskName in `registerWorker` in order to be handled
 * @param  {Object} data Arbitrary data to pass to the worker
 * @param  {Function} [transform] If provided, this function will run on the job object. You can use this to apply 
 *                                additional configuration to the job.
 *                                
 * @return {EmissaryJob} The job
 */
Emissary.queueTask = function (taskName, data, transform) {
  if (!Emissary._types.hasOwnProperty(taskName)) {
    throw new Emissary.Error('There is no type registered with name %s', taskName);
  }

  // "Cancel If" logic will go here when we want to add it

  check(data, {
    bodyTemplate: String,
    subjectTemplate: Match.Optional(String),
    templateData: Match.Optional(Object),
    // Format of "to" depends on the transport
    to: Emissary._types[taskName],

    // Put any additional data here
    recipient: Match.Optional(Match.Any)
  });

  var job = new Job(queue, taskName, data);
  if (transform && _.isFunction(transform)) {
    job = transform(job, data);
  }

  job.save();
  return new EmissaryJob(job);
};

/**
 * Retrieve a job by ID. Simply wraps the JobCollection.getJob but returns an 
 * instance of EmissaryJob instead.
 * @param  {String} id The job ID
 * @return {EmissaryJob|null}    The job, or null if it wasn't found
 */
Emissary.getJobById = function (id) {
  var job = queue.getJob(id);
  if (!job) {
    return null;
  }
  return new EmissaryJob(job);
};

/**
 * Retrieve a job given a source and externalId for that source. Assumes you have previously linked a job to an 
 * external ID using `job.linkToExternalId()`
 * @param  {String} source     The source
 * @param  {String} externalId The external ID
 * @return {EmissaryJob|null}            The job, or null if it can't be found
 */
Emissary.getJobByExternalId = function (source, externalId) {
  var externalIdDoc = externalIds.findOne({
    source: source,
    externalId: externalId
  });

  if (!externalIdDoc) {
    return null;
  }

  return Emissary.getJobById(externalIdDoc.jobId);
};

// @todo - retry messages by recipient by type, for when they fix their phone number, for example
