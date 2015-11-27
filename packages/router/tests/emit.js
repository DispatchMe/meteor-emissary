/* global EmissaryRouter:false */
/* global Emissary:false - from dispatch:emissary */

var es6Promise = Npm.require('es6-promise-polyfill');

describe('emit', function () {
  it('should emit the correct messages', function () {
    EmissaryRouter._config = {};

    spyOn(EmissaryRouter, '_determineRecipients').and.returnValue([]);
    spyOn(EmissaryRouter, '_generateMessages').and.returnValue([{
      type: 'email',
      recipient: ['foo', '1']
    }, {
      type: 'sms',
      recipient: ['foo', '2']
    }]);

    spyOn(Emissary, 'queueTask').and.returnValue(es6Promise.Promise.resolve(true));

    EmissaryRouter.send('foo', {
      bar: 'baz'
    });

    expect(EmissaryRouter._generateMessages).toHaveBeenCalledWith([], 'foo', {
      bar: 'baz'
    });

    expect(Emissary.queueTask.calls.count()).toEqual(2);
    expect(Emissary.queueTask.calls.argsFor(0)).toEqual(['email', {
      recipient: ['foo', '1']
    }]);

    expect(Emissary.queueTask.calls.argsFor(1)).toEqual(['sms', {
      recipient: ['foo', '2']
    }]);
  });

});
