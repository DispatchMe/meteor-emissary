/* global SimpleSchema:false - from aldeed:simple-schema */
/* global BoundDocument:false - from dispatch:bound-document */
/* global MongoObject:false = from aldeed:simple-schema */

Configuration = {};

Configuration.Collection = new Mongo.Collection('entity_configuration');

// This is done as a function for use in testing
Configuration._reset = function () {
  Configuration._entityTypes = [];
  Configuration._entityTypeInherits = {};
  Configuration._entityTypePublish = {};
  Configuration._entityTypeWrite = {};
  Configuration._entityTypeForbiddenFields = {};
};
Configuration._reset();

/**
 * Go through each property in a SimpleSchema and make it optional
 * (because all configuration settings are optional so we can do inheritance)
 * @param  {SimpleSchema} simpleSchema
 * @return {SimpleSchema}
 */
function makeSchemaOptional(simpleSchema) {
  var schema = simpleSchema.schema();
  for (var key in schema) {
    if (schema.hasOwnProperty(key)) {
      var prop = schema[key];
      prop.optional = true;
    }
  }

  return new SimpleSchema(schema);
}

/**
 * Set the configuration object schema.
 *
 * @param {SimpleSchema} simpleSchema
 */
Configuration.setSchema = function (simpleSchema) {
  Configuration._schema = simpleSchema = makeSchemaOptional(simpleSchema);

  var ss = new SimpleSchema({
    _id: {
      type: String
    },
    entityType: {
      type: String
    },
    entityId: {
      type: String
    },
    config: {
      type: simpleSchema,
      optional: true
    }
  });

  ss.addValidator(function () {
    if (this.isFromTrustedCode) return;

    ss.messages({
      '_config_forbidden': '[label] cannot be overridden for the ' + type + ' entity type'
    });

    // Extract type from the ID
    var id = this.docId;
    if (typeof id !== 'string') return '_config_forbidden';
    if (id === '_default') return;

    // We are assuming that entity IDs will never have an underscore, which is pretty safe
    var type = id.match(/^.*(?=_)/);
    var forbidden = Configuration._entityTypeForbiddenFields[type];
    if (!forbidden) return '_config_forbidden';

    function keyIsForbidden(key) {
      return _.any(forbidden, function (forbiddenKey) {
        return forbiddenKey === key || key.indexOf(forbiddenKey + '.') > -1;
      });
    }

    if (this.isSet && keyIsForbidden(this.key)) {
      return '_config_forbidden';
    }
  });

  Configuration.Collection.attachSchema(ss, {
    replace: true
  });
};

/**
 * Set the schema for a specific nested prefix. Useful for other packages to define their own configuration
 * using a unique prefix
 * @param {String} prefix       The prefix
 * @param {SimpleSchema} simpleSchema The schema to use for that property
 */
Configuration.setSchemaForPrefix = function (prefix, simpleSchema) {
  if (!(simpleSchema instanceof SimpleSchema)) {
    simpleSchema = new SimpleSchema(simpleSchema);
  }
  var schema;
  if (Configuration._schema) {
    schema = Configuration._schema.schema();
  } else {
    schema = {};
  }
  schema[prefix] = {
    type: makeSchemaOptional(simpleSchema),
    optional: true
  };

  Configuration.setSchema(new SimpleSchema(schema));
};

/**
 * Add a custom entity type. Can also be called with type 'user' to change the default user type.
 *
 * Also adds a convenience function: Configuration[type](id, options)
 *
 * @param {String} type    Any string that identifies the type of entity, e.g., user, organization, account, group
 * @param {Object} [options]
 * @param {Function|String} [options.inherit] Returns [entityType, entityId] to inherit from
 *   or "default". Receives the entityId as first argument and any options you pass to
 *   `getForEntity` are provided as the second argument, allowing you to do complex
 *   inheritance based on calling context if necessary.
 * @param {Function} [options.write] Gets the userId and entityId and returns true or false
 *   to allow or disallow updating it from the client
 * @param {Function} [options.publish] Gets the userId and returns the entityId or array of
 *   entityIds that should be published for this type, or returns undefined for none
 * @param {String[]} [options.cannotOverride] List of fields in the schema that cannot
 *   be overridden (must inherit) for this entity type
 */
Configuration.addEntityType = function (type, options) {
  check(type, String);
  check(options, Match.Optional(Match.ObjectIncluding({
    inherit: Match.Optional(Match.OneOf('default', Function)),
    write: Match.Optional(Function),
    publish: Match.Optional(Function)
  })));

  // If options is undefined, just set it to a blank object so we don't get "cannot read property of undefined"
  // errors below
  options = options || {};

  Configuration._entityTypes.push(type);
  Configuration._entityTypePublish[type] = options.publish || _.constant(undefined);
  Configuration._entityTypeWrite[type] = options.write || _.constant(true);
  Configuration._entityTypeForbiddenFields[type] = options.cannotOverride || [];

  var inherit = options.inherit || 'default';
  // If it's the string "default", we change to a function that returns "default" for consistency
  if (inherit === 'default') inherit = _.constant('default');
  Configuration._entityTypeInherits[type] = inherit;

  // Add a convenience function
  Configuration[type] = function (id, options) {
    return Configuration.getForEntity(type, id, options);
  };
};

/**
 * Figure out list of entities to extend from based on the inherit() function on each entity
 * definition.
 *  
 * @param  {String} type    entity type
 * @param  {String} id      entity ID
 * @param  {Object} options arbitrary options to pass to inherit() function for context
 * @return {Array}          Array of arrays, like this: [["<entity>", "<id>"], ["<entity>", "<id>"]]
 */
Configuration._resolveInheritance = function (type, id, options) {
  var requestedTypeInheritFunction = Configuration._entityTypeInherits[type];
  var whatToInherit = requestedTypeInheritFunction ? requestedTypeInheritFunction(id, options) : 'default';
  var extendList = [];
  while (whatToInherit !== 'default') {
    // whatToInherit should be [entityType, entityId]
    // TODO should support ObjectId
    // Check doesn't support [String,String] so we assert the length afterwards
    check(whatToInherit, [String]);
    if (whatToInherit.length !== 2) {
      throw new Error('Inherit function must return an array of ["<type>", "<id>"]');
    }

    extendList.push(whatToInherit);

    // Next level
    requestedTypeInheritFunction = Configuration._entityTypeInherits[whatToInherit[0]];
    whatToInherit = requestedTypeInheritFunction ? requestedTypeInheritFunction(whatToInherit[1], options) :
      'default';
  }
  return extendList;
};

/**
 * Get the configuration object for an entity, extended with all inherited values.
 *
 * @param   {String}   type   The type of entity, e.g., 'user'
 * @param   {String}   id     The entity ID (Currently no support for ObjectId)
 * @param  {Options} options  Additional options
 * @param {Boolean} options.inherit Set to false to retrieve configuration for this entity without going through 
 *                                  inheritance
 * @param {Boolean} options.bind Set to true to return a bound document which will automatically update the database
 *                               when modified
 * @returns {Object}          A configuration object. If options.bind == true, non-object properties within it will set 
 *                            into the database using the dispatch:bound-document package
 */
Configuration.getForEntity = function (type, id, options) {
  var configDoc;

  options = options || {};

  var bind = options.bind === true;

  var queryOptions = {};
  if (bind) {
    queryOptions.bind = true;
  }
  // If inherit is explicitly false, we only want the actual config for this entity.
  if (options.inherit === false) {
    configDoc = Configuration.Collection.findOne(type + '_' + id, queryOptions);
    return configDoc && configDoc.config;
  }

  var extendList = Configuration._resolveInheritance(type, id, options);
  configDoc = Configuration._extendEntity(type, id, extendList, null);
  if (bind) {
    configDoc = new BoundDocument(Configuration.Collection, configDoc);
  }

  return configDoc.config;
};

/**
 * Extend an entity given a list of configuration documents to extend from.
 *
 * This is used by both Configuration.getForEntity and Configuration.getForEntities (bulk)
 *   
 * @param  {String} type       The type of entity
 * @param  {String} id         The entity ID
 * @param  {Array} extendList  Result of Configuration._resolveInheritance
 * @param  {Object} cache      If provided, is expected to be key/value pairs of id:document.
 *                             Used by getForEntities to avoid multiple unnecessary queries
 * @return {Object}            The resulting document
 */
Configuration._extendEntity = function (type, id, extendList, cache) {
  // Otherwise start with default or empty
  var configDoc = Configuration.Collection.findOne('_default') || {};

  // Then extend with inherited types in reverse order
  var extendId;
  var doc;
  for (var i = extendList.length - 1; i >= 0; i--) {
    doc = null;
    extendId = extendList[i][0] + '_' + extendList[i][1];
    if (cache) {
      doc = cache[extendId];
      if (!doc) {
        console.warn('Cache provided but key %s is not in the cache!', extendId);
      }

    }

    // Failsafe here to find it if it's not in the cache
    if (!doc) {
      doc = Configuration.Collection.findOne(extendId);
    }
    _.deepExtend(configDoc, doc, true);
  }

  // And finally extend with the actual requested type
  var mainDoc;
  var mainId = type + '_' + id;
  if (cache) {
    mainDoc = cache[mainId];
  }
  if (!mainDoc) {
    mainDoc = Configuration.Collection.findOne(mainId);
  }
  _.deepExtend(configDoc, mainDoc, true);

  // Because of all the extending we've done, we could not use
  // bind: true in the findOne calls or various props would be
  // bound to various doc IDs. We want all props bound to the requested
  // ID regardless of where the values came from.
  //
  // Also, the `_id` at this point should be the requested type ID, but
  // if the requested type does not exist yet, it will be some other ID,
  // so we will set it here. This is why we use specific _id instead of
  // random.
  configDoc._id = mainId;

  return configDoc;
};

/**
 * Sets the full configuration document for an entity.
 *
 * This function has two valid signatures:
 * 1) Configuration.setForEntity(type, id, props, callback)
 * 2) Configuration.setForEntity(type, id, props, overwrite, callback)
 *
 * 
 * @param {String} type         Entity type
 * @param {String} id           Entity _id
 * @param {Object} props        Config properties, or entire doc if overwrite is true. 
 *                              Must be valid according to your schema.
 * @param {Boolean} overwrite   Whether to override all existing config with provided props, 
 *                              or to just update the provided props. Applies only when there is an
 *                              existing document
 * @param {Function} [callback] Optional callback for the insert or update call.
 */
Configuration.setForEntity = function (type, id, props, overwrite, callback) {
  // Support for two signatures: 

  if (_.isFunction(overwrite)) {
    callback = overwrite;
    overwrite = false;
  }

  if (!_.contains(Configuration._entityTypes, type)) {
    throw new Error('You must call Configuration.addEntityType to add this entity type first');
  }

  // Since this can be called in client code, we do not use upsert.
  var exists = !!Configuration.Collection.findOne(type + '_' + id, {
    fields: {
      _id: 1
    }
  });

  if (exists) {

    // Are we overwriting? Or just updating individual props?
    var modifier = {};

    if (overwrite) {
      modifier = props;
    } else {
      modifier.$set = new MongoObject({
        config: props
      }).getFlatObject({
        keepArrays: true
      });
    }

    Configuration.Collection.update({
      _id: type + '_' + id
    }, modifier, callback);
  } else {
    Configuration.Collection.insert({
      _id: type + '_' + id,
      entityType: type,
      entityId: id,
      config: props
    }, callback);
  }
};

/**
 * Sets the default configuration document.
 *
 * Note that this is not an upsert because we want to be able to run it on the client
 * as well, so we need to check if it exists already. A tiny optimization could be to
 * run an upsert only on server.
 *
 * @param {Object} doc Config doc. Must be valid according to your schema.
 * @param {Function} [callback] Optional callback for the insert or update call.
 */
Configuration.setDefault = function (doc, callback) {
  // Since this can be called in client code, we do not use upsert.
  var exists = !!Configuration.Collection.findOne('_default', {
    fields: {
      _id: 1
    }
  });

  if (exists) {
    Configuration.Collection.update({
      _id: '_default'
    }, {
      $set: {
        config: doc
      }
    }, callback);
  } else {
    Configuration.Collection.insert({
      _id: '_default',
      entityType: '_default',
      entityId: '_default',
      config: doc
    }, callback);
  }
};

/**
 * Set the configuration defaults for a particular prefix. Useful for packages
 * that register their own unique configuration
 * @param {String}   prefix   The prefix
 * @param {Object}   data     The default dataa
 * @param {Function} callback
 */
Configuration.setDefaultForPrefix = function (prefix, data, callback) {
  Configuration.Collection.update('_default', {
    $set: {
      prefix: data
    }
  }, callback);
};

/**
 * Returns the default configuration document, as last passed to `Configuration.setDefault`
 * @returns {Object} Config doc. Must be valid according to your schema.
 */
Configuration.getDefault = function (bind) {
  var queryOptions = bind ? {
    bind: true
  } : {};
  var configDoc = Configuration.Collection.findOne('_default', queryOptions);
  return configDoc && configDoc.config;
};

Configuration.hasDefault = function () {
  return Configuration.Collection.find('_default').count() === 1;
};

/**
 * Has a default been defined for this prefix?
 * @param  {String}  prefix
 * @return {Boolean}
 */
Configuration.hasDefaultForPrefix = function (prefix) {
  if (!Configuration.hasDefault()) {
    return false;
  }
  var def = Configuration.getDefault();
  if (!def) {
    return false;
  }

  return def.hasOwnProperty(prefix);
};

/* Meteor uses old underscore, so add _.constant */
_.constant = function (value) {
  return function () {
    return value;
  };
};
