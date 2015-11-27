/* global Emissary:false */

describe('Helpers', function () {
  describe('updateJobAccordingToResponse()', function () {
    var job;
    beforeEach(function () {
      job = jasmine.createSpyObj('Job', ['done', 'log']);
      job.info = {
        data: {
          type: 'sms'
        }
      };

    });

    var params = [{
      response: {
        ok: true,
        done: true

      },
      expect: function () {
        expect(job.done).toHaveBeenCalledWith();
      }
    }, {
      response: {
        ok: true,
        done: false,
        status: 'foo'
      },
      expect: function () {
        expect(job.done).not.toHaveBeenCalled();
        expect(job.log).toHaveBeenCalledWith('Current status: foo');
      }
    }];

    params.forEach(function (param, idx) {
      it('should work with param #' + (idx + 1).toString(), function () {
        var response = param.response;
        if (!response.error) {
          response.error = null;
        }
        if (!response.errorLevel) {
          response.errorLevel = 0;
        }

        Emissary.handleResponse(job, response);
        param.expect();
      });
    });
  });
});
