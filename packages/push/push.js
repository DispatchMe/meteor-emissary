/* global Push:false - from raix:push */
/* global Emissary:false - from dispatch:emissary */
/* global PushTransport:true */
class Transport {
  constructor(config) {
    check(config, {
      from: String,
      getBadge: Match.Optional(Function),
      getPayload: Match.Optional(Function),

      // The push package will do the actual validation of this
      pushConfig:Object
    });

    this._config = config;

    Push.Configure(config.pushConfig);
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
        userId: data.to.userId
      }
    };

    if (this._config.getPayload) {
      params.payload = this._config.getPayload(data);
    }

    if (this._config.getBadge) {
      params.badge = this._config.getBadge(data);
    }

    try {
      const response = Push.serverSend(params);
      job.log('info', 'Response', response);
      job.done();
    } catch(err) {
      job.done(err);
    }
  }
}

PushTransport = Transport;
