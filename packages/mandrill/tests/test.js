/* global Emissary:false - from dispatch:emissary */
/* global EmissaryTest:false - from dispatch:emissary */
/* global MandrillTransport:false */
describe('email', function() {
  it('should generate the request body accurately', function() {

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

  describe('mocked mandrill responses', function() {
    var job;
    var transport;
    var turnOffs = [];
    beforeAll(function() {
      Emissary.on('turnOff', function(data) {
        turnOffs.push(data);
      });
    });

    beforeEach(function() {
      turnOffs = [];
      transport = new MandrillTransport({
        key: 'asdf1234',
        fromEmail: 'test@test.com',
        fromName: 'Test'
      });

      // Bootstrap
      job = Emissary.queueTask('email', {
        bodyTemplate: '',
        transportConfig: {
          to: 'test@test.com'
        }
      });

      var jobId = job.getId();

      EmissaryTest.queue.update({
        _id: jobId
      }, {
        $set: {
          status: 'running',
          // Make this up so it'll think it ran and will let us fail it
          runId: '12345'
        }
      });

      job._job._doc.status = 'running';
      job._job._doc.runId = '12345';

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

    params.forEach(function(param) {
      it(util.format('should handle status %s, reject_reason %s successfully', param.status, param.reject_reason ||
        '(none)'), function() {
        spyOn(HTTP, 'post').and.returnValue({
          statusCode: 200,
          data: [{
            status: param.status,
            reject_reason: param.reject_reason
          }]
        });

        transport.send(job);
        expect(HTTP.post).toHaveBeenCalled();
        job._job.refresh();
        if (param.error) {
          if (param.error === Emissary.FatalError) {
            // Complete failure
            expect(job.getInfo().status).toEqual('failed');
          } else {
            // Retry
            expect(job.getInfo().status).toEqual('waiting');
          }

        } else {
          expect(job.getInfo().status).toEqual('completed');
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
