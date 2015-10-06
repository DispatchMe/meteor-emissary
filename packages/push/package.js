Package.describe({
  name: 'dispatch:emissary-transport-raix-push',
  summary: 'Push transport for emissary using raix:push',
  version: '0.5.1'
});

Package.onUse(function(api) {

  api.use([
    // core
    'http@1.1.0',
    'underscore@1.0.3',
    'check@1.0.5',
    'ecmascript',

    // Atmosphere
    'dispatch:emissary@0.5.1',
    'raix:push@3.0.0'

  ], 'server');

  api.addFiles([
    'push.js'
  ], 'server');

  api.export(['PushTransport'], 'server');
});

Package.onTest(function(api) {
  api.use('sanjo:jasmine@0.19.0', ['client', 'server']);
  api.use([
    'http',
    'dispatch:emissary-transport-raix-push',
    'dispatch:emissary@0.5.1',
    'ecmascript',
    'raix:push@3.0.0'
  ], 'server');

  api.addFiles([
    'tests/push.js'
  ], 'server');
});
