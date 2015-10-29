Package.describe({
  name: 'dispatch:emissary-transport-webhook',
  summary: 'Webhook transport for emissary',
  version: '0.9.2'
});

Package.onUse(function (api) {

  api.use([
    // core
    'http@1.1.0',
    'underscore@1.0.3',
    'check@1.0.5',

    // Atmosphere
    'dispatch:emissary@0.9.2'

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
    'dispatch:emissary@0.9.2',
    'dispatch:emissary-transport-webhook'
  ], 'server');

  api.addFiles([
    'tests/webhook.js',
  ], 'server');
});
