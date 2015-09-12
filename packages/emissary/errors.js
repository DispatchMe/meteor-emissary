/* global Emissary:true */

var util = Npm.require('util');

Emissary.Error = function () {
  Error.call(this);
  this.message = '[Emissary] ' + util.format.apply(util, arguments);
  this.name = 'EmissaryError';
  this.stack = (new Error()).stack;
};

util.inherits(Emissary.Error, Error);

Emissary.FatalError = function () {
  Emissary.Error.call(this, arguments);
  this.name = 'EmissaryFatalError';
};

util.inherits(Emissary.FatalError, Emissary.Error);

var ERROR_LEVEL = {
  // No error
  NONE: 0,

  // Minor error. Retry
  MINOR: 1,

  // Fatal error. Do not retry. Turn off notifications of this type
  FATAL: 2,

  // Something is seriously fucking wrong. Wake everyone up.
  CATASTROPHIC: 3
};

Emissary.ERROR_LEVEL = ERROR_LEVEL;
