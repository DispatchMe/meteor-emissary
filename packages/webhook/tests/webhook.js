/* global WebhookTransport:false */
/* global Emissary:false - from dispatch:emissary */

describe('webhook', function () {
  var params = [{
    response: {
      statusCode: 200
    },
    expectError: null,
    expectBody: '{"foo":"bar"}',
    jobData: {
      bodyTemplate: '{"foo":"{{foo}}"}',
      templateData: {
        foo: 'bar'
      },
      to: {
        headers: {
          'Content-Type': 'application/json'
        },
        url: 'http://test.com/test',
        method: 'POST',
        expectStatus: 200
      }
    }
  }, {
    response: {
      statusCode: 400
    },
    expectError: Emissary.Error,
    expectBody: '{"foo":"bar"}',
    jobData: {
      bodyTemplate: '{"foo":"{{foo}}"}',
      templateData: {
        foo: 'bar'
      },
      to: {
        headers: {
          'Content-Type': 'application/json'
        },
        url: 'http://test.com/test',
        method: 'POST',
        expectStatus: 200
      }
    }
  }];

  var transport = new WebhookTransport();

  params.forEach(function (param, idx) {
    it('should work with param #' + idx.toString(), function () {
      spyOn(HTTP, 'call').and.returnValue(param.response);

      var jobSpy = jasmine.createSpyObj('job', ['log', 'done', 'getMessage']);
      jobSpy.getMessage.and.returnValue(param.jobData);

      transport.send(jobSpy);
      expect(HTTP.call).toHaveBeenCalledWith(param.jobData.to.method, param.jobData.to.url, {
        content: param.expectBody,
        headers: param.jobData.to.headers,
        timeout: 30000
      });

      if (param.expectError) {
        expect(jobSpy.done).toHaveBeenCalledWith(jasmine.any(param.expectError));
      } else {
        expect(jobSpy.done).toHaveBeenCalledWith();
      }
    });
  });
});
