/* global Configuration:false - from dispatch:configuration */
/* global Emissary:false - from dispatch:emissary */
/* global EmissaryRouter:true */

EmissaryRouter._determineRecipients = function (evt, data) {
  var get = EmissaryRouter._config.getPotentialRecipientsForEvent;
  if (!get || !_.isFunction(get)) {
    throw new Error('EmissaryRouter must be initialized with a getPotentialRecipientsForEvent function');
  }

  return get(evt, data);
};

EmissaryRouter._generateMessages = function (recipients, eventName, eventData) {
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

  var bulkConfig = Configuration.getForEntities(recipients);
  var messages = [];

  bulkConfig.forEach(function (conf, idx) {
    messages = messages.concat(getMessagesForRecipient(recipients[idx], conf, eventName, eventData));
  });

  // Add the template data to each message
  messages.forEach(function (msg) {
    msg.templateData = templateData;
  });

  return messages;
};

function getMessagesForRecipient(recipientInfo, recipientConfig, eventName, eventData) {
  var retrieveEntity = EmissaryRouter._config.retrieveEntity;
  if (!retrieveEntity || !_.isFunction(retrieveEntity)) {
    throw new Emissary.Error('Missing retrieve entity function on EmissaryRouter');
  }
  var recipient = retrieveEntity(recipientInfo[0], recipientInfo[1]);

  if (!recipient) {
    throw new Emissary.Error('Could not find recipient with info %s:%s', recipientInfo[0], recipientInfo[1]);
  }

  var messages = getNotificationMessagesForRecipient(recipient, recipientInfo, recipientConfig, eventName, eventData);

  // Attach the original recipient info to each message if we need to adjust configuration in the workers (for
  // example, if an email hard-bounces and we need to turn it off)
  messages.forEach(function (msg) {
    msg.recipient = recipientInfo;
  });

  return messages;
}

/**
 * Messages look like this:
 *
 * {
 *    type:'push|email|sms|webhook',
 *    to:{<different, depending on the type>},
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
function generateMessageForType(type, recipient, recipientConfig, eventName, eventData) {

  var toFormatter = EmissaryRouter._toFormatters[type];
  if (!toFormatter || !_.isFunction(toFormatter)) {
    throw new Emissary.Error('No "to" formatter registered for type %s', type);
  }

  return {
    type: type,
    subjectTemplate: recipientConfig.templates.subject || '',
    bodyTemplate: recipientConfig.templates.body,
    delay: recipientConfig.timing.delay,
    timeout: recipientConfig.timing.timeout,
    to: toFormatter(recipient, recipientConfig, eventName, eventData)
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
    templates: conf[eventName].templates,
    timing: conf[eventName].timing,
    conf: _.deepExtend({}, conf.config || {}, conf[eventName].config || {})
  };
}

/**
 * Get all of the notification types to send to a particular recipient
 * for the given event
 *
 * @param  {Object} recipient   The recipient, retrieved using retrieveEntity()
 * @param {Array} recipientInfo The tuple for interaction with dispatch:configuration [entity_type, entity_id]
 * @param  {Object} recipientConfig               Inherited(?) configuration
 * @param  {String} eventName                     The name of the event
 * @return {Array<String>}                        List of notification types, e.g ["push", "sms"]
 */
function getNotificationMessagesForRecipient(recipient, recipientInfo, recipientConfig, eventName, eventData) {
  var notificationTypesByPreference = {};

  var notificationTypeConfigs = recipientConfig[EmissaryRouter._config.prefix];
  var notificationTypeConfig;
  var preferenceType;
  var eventsList;
  var conf;
  var checkFunction;

  function checkWhenAgainstEvent(when) {
    for (var preferenceType in when) {
      if (!when.hasOwnProperty(preferenceType)) {
        continue;
      }

      eventsList = when[preferenceType];

      if (eventsList.indexOf(eventName) >= 0) {
        if (!notificationTypesByPreference[preferenceType]) {
          notificationTypesByPreference[preferenceType] = [];
        }
        return preferenceType;
      }
    }
    return null;
  }

  var messages = [];

  for (var notificationType in notificationTypeConfigs) {
    if (!notificationTypeConfigs.hasOwnProperty(notificationType)) {
      continue;
    }

    notificationTypeConfig = notificationTypeConfigs[notificationType];

    // Is it multi? Then we could potentially send more than one. Split them out into their type/index combos with
    // the configuration for that specific index
    if (_.isArray(notificationTypeConfig)) {
      for (var i = 0; i < notificationTypeConfig.length; i++) {
        conf = notificationTypeConfig[i];

        preferenceType = checkWhenAgainstEvent(conf.when);
        if (preferenceType) {

          notificationTypesByPreference[preferenceType].push({
            type: notificationType,
            index: i,
            conf: getInterpretedConfigForEvent(conf, eventName)
          });
        }
      }
    } else {
      preferenceType = checkWhenAgainstEvent(notificationTypeConfig.when);
      if (preferenceType) {
        notificationTypesByPreference[preferenceType].push({
          type: notificationType,
          conf: getInterpretedConfigForEvent(notificationTypeConfig, eventName),

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

    var skipMessageTypes = [];
    // Allow users to define their own logic for skipping certain notification types
    // based on certain conditions
    if (_.isFunction(EmissaryRouter._config.skipFilter)) {
      skipMessageTypes = EmissaryRouter._config.skipFilter(recipient, recipientInfo, recipientConfig, eventName) || [];
    }

    // Check notifications errors - if there are any unresolved errors for this entity, we can't send them that
    // type of notification.
    skipMessageTypes = skipMessageTypes.concat(_.pluck(EmissaryRouter.ConfigurationErrors.collection.find({
      entityType: recipientInfo[0],
      entityId: recipientInfo[1],
      status: 'unresolved'
    }, {
      fields: {
        type: 1
      }
    }).fetch(), 'type'));

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
        if (checkFunction(recipient, recipientInfo, recipientConfig, eventName) === true) {

          // We should send the message. Now generate the messages for each type and add them to the messages array
          for (var n = 0; n < notificationTypesByPreference[preferenceType].length; n++) {
            typeConfig = notificationTypesByPreference[preferenceType][n];
            typeName = typeConfig.type;
            typeIndex = typeConfig.index;

            if (!_.contains(skipMessageTypes, typeName)) {
              messages.push(generateMessageForType(typeName, recipient, typeConfig.conf, eventName, eventData));
            }
          }
        }
      }
    }
  }

  return messages;
}
