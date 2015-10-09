Package.describe({
  name: 'dispatch:emissary-router',
  summary: 'Config-based decision logic and message queuing for Emissary',
  version: '0.8.1'
});

Package.onUse(function(api) {

  api.use([
    // core
    'mongo@1.1.0',
    'underscore@1.0.3',
    'check@1.0.5',

    // Atmosphere
    'dispatch:configuration@0.1.0',

    'gfk:underscore-deep@1.0.0'
  ], ['client', 'server']);

  api.use([
    'dispatch:emissary@0.8.1',
  ], 'server');

  api.addFiles([
    'router.js'
  ], ['client', 'server']);

  api.addFiles([
    'errors.js',
    'decision.js'
  ], 'server');

  api.export(['EmissaryRouter'], ['client', 'server']);
});

Npm.depends({
  'handlebars': '4.0.2'
});

Package.onTest(function(api) {
  api.use('sanjo:jasmine@0.18.0', ['client', 'server']);
  api.use([
    'dispatch:emissary@0.8.1',
    'dispatch:emissary-router',
    'dispatch:configuration@0.0.7'
  ], 'server');

  api.addFiles([
    'tests/generateMessages.js',
    'tests/emit.js'
  ], 'server');
});
