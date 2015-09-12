/* global TestExports:false */
var util = Npm.require('util');

describe('Twilio', function () {
  describe('Interpret Response', function () {
    var params = [{
      status: 'delivered',
      expect: {
        ok: true,
        done: true
      }
    }, {
      status: 'sending',
      expect: {
        ok: true,
        done: false
      }
    }, {
      status: 'sent',
      expect: {
        ok: true,
        done: false
      }
    }, {
      status: 'queued',
      expect: {
        ok: true,
        done: false
      }
    }, {
      status: 'undelivered',
      errorCode: '30001',
      expect: {
        ok: false,
        done: false,
        error: 'Queue overflow',
        errorLevel: 1
      }
    }, {
      status: 'undelivered',
      errorCode: '30002',
      expect: {
        ok: false,
        done: false,
        error: 'Account suspended',
        errorLevel: 3
      }
    }, {
      status: 'undelivered',
      errorCode: '30003',
      expect: {
        ok: false,
        done: false,
        error: 'Unreachable destination',
        errorLevel: 2
      }
    }, {
      status: 'undelivered',
      errorCode: '30004',
      expect: {
        ok: false,
        done: false,
        error: 'Blacklisted',
        errorLevel: 2
      }
    }, {
      status: 'undelivered',
      errorCode: '30005',
      expect: {
        ok: false,
        done: false,
        error: 'Unknown destination',
        errorLevel: 2
      }
    }, {
      status: 'undelivered',
      errorCode: '30006',
      expect: {
        ok: false,
        done: false,
        error: 'Landline',
        errorLevel: 2
      }
    }, {
      status: 'undelivered',
      errorCode: '30007',
      expect: {
        ok: false,
        done: false,
        error: 'Carrier violation (content/spam filtering)',
        errorLevel: 1
      }
    }, {
      status: 'undelivered',
      errorCode: '30009',
      expect: {
        ok: false,
        done: false,
        error: 'Missing segment (network error)',
        errorLevel: 1
      }
    }, {
      status: 'undelivered',
      errorCode: '50000',
      expect: {
        ok: false,
        done: false,
        error: 'Unknown',
        errorLevel: 1
      }
    }, {
      status: 'asdfasdf',
      errorCode: '50000',
      expect: {
        ok: false,
        done: false,
        error: 'Unrecognized status (asdfasdf)',
        errorLevel: 1
      }
    }];

    params.forEach(function (param) {
      it(util.format('should interpret status:%s errorCode:%s correctly', param.status, param.errorCode ||
        '(none)'), function () {
        expect(TestExports.interpretResponse(param.status, param.errorCode)).toEqual(
          jasmine.objectContaining(param.expect));
      });
    });
  });

});
