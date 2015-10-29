/* global Emissary:true */
if(Meteor.isServer) {
  var EventEmitter = Npm.require('events').EventEmitter;

  // Emissary is an event emitter, so we can emit events from it
  Emissary = new EventEmitter();

} else {
  Emissary = {};
}
