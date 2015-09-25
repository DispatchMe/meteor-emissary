/* global EmissaryRouter:true */
/* global Emissary:false - from dispatch:emissary */

EmissaryRouter.ConfigurationErrors = {
  collection: new Mongo.Collection('emissary_errors'),
  addNew: function (type, error, entityType, entityId, resolution) {
    return this.collection.insert({
      status: 'unresolved',
      type: type,
      error: error,
      timestamp: new Date(),
      entityType: entityType,
      entityId: entityId,
      resolution: resolution
    });
  }
};

// Listen to Emissary fatal errors and create a corresponding entry in the configuration errors collection
Emissary.on('turnOff', function (data) {
  var job = data.job;
  var reason = data.reason;
  var resolution = data.resolution;
  var type = job.getInfo().type;
  var jobData = job.getMessage();
  var recipient = jobData.recipient;

  if (recipient && _.isArray(recipient)) {
    EmissaryRouter.ConfigurationErrors.addNew(type, reason, recipient[0], recipient[1], resolution);
  }

});
