/* global Push:false - from raix:push */
/* global Emissary:false - from dispatch:emissary */
/* global PushTransport:true */
class Transport {
  constructor(config) {
    check(config, {
      from: String,

      // The push package will do the actual validation of this
      pushConfig: Object
    });

    this._config = config;

    // Set the config to have no interval so we can send by ourselves
    let pushConfig = _.extend({}, config.pushConfig, {
      sendInterval: null
    });
    Push.Configure(pushConfig);
  }

  register() {
    Emissary.registerWorker('push', {}, _.bind(this.send, this));
  }

  send(job) {
    const data = job.getMessage();
    const messageBody = Emissary.renderTemplate(data.bodyTemplate, data.templateData || {});
    const messageTitle = Emissary.renderTemplate(data.subjectTemplate, data.templateData || {});

    let params = {
      from: this._config.from,
      title: messageTitle,
      text: messageBody,
      query: {
        userId: data.transportConfig.userId
      }
    };

    if (data.transportConfig.payload) {
      params.payload = data.transportConfig.payload;
    }

    if (data.transportConfig.badge) {
      params.badge = data.transportConfig.badge;
    }

    try {
      const response = Push.serverSend(params);
      job.log('info', 'Response', response);
      job.done();
    } catch (err) {
      job.done(err);
    }
  }
}

PushTransport = Transport;
