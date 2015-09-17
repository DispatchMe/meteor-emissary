/* global Configuration:false - from dispatch:configuration */
/* global EmissaryRouter:false */
describe('generateMessages', function () {
  var isDaytime = true;
  // Just for switching test context - in actual implementations I hope it would be more complicated...
  beforeEach(function () {
    Configuration.addEntityType('foo');

    EmissaryRouter.init({
      events: ['event1', 'event2', 'event3'],
      notificationTypes: ['type1', 'type2', 'type3'],
      receivePreferences: [{
        type: 'always',
        check: function () {
          return true;
        }
      }, {
        type: 'day',
        check: function () {
          return isDaytime;
        }
      }, {
        type: 'night',
        check: function () {
          return !isDaytime;
        }
      }],
      prefix: 'emissary',

      // Just so it doesn't whine about missing required properties. This isn't actually used in this test
      getPotentialRecipientsForEvent: function () {
        return [];
      },
      retrieveEntity: function (type, id) {
        if (id === '1') {
          return {
            type1value: 'type1value',
            type2value: 'type2value'
          };
        } else if (id === '2') {
          return {
            type3value: 'type3value'
          };
        }
      },
      generateTemplateData: function () {
        return {
          foo: 'bar'
        };
      }
    });

    EmissaryRouter.registerToFormatter('type1', function (recipient) {
      return recipient.type1value;
    });

    EmissaryRouter.registerToFormatter('type2', function (recipient) {
      return recipient.type2value;
    });

    EmissaryRouter.registerToFormatter('type3', function (recipient) {
      return recipient.type3value;
    });

    Configuration.setForEntity('foo', '1', {
      emissary: {
        templates: {
          event1: {
            type1: {
              body: 'Type 1 template',
              subject: 'Type 1 subject'
            },
            type2: {
              body: 'Type 2 template',
              subject: 'Type 2 subject'
            }
          }
        },
        preferences: {
          type1: {
            always: ['event1']
          },
          type2: {
            day: ['event1']
          }
        }
      }
    });

    Configuration.setForEntity('foo', '2', {
      emissary: {
        templates: {
          event1: {
            type3: {
              body: 'Type 3 template',
              subject: 'Type 3 subject'
            }
          }
        },
        preferences: {
          type3: {
            night: ['event1']
          }
        }
      }
    });
  });

  afterEach(function () {
    Configuration.Collection.remove({});
    Configuration._entityTypes = [];
  });

  it('event1 during the day should do type1 and type2 for entity #1', function () {
    isDaytime = true;
    var messages = EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2']
    ], 'event1', null);
    expect(messages.length).toEqual(2);
    expect(messages[0]).toEqual({
      type: 'type1',
      subjectTemplate: 'Type 1 subject',
      bodyTemplate: 'Type 1 template',
      delay: 0,
      timeout: 0,
      to: 'type1value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar'
      }
    });

    expect(messages[1]).toEqual({
      type: 'type2',
      subjectTemplate: 'Type 2 subject',
      bodyTemplate: 'Type 2 template',
      delay: 0,
      timeout: 0,
      to: 'type2value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar'
      }
    });
  });

  it('event1 at night should just do type1 for entity #1 and type3 for entity#2', function () {
    isDaytime = false;
    var messages = EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2']
    ], 'event1', null);
    expect(messages.length).toEqual(2);
    expect(messages[0]).toEqual({
      type: 'type1',
      subjectTemplate: 'Type 1 subject',
      bodyTemplate: 'Type 1 template',
      delay: 0,
      timeout: 0,
      to: 'type1value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar'
      }
    });

    expect(messages[1]).toEqual({
      type: 'type3',
      subjectTemplate: 'Type 3 subject',
      bodyTemplate: 'Type 3 template',
      delay: 0,
      timeout: 0,
      to: 'type3value',
      recipient: ['foo', '2'],
      templateData: {
        foo: 'bar'
      }
    });
  });

  it('should run all the config functions with the correct arguments', function () {
    spyOn(EmissaryRouter._config, 'retrieveEntity').and.returnValue({});
    spyOn(EmissaryRouter._config, 'generateTemplateData').and.returnValue({});
    EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2']
    ], 'event1', {
      someKey: 'someVal'
    });

    expect(EmissaryRouter._config.retrieveEntity.calls.count()).toEqual(2);
    expect(EmissaryRouter._config.retrieveEntity.calls.argsFor(0)).toEqual(['foo', '1']);
    expect(EmissaryRouter._config.retrieveEntity.calls.argsFor(1)).toEqual(['foo', '2']);

    expect(EmissaryRouter._config.generateTemplateData.calls.count()).toEqual(1);
    expect(EmissaryRouter._config.generateTemplateData.calls.argsFor(0)).toEqual(['event1', {
      someKey: 'someVal'
    }]);
  });

});
