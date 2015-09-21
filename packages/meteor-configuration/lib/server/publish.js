Meteor.publish('__entity_configuration', function() {
  var userId = this.userId;
  var selector = {
    $or: [
      // Default is always published
      {
        entityType: '_default',
        entityId: '_default'
      }
    ]
  };

  // Call each type's publish function, which will return an ID or IDs for that type
  _.each(Configuration._entityTypePublish, function(func, type) {
    var idList = func(userId);
    if (!idList) return;

    if (!_.isArray(idList)) idList = [idList];
    if (!idList.length) return;

    selector.$or.push({
      entityType: type,
      entityId: {
        $in: idList
      }
    });
  });

  return Configuration.Collection.find(selector);
});


/**
 * Match up the array indices for the input and output of a bulk retrieval function. Results
 * will have the same index as their entity request. If there is no result for an entity request, 
 * the array's element at that index will be an empty object
 * 
 * @param  {Array} entities Array of entity objects with "type" and "id" properties
 * @param  {Array} results  Documents retrieved from Configuration.Collection
 * @return {Array}          Array with potential blank ({}) elements if the config was not found
 */
var matchBulkIndices = function(entities, results) {
  var fixedArray = [];

  var result;
  entities.forEach(function(entity) {
    result = _.findWhere(results, {
      _id: entity[0] + '_' + entity[1]
    });
    if (result) {
      fixedArray.push(result.config);
    } else {
      fixedArray.push({});
    }
  });

  return fixedArray;
};

/**
 * Retrieve the configuration for multiple entities, optimized to perform minimal database queries
 *   
 * @param  {Array<Object>} entities Array of entity tuples consisting of ["<type>", "<id>"] elements
 * @param  {Options} options  The `inherit: false` option will give you just the pure entity 
 *                            configuration object without inheriting. Any other options you 
 *                            pass are passed to the type's `inherit` function to allow 
 *                            context-specific inheritance logic.
 * @return {Array}            Array of resolved configuration objects. The indices are the same as the 
 *                            provided entities array.
 */
Configuration.getForEntities = function(entities, options) {
  options = options || {};
  check(entities, [
    [String]
  ]);

  var ids = entities.map(function(entity) {
    return entity[0] + '_' + entity[1];
  });

  // If inherit is explicitly false, we only want the actual configs for these entities.
  if (options.inherit === false) {
    return matchBulkIndices(entities, Configuration.Collection.find({
      _id: {
        $in: ids
      }
    }).fetch());
  }

  // Get a unique list of configuration docs to find based on the resolved inheritance trees for each
  // of the provided entities
  var inheritanceTrees = [];

  var docsToFindById = [];
  entities.forEach(function(entity) {
    var extendList = Configuration._resolveInheritance(entity[0], entity[1], options);
    inheritanceTrees.push(extendList);
    // We want to find this one, in addition to all the things it needs to inherit from.
    docsToFindById.push(entity[0] + '_' + entity[1]);
    extendList.forEach(function(extend) {
      docsToFindById.push(extend[0] + '_' + extend[1]);
    });
  });

  // Find all the inherited docs and store them by ID in a map to pass to _extendEntity as the cache
  var documentCache = {};
  Configuration.Collection.find({
    _id: {
      $in: docsToFindById
    }
  }).forEach(function(doc) {
    documentCache[doc._id] = doc;
  });

  // Now we can do the same stuff as the Configuration.getForEntity. Index
  // of entities will be the same as index in inheritanceTrees, so we'll use
  // that value in the call to Configuration._extendEntity
  var results = [];
  entities.forEach(function(entity, index) {
    results.push(Configuration._extendEntity(entity[0], entity[1], inheritanceTrees[index], documentCache).config);
  });

  // The above already did the same thing as matchBulkIndices, so no need to run that here.
  return results;
};
