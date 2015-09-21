/* global Configuration:false */

// We include a default "user" entity so that this pkg can work out of the box.
// If user needs to inherit from another entity, call this again in your code to override this one
Configuration.addEntityType('user', {
  inherit: 'default',
  publish: function (userId) {
    // must return id or array of ids
    return userId;
  },
  write: function (userId, id) {
    // must return true or false
    return userId === id;
  }
});
