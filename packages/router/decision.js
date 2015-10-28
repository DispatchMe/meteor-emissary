/* global Configuration:false - from dispatch:configuration */
/* global Emissary:false - from dispatch:emissary */
/* global EmissaryRouter:true */

EmissaryRouter._determineRecipients = function(evt, data) {
  var get = EmissaryRouter._config.getPotentialRecipientsForEvent;
  if (!get || !_.isFunction(get)) {
    throw new Error('EmissaryRouter must be initialized with a getPotentialRecipientsForEvent function');
  }

  return get(evt, data);
};

EmissaryRouter._generateMessages = function(recipients, eventName, eventData) {
  // For each recipient we get a list of outgoing messages, which are constructed from the inherited
  // configuration and look like this:
  //
  // {
  //    type:'push|email|sms|webhook',
  //    to:{<different, depending on the type>},
  //    subjectTemplate:'<string template>',
  //    bodyTemplate:'<either string template or mandrill template ID, for email>',
  //    templateData:{<defined by custom function>},
  //    delay:<from timing.delay config>,
  //    timeout:<from timing.timeout config>
  // }
  //
  var templateData = {};
  if (_.isFunction(EmissaryRouter._config.generateTemplateData)) {
    templateData = EmissaryRouter._config.generateTemplateData(eventName, eventData);
  }

  var bulkConfig = Configuration.getForEntities(recipients, eventData);
  var messages = [];

  var retrieveEntities = EmissaryRouter._config.retrieveEntities;
  if (!retrieveEntities || !_.isFunction(retrieveEntities)) {
    throw new Emissary.Error('Missing retrieve entities function on EmissaryRouter');
  }

  /**
   * The retrieveEntities function should return a key/value
   * @type {[type]}
   */
  var entities = retrieveEntities(recipients);
  var entity;
  var entityID;
  bulkConfig.forEach(function(conf, idx) {
    entityID = recipients[idx][0] + '_' + recipients[idx][1];
    entity = entities[entityID];
    if(!entity) {
      throw new Emissary.Error('Entity ID %s not found', entityID);
    }
    messages = messages.concat(getMessagesForRecipient(recipients[idx],
      entities[recipients[idx][0] + '_' + recipients[idx][1]] || null, conf, eventName, eventData, templateData));
  });

  // Add the template data to each message. Allow for custom template data per recipient as well so you can say
  // their name and stuff
  messages = messages.map(function(msg) {
    // We want to keep the template data that may already be on the msg
    msg.templateData = _.extend({}, templateData, msg.templateData || {});

    // And finally run the full message through the transformer, in case you want to maybe dynamically generate
    // some template data based on other data, stuff like that.
    if (_.isFunction(EmissaryRouter._config.transformMessage)) {
      msg = EmissaryRouter._config.transformMessage(msg, eventName, eventData);
    }
    return msg;
  });

  Emissary.log('Got %d messages for event %s', messages.length, eventName);

  return messages;
};

/**
 * Return messages to send to a particular recipient
 * @param  {Array} recipientIdentifier   Tuple <entity_type, entity_id>
 * @param  {Object} recipient       The recipient data returned by the `retrieveEntities` function
 * @param  {Object} recipientConfig Configuration settings for this recipient
 * @param  {String} eventName
 * @param  {String} eventData
 * @return {Array}                 List of messages to send
 */
function getMessagesForRecipient(recipientIdentifier, recipient, recipientConfig, eventName, eventData, templateData) {
  if (!recipient) {
    console.warn('Could not find recipient with info %s:%s', recipientIdentifier[0], recipientIdentifier[1]);
  }

  var messages = getNotificationMessagesForRecipient(recipient, recipientIdentifier,
    recipientConfig, eventName, eventData, templateData);

  // Attach the original recipient info to each message if we need to adjust configuration in the workers (for
  // example, if an email hard-bounces and we need to turn it off)
  messages.forEach(function(msg) {
    msg.recipient = recipientIdentifier;
  });


  return messages;
}

/**
 * Messages look like this:
 *
 * {
 *    type:'push|email|sms|webhook',
 *    transportConfig:{<different, depending on the type>},
 *    subjectTemplate:'<handlebars template>',
 *    bodyTemplate:'<either handlebars template or mandrill template ID, for email>',
 *    templateData:{<depending on eventPrefix and id},
 *    delay:<from timing.delay config>,
 *    timeout:<from timing.timeout config>
 * }
 *
 * @param  {String} type            The type of notification (e.g. "push")
 * @param  {Array} recipient        Tuple of recipient info [entity_type, entity_id]
 * @param  {Object} recipientConfig Config retrieved for recipient, specific for this type and event.
 * @param  {String} eventName       Name of the event
 * @param  {Object} eventData       Data about the event
 * @return {Object}                 Message to send
 */
function generateMessageForType(type, recipient, recipientConfig, eventName, eventData, templateData) {

  var messageTypeConfig = _.findWhere(EmissaryRouter._config.notificationTypes, {
    type: type
  });

  if (!messageTypeConfig) {
    throw new Emissary.Error('No notification type registered for "%s"', type);
  }

  var getConfig = messageTypeConfig.getConfig;
  if (!getConfig || !_.isFunction(getConfig)) {
    throw new Emissary.Error('No config getter registered for type %s', type);
  }

  return {
    type: type,
    subjectTemplate: recipientConfig.templates.subject || '',
    bodyTemplate: recipientConfig.templates.body || '',
    delay: recipientConfig.timing ? recipientConfig.timing.delay : 0,
    timeout: recipientConfig.timing ? recipientConfig.timing.timeout : 0,
    transportConfig: getConfig(recipient, recipientConfig.config, eventName, eventData, templateData)
  };
}

/**
 *
 * The "interpreted config" is everything relevant to the worker for sending an event of a particular type.
 *
 * The arbitrary config is deep extended, meaning the event-specific config overwrites individual properties of the
 * type-specific config.
 *
 * @param {Object} conf The full config for that type
 * @param {String} eventName The event name
 * @return {Object} The interpreted config with inheritance, etc
 */
function getInterpretedConfigForEvent(conf, eventName) {
  return {
    templates: conf.events[eventName].templates,
    timing: conf.events[eventName].timing,
    config: _.deepExtend((conf.config || {}), (conf.events[eventName].config || {}))
  };
}

/**
 * Get all of the notification types to send to a particular recipient
 * for the given event
 *
 * @param  {Object} recipient   The recipient, retrieved using retrieveEntities()
 * @param {Array} recipientIdentifier The tuple for interaction with dispatch:configuration [entity_type, entity_id]
 * @param  {Object} recipientConfig               Inherited(?) configuration
 * @param  {String} eventName                     The name of the event
 * @return {Array<String>}                        List of notification types, e.g ["push", "sms"]
 */
function getNotificationMessagesForRecipient(recipient, recipientIdentifier, recipientConfig,
  eventName, eventData, templateData) {
  console.log('Getting notifications for recipient:', recipientIdentifier);

  var notificationTypeConfigs = recipientConfig[EmissaryRouter._config.prefix];
  var notificationTypeConfig;
  var preferenceType;
  var conf;
  var checkFunction;

  var typesWithConfigurationErrors = _.pluck(EmissaryRouter.ConfigurationErrors.collection.find({
    entityType: recipientIdentifier[0],
    entityId: recipientIdentifier[1],
    status: 'unresolved'
  }, {
    fields: {
      type: 1
    }
  }).fetch(), 'type');

  var skipMessageTypes = [];
  // Allow users to define their own logic for skipping certain notification types
  // based on certain conditions
  if (_.isFunction(EmissaryRouter._config.skipFilter)) {
    skipMessageTypes = EmissaryRouter._config.skipFilter(recipient, recipientIdentifier,
        recipientConfig, eventName) || [];
  }

  // Check notifications errors - if there are any unresolved errors for this entity, we can't send them that
  // type of notification.
  skipMessageTypes = skipMessageTypes.concat(typesWithConfigurationErrors);

  var messages = [];
  var when;
  for (var notificationType in notificationTypeConfigs) {
    if (!notificationTypeConfigs.hasOwnProperty(notificationType)) {
      continue;
    }

    var notificationTypesByPreference = {};

    notificationTypeConfig = notificationTypeConfigs[notificationType];
    // Is it multi? Then we could potentially send more than one. Split them out into their type/index combos with
    // the configuration for that specific index
    if (_.isArray(notificationTypeConfig)) {
      for (var i = 0; i < notificationTypeConfig.length; i++) {
        conf = notificationTypeConfig[i];


        when = conf.events[eventName] ? conf.events[eventName].when : null;
        if(when) {
          if(!notificationTypesByPreference[when]) {
            notificationTypesByPreference[when] = [];
          }
          notificationTypesByPreference[when].push({
            type: notificationType,
            index: i,
            config: getInterpretedConfigForEvent(conf, eventName)
          });
        }
      }
    } else {
      when = notificationTypeConfig.events[eventName] ? notificationTypeConfig.events[eventName].when : null;
      if(when) {
        if(!notificationTypesByPreference[when]) {
          notificationTypesByPreference[when] = [];
        }
        notificationTypesByPreference[when].push({
          type: notificationType,
          config: getInterpretedConfigForEvent(notificationTypeConfig, eventName),

          // Be sure to distinguish between null and 0
          index: null
        });
      }
    }

    // Now we have something that looks like this:
    // notificationTypesByPreference = {
    //    "always":[
    //       {
    //          type:'webhook',
    //          index:0,
    //          conf:{...}
    //       }, {
    //          type:'webhook',
    //          index:1,
    //          conf:{...}
    //       }
    //    ],
    //    "night":[
    //        {
    //            type:'webhook',
    //            index:2,
    //            conf:{...}
    //        }, {
    //            type:'sms',
    //            conf:{...}
    //        }
    //    ]
    // }

    // Go through each list in the notificationTypesByPreference. If it's not empty, we use the user-defined function to
    // determine if that "preference" is currently valid. For example if the preference is "night", then the
    // user-defined function could check if it's currently night time for that recipient and return `true`, else
    // return `false`.
    var receivePreference;
    var typeConfig;
    var typeName;
    var typeIndex;

    for (preferenceType in notificationTypesByPreference) {
      if (notificationTypesByPreference.hasOwnProperty(preferenceType)) {
        receivePreference = _.findWhere(EmissaryRouter._config.receivePreferences, {
          type: preferenceType
        });
        if (receivePreference) {
          checkFunction = receivePreference.check;
        } else {
          checkFunction = null;
        }
        if (!checkFunction) {
          throw new Emissary.Error('Check function is not defined for notification type %s', preferenceType);
        }
        if (checkFunction(recipient, recipientIdentifier, recipientConfig, eventName) === true) {

          // We should send the message. Now generate the messages for each type and add them to the messages array
          for (var n = 0; n < notificationTypesByPreference[preferenceType].length; n++) {
            typeConfig = notificationTypesByPreference[preferenceType][n];
            typeName = typeConfig.type;
            typeIndex = typeConfig.index;

            if (!_.contains(skipMessageTypes, typeName)) {
              try {
                messages.push(generateMessageForType(typeName, recipient, typeConfig.config,
                eventName, eventData, templateData));
              } catch(err) {
                Emissary.log('Error generating message: ', err.message);
              }     
            }
          }
        }
      }
    }
  }

  // Now, attach the recipient to the template data
  messages.forEach(function(msg) {
    msg.templateData = {
      recipient: recipient
    };
  });


  return messages;
}
