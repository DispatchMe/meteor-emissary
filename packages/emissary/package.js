Package.describe({
  name: 'dispatch:emissary',
  summary: 'Queue definition and helper functions for notifications. ' +
    'Used both in notifications workers and network for async webhook support',
  version: '0.0.1'
});

Package.onUse(function (api) {

  api.use([
    // core
    'mongo',
    'underscore',
    'check',

    // Atmosphere
    'vsivsi:job-collection@1.2.2',
    'simple:json-routes@1.0.3',
    'simple:rest@0.2.3'
  ], 'server');

  api.addFiles([
    'main.js',
    'errors.js',
    'endpoints.js',
    'queue.js',
    'template.js'
  ], 'server');

  api.export(['Emissary'], 'server');
  api.export(['EmissaryJob', 'EmissaryTest'], 'server', {
    testOnly: true
  });
});

Npm.depends({
  'handlebars': '4.0.2'
});

Package.onTest(function (api) {
  api.use('sanjo:jasmine@0.16.4', ['client', 'server']);
  api.use([
    'dispatch:emissary'
  ], 'server');

  api.addFiles([
    'tests/job.js',
  ], 'server');
});
