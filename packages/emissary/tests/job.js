/* global EmissaryJob:false */

describe('Helpers', function () {
  describe('updateJobAccordingToResponse()', function () {
    var job;
    beforeEach(function () {
      job = new EmissaryJob(null);
      spyOn(job, 'getId').and.returnValue('12345');
      spyOn(job, 'done').and.returnValue(true);
      spyOn(job, 'log').and.returnValue(true);
      spyOn(job, 'getInfo').and.returnValue({
        type: 'sms'
      });
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

        job.handleResponse(response);
        param.expect();
      });
    });
  });
});
