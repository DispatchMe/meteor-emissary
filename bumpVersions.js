/* global require:false */
// Mock meteor stuff available in the package file...(kinda hacky)
global.Package = {
  describe: function (description) {
    this.description = description;
  },
  onUse: function () {
    return;
  },
  onTest: function () {
    return;
  }
};

global.api = {
  use: function () {
    return;
  },
  addFiles: function () {
    return;
  },
  export: function () {
    return;
  }
};

global.Npm = {
  depends: function () {
    return;
  }
};

function escapeRegExp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

// Get the emissary one (use that version for everything)
require('./packages/emissary/package');
var version = global.Package.description.version;

var parts = version.split('.');
var major = parseInt(parts[0]),
  minor = parseInt(parts[1]),
  patch = parseInt(parts[2]);

switch (process.argv[2]) {
case 'major':
  major++;
  minor = 0;
  patch = 0;
  break;
case 'minor':
  minor++;
  patch = 0;
  break;
default:
  patch++;
  break;
}

var newVersion = major.toString() + '.' + minor.toString() + '.' + patch.toString();
console.log(newVersion);

// Replace versions with new ones
var packagesToReplace = ['mandrill', 'router', 'twilio', 'webhook'];

var fs = require('fs');

fs.writeFileSync('packages/emissary/package.js', fs.readFileSync('packages/emissary/package.js').toString().replace(
  "version: '" + version + "'", "version: '" + newVersion + "'"));

packagesToReplace.forEach(function (pkg) {
  fs.writeFileSync('packages/' + pkg + '/package.js', fs.readFileSync('packages/' + pkg + '/package.js').toString()
    .replace(new RegExp(escapeRegExp('dispatch:emissary@' + version), 'g'), 'dispatch:emissary@' +
      newVersion).replace("version: '" + version + "'", "version: '" + newVersion + "'"));
});
