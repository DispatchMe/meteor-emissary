/* global Emissary:false - from dispatch:emissary */
/* global Twilio:false - from dispatch:twilio */
/* global TwilioTransport:true */
/* global JsonRoutes:false - from simple:json-routes */
/* global TestExports:true */
var ERROR_LEVEL = Emissary.ERROR_LEVEL;

var twilio = Npm.require('twilio');

var qs = Npm.require('querystring');

function errorHandler(error, req, res, next) {
  if (error) {
    JsonRoutes.sendError(res, 401, error);
  } else {
    next();
  }
}

TwilioTransport = function (config) {
  this._config = config;
  this._client = new Twilio({
    sid: config.sid,
    token: config.token,
    from: config.from
  });

};

TwilioTransport.prototype.register = function () {
  var self = this;
  // Register endpoints
  var middleware = function (path, connect) {
    connect.use(path, _.bind(self.authenticateWebhook, self));
    connect.use(path, errorHandler);
  };

  Emissary.registerWebhookEndpoint('POST', '/twilio/webhook', _.bind(this.handleWebhook, this), null, middleware);

  Emissary.registerWorker('sms', {}, _.bind(this.send, this));
};

TwilioTransport.prototype.authenticateWebhook = function (req, res, next) {
  if (this._config.skipAuth === true) {
    return next();
  }
  var header = req.headers['X-Twilio-Signature'];
  var fullUrl = Emissary.getFullUrlForEndpoint('/twilio/webhook');
  var params = qs.parse(req.body);

  Emissary.emit('info', 'Authenticating Twilio webhook', header, fullUrl, params);

  if (twilio.validateRequest(this._config.token, header, fullUrl, params)) {
    next();
  } else {
    console.log('Failed to validate request:', this._config.token, header, fullUrl, params);
    next(new Meteor.Error('Invalid status code'));
  }
};

TwilioTransport.prototype.handleWebhook = function (data) {
  Emissary.emit('info', 'Handling twilio webhook', data);

  var job = Emissary.getJobByExternalId('twilio', data.MessageSid);
  if (!job) {
    return;
  }

  var interpretedResponse = interpretResponse(data.MessageStatus, data.ErrorCode);
  this.emitStatusEvent(job.getMessage(), interpretedResponse);

  job.handleResponse(interpretedResponse);
};

TwilioTransport.prototype.emitStatusEvent = function (data, response) {
  var eventData = {
    data: data,
    response: response
  };

  // @todo flesh this out
  if (!response.ok) {
    Emissary.emit('twilioError', eventData);
  } else {
    Emissary.emit('twilioQueued', eventData);
  }
};

TwilioTransport.prototype.send = function (job) {
  return;
  var data = job.info.data.payload;

  var body = Emissary.renderTemplate(data.bodyTemplate, data.templateData || {});

  /**
   * Response looks like this:
   * {
   *     sid: 'SM13e11d47e4c94fcf90177db50173deba',
   *     date_created: 'Wed, 09 Sep 2015 14:48:31 +0000',
   *     date_updated: 'Wed, 09 Sep 2015 14:48:31 +0000',
   *     date_sent: null,
   *     account_sid: 'AC7425ab30a8809d5b4f714da8b3740860',
   *     to: '+18058867378',
   *     from: '+16203064229',
   *     body: 'Testing!',
   *     status: 'queued',
   *     num_segments: '1',
   *     num_media: '0',
   *     direction: 'outbound-api',
   *     api_version: '2010-04-01',
   *     price: null,
   *     price_unit: 'USD',
   *     error_code: null,
   *     error_message: null,
   *     uri: '/2010-04-01/Accounts/AC7425ab30a8809d5b4f714da8b3740860/Messages
   *       /SM13e11d47e4c94fcf90177db50173deba.json',
   *     subresource_uris: {
   *         media: '/2010-04-01/Accounts/AC7425ab30a8809d5b4f714da8b3740860/Messages
   *           /SM13e11d47e4c94fcf90177db50173deba/Media.json'
   *     },
   *     dateCreated: Wed Sep 09 2015 10:48:31 GMT-0400 (EDT),
   *     dateUpdated: Wed Sep 09 2015 10:48:31 GMT-0400 (EDT),
   *     dateSent: null,
   *     accountSid: 'AC7425ab30a8809d5b4f714da8b3740860',
   *     numSegments: '1',
   *     numMedia: '0',
   *     apiVersion: '2010-04-01',
   *     priceUnit: 'USD',
   *     errorCode: null,
   *     errorMessage: null,
   *     subresourceUris: {
   *         media: '/2010-04-01/Accounts/AC7425ab30a8809d5b4f714da8b3740860/Messages
   *           /SM13e11d47e4c94fcf90177db50173deba/Media.json'
   *     }
   * }
   */
  try {
    var options = {
      to: data.transportConfig.to,
      body: body
    };

    if (data.transportConfig.from) {
      options.from = data.transportConfig.from;
    }

    job.log('Sending data to Twilio', options);

    var response = this._client.sendSMS(options);

    // It might be possible that twilio hits the endpoint before we save this...
    job.log('Twilio SID', response.sid);

    var interpretedResponse = interpretResponse(response.status, response.errorCode);

    this.emitStatusEvent(data, interpretedResponse);

    // This will either complete the job, fail the job, or just log the current status.
    return Emissary.handleResponse(job, interpretedResponse);

  } catch (err) {
    // This will happen if the phone number is invalid. We can't go off of err.name since it's not
    // named correctly but we can check if 'is not a valid phone number' is in the msg'
    if (err.message.indexOf('is not a valid phone number') >= 0) {
      Emissary.turnOffFutureNotifications('Invalid phone number', 'Fix your phone number in your settings!');
      return job.done(new Emissary.FatalError('Invalid phone number'));

    } else {
      return job.done(err);
    }
  }
};

/**
 * Translates a response from the Twilio API into a response that we can pass to EmissaryJob.handleResponse
 *
 * @param  {String} status    The status from Twilio
 * @param  {String} errorCode The error code (if applicable) from Twilio
 * @return {Object}           Response object
 */
var interpretResponse = function interpretResponse(status, errorCode) {
  var response = {
    ok: false,
    done: false,
    error: null,
    errorLevel: ERROR_LEVEL.NONE,
    status: status,
    resolution: ''
  };

  switch (status) {
  case 'delivered':
    // Successful! Remove the record from the database (we can always look it up in Twilio if necessary)
    response.ok = true;
    response.done = true;
    break;
  case 'sending':
  case 'sent':
  case 'queued':
    response.ok = true;

    // For now, do true, to avoid the webhook callback. If Twilio queues it, that means we've done all we can. 
    // Worst case it's an invalid number, which we will see in Twilio.
    response.done = true;
    break;
  case 'undelivered':
    switch (errorCode) {
    case '30001':
      // Queue overflow. Retry
      response.error = 'Queue overflow';
      response.errorLevel = ERROR_LEVEL.MINOR;
      response.ok = false;
      break;
    case '30002':
      // Account suspended. ALERT ALERT CATASTROPHIC ERROR
      response.error = 'Account suspended';
      response.errorLevel = ERROR_LEVEL.CATASTROPHIC;
      response.ok = false;
      break;
    case '30003':
      // Unreachable destination handset. Fatal
      response.error = 'Unreachable destination';
      response.errorLevel = ERROR_LEVEL.FATAL;
      response.ok = false;
      break;
    case '30004':
      // Message blocked (blacklist). Fatal, turn off future sms notifications
      response.error = 'Blacklisted';
      response.errorLevel = ERROR_LEVEL.FATAL;
      response.ok = false;
      break;
    case '30005':
      // Unknown destination handset. Number is unknown and may no longer exist. Fatal, turn off
      response.error = 'Unknown destination';
      response.errorLevel = ERROR_LEVEL.FATAL;
      response.ok = false;
      break;
    case '30006':
      // Landline or unreachable carrier. Fatal, turn off
      response.error = 'Landline';
      response.errorLevel = ERROR_LEVEL.FATAL;
      response.ok = false;
      break;
    case '30007':
      // Carrier violation. Content/spam filtering. Retry? This is up for debate.
      response.error = 'Carrier violation (content/spam filtering)';
      response.errorLevel = ERROR_LEVEL.MINOR;
      response.ok = false;
      break;

    case '30009':
      // Missing segment. Retry (network error)
      response.error = 'Missing segment (network error)';
      response.errorLevel = ERROR_LEVEL.MINOR;
      response.ok = false;
      break;
    default: // Also '30008' for "unknown"
      response.error = 'Unknown';
      response.errorLevel = ERROR_LEVEL.MINOR;
      response.ok = false;
      break;
    }
    break;
  default:
    response.error = 'Unrecognized status (' + response.status + ')';
    response.errorLevel = ERROR_LEVEL.MINOR;
    response.ok = false;
    break;

  }
  return response;
};

TestExports = {
  interpretResponse: interpretResponse
};
