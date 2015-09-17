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
  var notificationTypesToSend = getNotificationTypesForRecipient(recipient, recipientInfo, recipientConfig, eventName);

  var messages = [];

  notificationTypesToSend.forEach(function (type) {
    messages = messages.concat(generateMessageForType(type, recipient, recipientConfig, eventName, eventData));
  });

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
 * @param  {Object} recipientConfig Config retrieved for recipient using dispatch:configuration
 * @param  {String} eventName       Name of the event
 * @param  {Object} eventData       Data about the event
 * @return {Object}                 Message to send
 */
function generateMessageForType(type, recipient, recipientConfig, eventName, eventData) {
  var timing = recipientConfig[EmissaryRouter._config.prefix].timing[eventName][type];
  var subjectTemplate = getTemplate(recipientConfig, type, eventName, 'subject');
  var bodyTemplate = getTemplate(recipientConfig, type, eventName, 'body');

  var toFormatter = EmissaryRouter._toFormatters[type];
  if (!toFormatter || !_.isFunction(toFormatter)) {
    throw new Emissary.Error('No "to" formatter registered for type %s', type);
  }

  return {
    type: type,
    subjectTemplate: subjectTemplate,
    bodyTemplate: bodyTemplate,
    delay: timing.delay,
    timeout: timing.timeout,
    to: toFormatter(recipient, recipientConfig, eventName, eventData)
  };

}

function getTemplate(config, type, evt, templateType) {
  var template = config[EmissaryRouter._config.prefix].templates[evt][type][templateType];
  if (!template) {
    // Subject templates aren't required for push
    if (type !== 'push' && templateType !== 'subject') {
      throw new Emissary.Error('Blank or missing %s template for %s:%s', templateType, type, evt);
    }
  }

  return template;
}

/**
 * Get all of the notification types to send to a particular recipient
 * for the given event
 *
 * 
 * @param  {Object} recipient   The recipient, retrieved using retrieveEntity()
 * @param {Array} recipientInfo The tuple for interaction with dispatch:configuration [entity_type, entity_id]
 * @param  {Object} recipientConfig               Inherited(?) configuration
 * @param  {String} eventName                     The name of the event
 * @return {Array<String>}                        List of notification types, e.g ["push", "sms"]
 */
function getNotificationTypesForRecipient(recipient, recipientInfo, recipientConfig, eventName) {
  var notificationTypesByPreference = {};

  // Types are defined on the schema so we can just loop through the keys. If we don't know
  // how to handle a type, we can ignore it later.
  var preferences = recipientConfig[EmissaryRouter._config.prefix].preferences || {};
  var typeConfig;
  var eventsList;
  var checkFunction;
  var notificationType;
  var preferenceType;
  for (notificationType in preferences) {
    if (!preferences.hasOwnProperty(notificationType)) {
      continue;
    }

    typeConfig = preferences[notificationType];
    for (preferenceType in typeConfig) {
      if (typeConfig.hasOwnProperty(preferenceType)) {
        if (!notificationTypesByPreference[preferenceType]) {
          notificationTypesByPreference[preferenceType] = [];
        }
        eventsList = typeConfig[preferenceType] || [];
        if (eventsList.indexOf(eventName) >= 0) {
          // If they want to be notified of this event for a certain receipt preference,
          // add it to that corresponding array.
          notificationTypesByPreference[preferenceType].push(notificationType);
        }
      }

    }
  }

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
  // determine if that "preference" is currently valid. For example if the preference is "night", then the user-defined
  // function could check if it's currently night time for that recipient and return `true`, else return `false`.
  var notificationTypes = [];
  var receivePreference;
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
        notificationTypes = notificationTypes.concat(notificationTypesByPreference[preferenceType]);
      }
    }
  }

  // This is now all of the notification types we need to send based on the recipient's configuration
  return _.uniq(_.difference(notificationTypes, skipMessageTypes));
}
