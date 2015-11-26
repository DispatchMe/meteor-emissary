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
 * @param {Function} retrieveEntities Function to get a list of entities/documents. The retrieved document is passed
 *                                    through the formatter functions for the respective type
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
  // You need different stuff depending if you're on the client or the server
  var checkSchema = {
    events: [String],
    notificationTypes: [{
      type: String,
      multi: Match.Optional(Boolean),
      getConfig: Function
    }],
    receivePreferences: [{
      type: String,
      check: Function
    }],
    prefix: Match.Optional(String),
  };

  if (Meteor.isServer) {
    checkSchema = _.extend(checkSchema, {
      getPotentialRecipientsForEvent: Function,
      retrieveEntities: Function,
      generateTemplateData: Function,
      transformJob: Match.Optional(Function),
      skipFilter: Match.Optional(Function),
      transformMessage: Match.Optional(Function)
    });
  }
  check(config, checkSchema);

  if (!config.prefix) {
    config.prefix = 'notifications';
  }

  if (!config.notificationTypes) {
    // Defaults
    config.notificationTypes = [{
      type: 'email',
      getConfig: function (recipient) {
        return {
          to: recipient.email
        };
      }
    }, {
      type: 'sms',
      getConfig: function (recipient) {
        return {
          to: recipient.phoneNumber
        };
      }
    }, {
      type: 'push',
      getConfig: function (recipient) {
        return {
          to: recipient._id
        };
      }
    }, {
      type: 'webhook',
      multi: true,

      // Here, if it's multi, config will be the relevant element of the array instead of the array
      getConfig: function (recipient, config, eventName) {
        // If there's config for the particular event, use that. Otherwise use
        if (config.webhook[eventName].config) {
          return config.webhook[eventName].config;
        }
        return config.webhook.config;
      }
    }];
  }

  this._config = config;

  this._defineSchema();
};

if (Meteor.isServer) {
  /**
   * Schema looks like this:
   * {
   *     sms:{
   *         when:{
   *             always:[...],
   *             work_hours:[...]
   *         },
   *         events:{
   *             jobCreated:{
   *                 timing:{
   *                     delay:0,
   *                     timeout:0
   *                 },
   *                 templates:{
   *                     body:'',
   *                     subject:''
   *                 },
   *                 config:{...}
   *             }
   *         },
   *         config{...}
   *     }
   * }
   *
   *
   * {
   *     type1:{
   *         when:{
   *             always:[],
   *             day:[],
   *             night:[]
   *         },
   *         events:{
   *             event1:[
   *
   *             ]
   *         }
   *     }
   *
   * }
   * @param  {String} eventName Event name
   * @param  {Object} eventData Arbitrary data to pass to the event handlers
   */
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
      Emissary.log('Sending message:', msg.type, 'to', msg.transportConfig);

      Emissary.queueTask(msg.type, _.omit(msg, 'type'), transform).then(function (response) {
        console.log('SENT', response);
      }).catch(function (err) {
        console.log('FAILED');
        console.log(err.stack);
      });

    });
  };
}

EmissaryRouter._defineSchema = function () {
  var receivePreferenceOptions = _.pluck(this._config.receivePreferences, 'type');
  var prefix = this._config.prefix;
  var notificationTypes = this._config.notificationTypes;
  var events = this._config.events;
  var defaults = {};
  var schema = {};

  notificationTypes.forEach(function (type) {
    var schemaPrefix;
    if (type.multi === true) {
      defaults[type.type] = [];
      schemaPrefix = type.type + '.$';
    } else {
      defaults[type.type] = {};
      schemaPrefix = type.type;
    }

    schema[schemaPrefix + '.events'] = {
      type: Object
    };
    if (type.multi !== true)
      defaults[type.type].events = {};

    events.forEach(function (evt) {
      schema[schemaPrefix + '.events.evt'] = {
        type: Object
      };

      if (type.multi !== true)
        defaults[type.type].events[evt] = {
          timing: {
            delay: 0,
            timeout: 0
          },
          templates: {
            body: '',
            subject: ''
          }
        };

      // Receive preference...
      schema[schemaPrefix + '.events.' + evt + '.when'] = {
        type: String,
        allowedValues: receivePreferenceOptions
      };

      // Timing...
      schema[schemaPrefix + '.events.' + evt + '.timing'] = {
        type: Object
      };

      schema[schemaPrefix + '.events.' + evt + '.timing.delay'] = {
        type: Number,
        defaultValue: 0
      };

      schema[schemaPrefix + '.events.' + evt + '.timing.timeout'] = {
        type: Number,
        defaultValue: 0
      };

      // Templates...
      schema[schemaPrefix + '.events.' + evt + '.templates'] = {
        type: Object
      };

      schema[schemaPrefix + '.events.' + evt + '.templates.body'] = {
        type: String,
        defaultValue: ''
      };

      schema[schemaPrefix + '.events.' + evt + '.templates.subject'] = {
        type: String,
        defaultValue: ''
      };

      // Arbitrary config per type per event
      schema[schemaPrefix + '.events.' + evt + '.config'] = {
        type: Object,
        blackbox: true
      };
    });

    // Arbitrary config per type for all events of that type
    schema[schemaPrefix + '.config'] = {
      type: Object,
      blackbox: true
    };
  });

  Configuration.setSchemaForPrefix(prefix, schema);

  if (!Configuration.hasDefaultForPrefix(prefix)) {
    Configuration.setDefaultForPrefix(prefix, defaults);
  }
};
