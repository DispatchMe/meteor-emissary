/* global PushTransport:false */
/* global Push:false - from raix:push */

describe('Push test', () => {
  let transport;

  beforeAll(() => {
    transport = new PushTransport({
      from: 'Dispatch',
      pushConfig: {
        certData: 'asdf',
        passphrase: 'asdf',
        keyData: 'asdf',
      }
    });
  });
  afterEach(() => {
    Push.appCollection.remove({});
  });

  it('should defer accurately to raix:push', () => {


    const userId = '12345';

    let jobSpy = jasmine.createSpyObj('job', ['log', 'done', 'getMessage']);
    jobSpy.getMessage.and.returnValue({
      bodyTemplate: 'You got a push. Yes you did.',
      subjectTemplate: 'You got a push',
      to: {
        userId: userId,
        badge: 1,
        payload: {}
      }
    });

    spyOn(Push, 'serverSend').and.returnValue(true);

    transport.send(jobSpy);

    expect(Push.serverSend).toHaveBeenCalledWith({
      from: 'Dispatch',
      title: 'You got a push',
      text: 'You got a push. Yes you did.',
      query: {
        userId: userId
      },
      payload: {},
      badge: 1
    });
  });
});
