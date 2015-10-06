Package.describe({
  name: 'dispatch:emissary-transport-mandrill',
  summary: 'Mandrill transport for emissary',
  version: '0.5.1'
});

Package.onUse(function (api) {

  api.use([
    // core
    'http@1.1.0',
    'underscore@1.0.3',
    'check@1.0.5',

    // Atmosphere
    'dispatch:emissary@0.5.1'

  ], 'server');

  api.addFiles([
    'mandrill.js'
  ], 'server');

  api.export(['MandrillTransport'], 'server');
  api.export(['TestExports'], 'server', {
    testOnly: true
  });
});

Package.onTest(function (api) {
  api.use('sanjo:jasmine@0.16.4', ['client', 'server']);
  api.use([
    'http',
    'dispatch:emissary-transport-mandrill',
    'dispatch:emissary@0.5.1',
  ], 'server');

  api.addFiles([
    'tests/test.js'
  ], 'server');
});
