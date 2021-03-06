/* global Emissary:true */

Emissary._types = {};

Emissary.debug = false;

Emissary.registerType = function(type, schema) {
  if (Emissary._types.hasOwnProperty(type)) {
    console.warn('Warning: overriding predefined Emissary type %s', type);
    throw new Emissary.Error('Schema has already been registered for type %s', type);
  }

  Emissary._types[type] = schema;
};

// The "to" property is just the email address
Emissary.registerType('email', {
  to: String
});

// The "to" property is just the phone number
Emissary.registerType('sms', {
  to: String,
  from: Match.Optional(String)
});

// The "to" property has all of the following info:
Emissary.registerType('webhook', {
  headers: Match.Optional(Object),
  url: String,
  method: Match.OneOf('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
  basicAuth: Match.Optional(String),
  expectStatus: Match.Optional(Number)
});

// The "to" property is just the user ID to pass to raix:push, but we could have more for different transports so
// use an object here
Emissary.registerType('push', {
  userId: String,
  badge: Match.Optional(Number),
  payload: Match.Optional(Object)
});

// Use this so we can set up logging transports in the future if we want to
Emissary.log = console.log;
