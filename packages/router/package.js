Package.describe({
  name: 'dispatch:emissary-router',
  summary: 'Config-based decision logic and message queuing for Emissary',
  version: '0.0.1'
});

Package.onUse(function (api) {

  api.use([
    // core
    'mongo',
    'underscore',
    'check',

    // Atmosphere
    'dispatch:configuration',
    'dispatch:emissary'
  ], 'server');

  api.addFiles([
    'router.js',
    'errors.js',
    'formatters.js',
    'decision.js'
  ], 'server');

  api.export(['EmissaryRouter'], 'server');
});

Npm.depends({
  'handlebars': '4.0.2'
});

Package.onTest(function (api) {
  api.use('sanjo:jasmine@0.16.4', ['client', 'server']);
  api.use([
    'dispatch:emissary',
    'dispatch:emissary-router',
    'dispatch:configuration'
  ], 'server');

  api.addFiles([
    'tests/generateMessages.js',
    'tests/emit.js'
  ], 'server');
});
