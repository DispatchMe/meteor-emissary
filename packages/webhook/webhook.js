/* global Emissary:false - from dispatch:emissary */
/* global WebhookTransport:true */

WebhookTransport = function () {};

WebhookTransport.prototype.register = function () {
  Emissary.registerWorker('webhook', {}, _.bind(this, this.send));
};

WebhookTransport.prototype.send = function (job) {
  var data = job.getMessage();

  // Generate the template
  var messageBody = Emissary.renderTemplate(data.bodyTemplate, data.templateData || {});
  var params = {
    content: messageBody,
    headers: data.to.headers || {},

    // Just timeout at 30 seconds to be safe
    timeout: 30000
  };
  if (data.to.basicAuth) {
    params.auth = data.to.basicAuth;
  }
  try {
    var response = HTTP.call(data.to.method, data.to.url, params);

    job.log('Got response: ' + response.content);

    if (data.to.expectStatus && data.to.expectStatus != response.statusCode) {
      job.done(new Emissary.Error('Expected status code %d to equal %d', response.statusCode, data.to.expectStatus));
    } else if (response.statusCode >= 299 || response.statusCode < 200) {
      job.done(new Emissary.Error('Error-level status code: %d', response.statusCode));
    } else {
      // Assume it was successful
      job.done();
    }
  } catch (err) {
    job.done(err);
  }
};
