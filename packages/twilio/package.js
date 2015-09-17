Package.describe({
  name: 'dispatch:emissary-transport-twilio',
  summary: 'Twilio transport for emissary',
  version: '0.0.1'
});

Package.onUse(function (api) {

  api.use([
    // core
    'mongo',
    'underscore',
    'check',

    // Atmosphere
    'dispatch:emissary',
    'dispatch:twilio@1.1.0'

  ], 'server');

  api.addFiles([
    'twilio.js'
  ], 'server');

  api.export(['TwilioTransport'], 'server');
  api.export(['TestExports'], 'server', {
    testOnly: true
  });
});

Npm.depends({
  'handlebars': '4.0.2',
  'twilio': '2.3.0',
  'querystring': '0.2.0'
});

Package.onTest(function (api) {
  api.use('sanjo:jasmine@0.16.4', ['client', 'server']);
  api.use([
    'dispatch:emissary-transport-twilio',
    'dispatch:emissary',
  ], 'server');

  api.addFiles([
    'tests/interpretResponse.js',
    'tests/webhook.js'
  ], 'server');
});