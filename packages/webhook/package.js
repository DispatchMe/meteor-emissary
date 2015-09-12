Package.describe({
  name: 'dispatch:emissary-transport-webhook',
  summary: 'Webhook transport for emissary',
  version: '0.0.1'
});

Package.onUse(function (api) {

  api.use([
    // core
    'http',
    'underscore',
    'check',

    // Atmosphere
    'dispatch:emissary'

  ], 'server');

  api.addFiles([
    'webhook.js'
  ], 'server');

  api.export(['WebhookTransport'], 'server');
  api.export(['TestExports'], 'server', {
    testOnly: true
  });
});

Package.onTest(function (api) {
  api.use('sanjo:jasmine@0.16.4', ['client', 'server']);
  api.use([
    'http',
    'dispatch:emissary',
    'dispatch:emissary-transport-webhook'
  ], 'server');

  api.addFiles([
    'tests/webhook.js',
  ], 'server');
});
