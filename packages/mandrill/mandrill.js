/* global Emissary:false - from dispatch:notifications-base */
/* global MandrillTransport:true */
// Send emails with Mandrill

var ERROR_LEVEL = Emissary.ERROR_LEVEL;

MandrillTransport = function (config) {
  check(config, {
    key: String,
    fromEmail: String,
    fromName: String
  });

  this._config = config;
};

MandrillTransport.prototype.register = function () {
  Emissary.registerWorker('email', {}, _.bind(this.send, this));
};

MandrillTransport.prototype.send = function (job) {
  return;
  // Send it via the send-template API endpoint. Assume the bodyTemplate is the template name,
  // and then convert the templateData to dot-notation for use in the template
  var request = this.generateRequest(job.info.data.payload);

  var response = HTTP.post('https://mandrillapp.com/api/1.0/messages/send-template.json', {
    data: request,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  job.log('Mandrill response', response);
  var interpretedResponse = interpretResponse(response.data[0]);
  return Emissary.handleResponse(job, interpretedResponse);
};

/**
 * (relevant) incoming data looks like this:
 *
 * {
 *    templateData:{},
 *    type:'email',
 *    to:'<email address>'
 * }
 *
 * @param  {Object} data
 * @return {Object}      The request body
 */
MandrillTransport.prototype.generateRequest = function generateRequest(data) {

  // Translate the template vars
  var globalMergeVars = [];
  var templateData = data.templateData || {};

  for (var key in templateData) {
    if (templateData.hasOwnProperty(key)) {
      globalMergeVars.push({
        name: key,
        content: templateData[key]
      });
    }
  }

  return {
    key: this._config.key,
    template_name: data.bodyTemplate,

    // This is required by the API but we don't use it anywhere
    template_content: [],
    message: {
      global_merge_vars: globalMergeVars,
      merge_language: 'handlebars',
      subject: Emissary.renderTemplate(data.subjectTemplate || '', templateData),
      from_email: this._config.fromEmail,
      from_name: this._config.fromName,
      to: [{
        email: data.transportConfig.to,
        type: 'to'
      }]
    }
  };
};

function interpretResponse(mandrillResponse) {
  var response = {
    ok: false,
    done: false,
    error: null,
    errorLevel: ERROR_LEVEL.NONE,
    status: mandrillResponse.status,
    resolution: ''
  };

  switch (mandrillResponse.status) {
  case 'sent':
  case 'queued': // Shouldn't happen, but handle it anyway
    response.ok = true;
    response.done = true;
    break;
  case 'rejected':
    switch (mandrillResponse.reject_reason) {
    case 'hard-bounce':
      // No retry - we need to turn off email for notifications temporarily until this is resolved.
      response.ok = false;
      response.error = 'Bounce';
      response.errorLevel = ERROR_LEVEL.FATAL;
      break;
    case 'soft-bounce':
      // Fail it with a non-fatal error so it'll be retried.
      response.ok = false;
      response.error = 'Soft bounce';
      response.errorLevel = ERROR_LEVEL.MINOR;
      break;
    case 'spam':
      // Recipient had previously marked the message as spam.
      // No retry - turn off email until they resolve it.
      response.ok = false;
      response.error = 'Spam';
      response.errorLevel = ERROR_LEVEL.FATAL;
      break;
    case 'unsub':
      // Recipient has unsubscribed! No retry - turn off email until they resolve it
      response.ok = false;
      response.error = 'Unsubscribed';
      response.errorLevel = ERROR_LEVEL.FATAL;
      break;
    case 'invalid-sender':
      // ALERT! ALERT!
      response.ok = false;
      response.error = 'Invalid Mandrill sender';
      response.errorLevel = ERROR_LEVEL.CATASTROPHIC;
      break;
    default:
      // We don't know - just log it and retry
      response.ok = false;
      response.error = 'Unknown reject reason: ' + response.reject_reason;
      response.errorLevel = ERROR_LEVEL.MINOR;
      break;
    }
    break;
  case 'invalid':
    // Probably same thing, we should do a fatal error here
    response.ok = false;
    response.error = 'Invalid';
    response.errorLevel = ERROR_LEVEL.FATAL;
    break;
  default:
    // Should we expect Mandrill to send the same thing every time? If so, this should be fatal. If not, it
    // should be retry-able.
    response.ok = false;
    response.error = 'Unknown Mandrill status: ' + response.status;
    response.errorLevel = ERROR_LEVEL.MINOR;
    break;
  }

  return response;
}
