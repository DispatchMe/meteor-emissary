/* global Emissary:false - from dispatch:emissary */
/* global MandrillTransport:false */
describe('email', function () {
  it('should generate the request body accurately', function () {

    var transport = new MandrillTransport({
      key: 'asdf1234',
      fromEmail: 'test@test.com',
      fromName: 'Test'
    });
    expect(transport.generateRequest({
      type: 'email',
      transportConfig: {
        to: 'testy@test.com',
      },
      bodyTemplate: 'foobarbaz',
      subjectTemplate: 'The subject is {{foo.bar}}',
      templateData: {
        foo: {
          bar: 'baz'
        }
      }
    })).toEqual({
      key: 'asdf1234',
      template_name: 'foobarbaz',
      template_content: [],
      message: {
        global_merge_vars: [{
          name: 'foo',
          content: {
            bar: 'baz'
          }
        }],
        merge_language: 'handlebars',
        subject: 'The subject is baz',
        from_email: 'test@test.com',
        from_name: 'Test',
        to: [{
          email: 'testy@test.com',
          type: 'to'
        }]
      }
    });
  });

  var util = Npm.require('util');

  describe('mocked mandrill responses', function () {
    var job;
    var transport;
    var turnOffs = [];
    beforeAll(function () {
      Emissary.on('turnOff', function (data) {
        turnOffs.push(data);
      });
    });

    beforeEach(function () {
      turnOffs = [];
      transport = new MandrillTransport({
        key: 'asdf1234',
        fromEmail: 'test@test.com',
        fromName: 'Test'
      });

      // Bootstrap
      job = jasmine.createSpyObj('Job', ['done', 'log']);
      job.info = {
        data: {
          type: 'sms',
          payload: {
            transportConfig: {
              to: 'test@test.com'
            }
          }
        }
      };

      spyOn(Emissary, 'emit').and.callThrough();
    });

    var params = [{
      status: 'sent',
      error: null
    }, {
      status: 'rejected',
      reject_reason: 'hard-bounce',
      error: Emissary.FatalError,
      turnOff: true,
      offReason: 'Bounce'
    }, {
      status: 'rejected',
      reject_reason: 'spam',
      error: Emissary.FatalError,
      turnOff: true,
      offReason: 'Spam'
    }, {
      status: 'rejected',
      reject_reason: 'unsub',
      error: Emissary.FatalError,
      turnOff: true,
      offReason: 'Unsubscribed'
    }, {
      status: 'rejected',
      reject_reason: 'foo',
      error: Emissary.Error
    }, {
      status: 'invalid',
      error: Emissary.FatalError,
      turnOff: true,
      offReason: 'Invalid'
    }, {
      status: 'boop',
      error: Emissary.Error
    }];

    params.forEach(function (param) {
      it(util.format('should handle status %s, reject_reason %s successfully', param.status, param.reject_reason ||
        '(none)'), function () {
        spyOn(HTTP, 'post').and.returnValue({
          statusCode: 200,
          data: [{
            status: param.status,
            reject_reason: param.reject_reason
          }]
        });

        transport.send(job);
        expect(HTTP.post).toHaveBeenCalled();

        if (param.error) {
          expect(job.done).toHaveBeenCalledWith(jasmine.any(Error));

        } else {
          expect(job.done).toHaveBeenCalledWith();
        }

        if (param.turnOff) {
          expect(turnOffs.length).toEqual(1);
        } else {
          expect(turnOffs.length).toEqual(0);
        }

      });
    });

  });
});
