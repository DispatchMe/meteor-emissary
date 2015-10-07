/* global EmissaryTest:false - from dispatch:notifications-base */
/* global TwilioTransport:false - from dispatch:emissary-transport-twilio */
/* global Emissary:false - from dispatch:emissary */
/* global EmissaryJob:false - from dispatch:emissary-job */
describe('Twilio callback endpoint', function() {
  var jobId;

  var turnOffs = [];
  beforeAll(function() {
    Emissary.on('turnOff', function(data) {
      turnOffs.push(data);
    });

    var transport = new TwilioTransport({
      sid: 'mock',
      token: 'mock',
      from: 'mock',
      skipAuth: true
    });
    transport.register();
    Emissary.enableWebhooks();
  });
  beforeEach(function() {
    turnOffs = [];

    // Bootstrap
    var job = Emissary.queueTask('sms', {
      bodyTemplate: '',
      transportConfig: {
        to: '+15555555555'
      }
    });
    jobId = job.getId();

    EmissaryTest.queue.update({
      _id: jobId
    }, {
      $set: {
        status: 'running',
        // Make this up so it'll think it ran and will let us fail it
        runId: '12345'
      }
    });

    EmissaryTest.externalIds.insert({
      source: 'twilio',
      externalId: '1234-ASDF',
      jobId: jobId
    });

  });

  afterEach(function() {
    EmissaryTest.queue.remove({});
    EmissaryTest.externalIds.remove({});
  });

  it('should handle a fatal error', function() {
    // Run with the fake data
    Meteor.call('/emissary/twilio/webhook', {
      MessageSid: '1234-ASDF',
      MessageStatus: 'undelivered',
      ErrorCode: '30004' // Blacklisted
    });

    expect(turnOffs.length).toEqual(1);
    expect(turnOffs[0]).toEqual({
      job: jasmine.any(EmissaryJob),
      reason: 'Blacklisted',
      resolution: ''
    });

    // 2) Make sure the job complete failed
    var job = Emissary.getJobById(jobId);
    expect(job._job._doc.status).toEqual('failed');
  });

  it('should handle a success', function() {
    // Run with the fake data
    Meteor.call('/emissary/twilio/webhook', {
      MessageSid: '1234-ASDF',
      MessageStatus: 'delivered'
    });

    // 1) Make sure there's no entry in ConfigurationErrors for this entity
    expect(turnOffs.length).toEqual(0);

    // 2) Make sure the job completed
    var job = Emissary.getJobById(jobId);
    expect(job._job._doc.status).toEqual('completed');
  });
});
