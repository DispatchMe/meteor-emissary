Package.describe({
  name: 'dispatch:emissary',
  summary: 'Extensible/configurable notifications package',
  version: '0.2.2'
});

Package.onUse(function (api) {

  api.use([
    // core
    'mongo@1.1.0',
    'underscore@1.0.3',
    'check@1.0.5',

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
