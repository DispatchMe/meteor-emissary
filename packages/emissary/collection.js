/* global JobCollection:false - from vsivsi:jobs-collection */
/* global Emissary:true */



var queue = new JobCollection('Emissary.Jobs');

// We need a place to keep track of the links between external IDs and the internal Job, so we can retrieve a job
// later to mark it as successful/failed based on an asynchronous process. Like a webhook from Twilio or a long-poll
// to check status via another API
var externalIds = new Mongo.Collection('emissary.external_ids');

Emissary.collections = {
  jobs: queue,
  externalIds: externalIds
};
