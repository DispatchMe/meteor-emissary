/* global EmissaryRouter:true */
/* global Emissary:false - from dispatch:emissary */
/* global Configuration:false - from dispatch:configuration */
EmissaryRouter = {};

/**
 * Initialize the router with the available events and other parameters. This defines the configuration defaults and
 * schema for use with dispatch:configuration.
 *
 * @param {Object} config Config hash
 * @param {Array<String>} config.events The list of events that can be emitted through the router
 * @param {Array<String>} config.notificationTypes List of types of notifications (same types you register with 
 *                                                 Emissary.registerType). Defaults to ["email", "sms", "push", 
 *                                                 "webhook"], IE what Emissary registers by default.
 * @param {Array<Object>} config.receivePreferences Different preferences for receiving notification types. For example
 *                                                  you may want to receive a "foo" notification "always", but only 
 *                                                  receive "bar" notifications at "night". In which case the "type" 
 *                                                  values would probably be ["always", "day", "night"]. The "check"
 *                                                  property is the function that will determine if, given the potential
 *                                                  recipient, that receiving preference applies. So, for example, the
 *                                                  check function for "night" would take the recipient, look up the
 *                                                  timezone, determine what time it is in that timezone, and then
 *                                                  return true if it's between 8PM and 6AM.
 * @param {String} [config.prefix] Set the prefix in the configuration object used for emissary. Defaults to
 *                                 "notifications"
 * @param {Function} getPotentialRecipientsForEvent A function that takes an event name and event data as arguments,
 *                                                  and returns an array of tuples that will be passed directly to
 *                                                  the dispatch:configuration. This is completely unique to your 
 *                                                  application. It's used by the router to get a list of potential
 *                                                  recipients to start with before looking at configuration (receive
 *                                                  preferences, etc)
 * @param {Function} retrieveEntity Function to get an entity/document. The retrieved document is passed through the 
 *                                  "to formatters"
 * @param {Function} generateTemplateData Function to return an object to be used as the data when generating the 
 *                                        body/subject templates. Receives eventName and eventData as arguments
 * @param {Function} [transformJob] Function passed as the `transform` argument when running Emissary.queueTask. Allows
 *                                for modification/configuration changes on the vsivsi:job-collection job before it is
 *                                queued to be worked.
 * @param {Function} [skipFilter] If provided, this will let the user define which message types to skip given a
 *                                recipient and event. For example, a failsafe to make sure that push notifications are
 *                                only attempted to be sent to some type of user.
 */
EmissaryRouter.init = function (config) {
  check(config, {
    events: [String],
    notificationTypes: Match.Optional([String]),
    receivePreferences: [{
      type: String,
      check: Function
    }],
    prefix: Match.Optional(String),
    getPotentialRecipientsForEvent: Function,
    retrieveEntity: Function,
    generateTemplateData: Function,
    transformJob: Match.Optional(Function),
    skipFilter: Match.Optional(Function)
  });

  if (!config.prefix) {
    config.prefix = 'notifications';
  }

  if (!config.notificationTypes) {
    // Defaults
    config.notificationTypes = ['email', 'sms', 'push', 'webhook'];
  }

  this._config = config;

  this._defineSchema();
};

EmissaryRouter.send = function (eventName, eventData) {
  var messages = this._generateMessages(this._determineRecipients(eventName, eventData), eventName, eventData);
  var transform = function (job, data) {
    job.delay(data.delay);

    if (_.isFunction(EmissaryRouter._config.transformJob)) {
      job = EmissaryRouter._config.transformJob(job, data);
    }

    return job;
  };

  messages.forEach(function (msg) {
    Emissary.queueTask(msg.type, msg, transform);
  });
};

EmissaryRouter._defineSchema = function () {
  var receivePreferenceOptions = _.pluck(this._config.receivePreferences, 'type');
  var prefix = this._config.prefix;
  var notificationTypes = this._config.notificationTypes;
  var events = this._config.events;
  var defaults = {};
  var schema = {};

  // Templates look like this:
  // {
  //    templates:{
  //        '<event name>':{
  //            email:'<template id>',
  //            sms:'<template id>',
  //            push:'<template id>',
  //            webhook:'<template id>'
  //        }
  //    }
  // }
  schema.templates = {
    type: Object,
    optional: true
  };
  defaults.templates = {};

  // Timing configs are very similar. They define two things: 
  // (1) if not able to send in a certain # of milliseconds, do not send at all, and
  // (2) delay a certain number of milliseconds before sending the notification
  // 
  // They look like this:
  // {
  //    timing:{
  //        '<event name>':{
  //            email:{
  //                delay:<ms>,
  //                timeout:<ms>
  //            },
  //            push:{
  //                delay:<ms>,
  //                timeout:<ms>
  //            },
  //            ...
  //        }
  //    }
  // }
  schema.timing = {
    type: Object
  };
  defaults.timing = {};

  events.forEach(function (evt) {
    // Set the defaults...
    defaults.templates[evt] = {};
    defaults.timing[evt] = {};

    notificationTypes.forEach(function (type) {
      defaults.templates[evt][type] = '';
      schema['templates.' + evt + '.' + type + '.body'] = {
        type: String
      };
      schema['templates.' + evt + '.' + type + '.subject'] = {
        type: String
      };

      defaults.timing[evt][type] = {
        delay: 0,
        timeout: 0
      };

      schema['timing.' + evt + '.' + type + '.delay'] = {
        type: Number,
        defaultValue: 0
      };
      schema['timing.' + evt + '.' + type + '.timeout'] = {
        type: Number,
        defaultValue: 0
      };
    });
  });

  // Receive preferences are a bit different.
  // 
  // Note that digest exists for future use but is currently not in-scope to be
  // supported in Notifications 1.0
  // 
  // {
  //    preferences:{
  //        email:{
  //            opt1:['<event name>', '<event name>', '<event name>'],
  //            opt2:['<event name>', '<event name>'],
  //            opt3:['<event name>']
  //        },
  //        push:{
  //            opt1:['<event name>', '<event name>', '<event name>'],
  //            opt2:['<event name>', '<event name>'],
  //            opt3:['<event name>']
  //        },
  //        ...
  //    }
  // }
  schema.preferences = {
    type: Object
  };
  defaults.preferences = {};

  notificationTypes.forEach(function (type) {
    defaults.preferences[type] = {};

    receivePreferenceOptions.forEach(function (opt) {
      defaults.preferences[type][opt] = [];

      schema['preferences.' + type + '.' + opt] = {
        type: [String],
        allowedValues: events
      };
    });
  });

  schema.webhooks = {
    type: Object
  };
  defaults.webhooks = {};

  events.forEach(function (evt) {
    defaults.webhooks[evt] = {
      url: '',
      headers: {},
      method: ''
    };

    schema['webhooks.' + evt] = {
      type: Object
    };

    schema['webhooks.' + evt + '.url'] = {
      type: String
    };

    // Headers are just key/value pairs
    schema['webhooks.' + evt + '.headers'] = {
      type: Object,
      blackbox: true
    };

    // Method (POST/GET/PUT, etc)
    schema['webhooks.' + evt + '.method'] = {
      type: String,
      allowedValues: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    };
  });

  Configuration.setSchemaForPrefix(prefix, schema);

  if (!Configuration.hasDefaultForPrefix(prefix)) {
    Configuration.setDefaultForPrefix(prefix, defaults);
  }

};
