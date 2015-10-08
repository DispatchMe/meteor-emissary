/* global Configuration:false - from dispatch:configuration */
/* global EmissaryRouter:false */
describe('generateMessages', function() {
  // Just for switching test context - in actual implementations I hope it would be more complicated...
  var isDaytime = true;

  beforeEach(function() {

    Configuration.addEntityType('foo');

    EmissaryRouter.init({
      events: ['event1', 'event2', 'event3'],
      notificationTypes: [{
        type: 'type1',
        multi: false,
        getConfig: function(recipient) {
          return recipient.type1value;
        }
      }, {
        type: 'type2',
        multi: false,
        getConfig: function(recipient) {
          return recipient.type2value;
        }
      }, {
        type: 'type3',
        multi: true,
        getConfig: function(recipient, recipientConfig, eventName) {
          if (eventName === 'event1') {
            return recipientConfig.to;
          } else {
            // So we can test the extension
            return recipientConfig;
          }
        }
      }],

      receivePreferences: [{
        type: 'always',
        check: function() {
          return true;
        }
      }, {
        type: 'day',
        check: function() {
          return isDaytime;
        }
      }, {
        type: 'night',
        check: function() {
          return !isDaytime;
        }
      }],
      prefix: 'emissary',

      // Just so it doesn't whine about missing required properties. This isn't actually used in this test
      getPotentialRecipientsForEvent: function() {
        return [];
      },
      retrieveEntities: function() {
        return {
          'foo_1': {
            type1value: 'type1value',
            type2value: 'type2value'
          },
          'foo_2': {},
          'foo_3': {}
        };
      },
      generateTemplateData: function() {
        return {
          foo: 'bar'
        };
      }
    });

    Configuration.setForEntity('foo', '1', {
      emissary: {
        type1: {
          when: {
            always: ['event1']
          },
          events: {
            event1: {
              templates: {
                body: 'Type 1 template',
                subject: 'Type 1 subject'
              }
            }
          }
        },
        type2: {
          when: {
            day: ['event1']
          },
          events: {
            event1: {
              templates: {
                body: 'Type 2 template',
                subject: 'Type 2 subject'
              }
            }
          }
        }
      }
    });

    Configuration.setForEntity('foo', '2', {
      emissary: {
        type3: [{
          when: {
            night: ['event1']
          },
          events: {
            event1: {
              templates: {
                body: 'Type 3 template',
                subject: 'Type 3 subject'
              },
              config: {
                to: 'type3to'
              }
            }
          }
        }, {
          when: {
            always: ['event2']
          },
          events: {
            event2: {
              templates: {
                body: '',
                subject: ''
              },
              config: {
                nested: {
                  foo: 'bar'
                },
                other: 'baz'
              }
            }
          },
          config: {
            nested: {
              boop: 'scoop'
            },
            other: 'loop'
          }
        }]
      }
    });
    Configuration.setForEntity('foo', '3', {
      emissary: {
        type3: [{
          when: {
            day: ['event1']
          },
          events: {
            event1: {
              templates: {
                body: 'Type 3 template #3',
                subject: 'Type 3 subject #3'
              },
              config: {
                to: 'type3to #3'
              }
            }
          }
        }]
      }
    });
  });

  afterEach(function() {
    Configuration.Collection.remove({});
    Configuration._entityTypes = [];
  });

  it('event1 during the day should do type1 and type2 for entity #1, and type3 for entity #3', function() {
    isDaytime = true;
    var messages = EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2'],
      ['foo', '3']
    ], 'event1', null);

    expect(messages.length).toEqual(3);

    expect(messages[0]).toEqual({
      type: 'type1',
      subjectTemplate: 'Type 1 subject',
      bodyTemplate: 'Type 1 template',
      delay: 0,
      timeout: 0,
      transportConfig: 'type1value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar',
        recipient: {
          type1value: 'type1value',
          type2value: 'type2value'
        }
      }
    });

    expect(messages[1]).toEqual({
      type: 'type2',
      subjectTemplate: 'Type 2 subject',
      bodyTemplate: 'Type 2 template',
      delay: 0,
      timeout: 0,
      transportConfig: 'type2value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar',
        recipient: {
          type1value: 'type1value',
          type2value: 'type2value'
        }
      }
    });

    expect(messages[2]).toEqual({
      type: 'type3',
      subjectTemplate: 'Type 3 subject #3',
      bodyTemplate: 'Type 3 template #3',
      delay: 0,
      timeout: 0,
      transportConfig: 'type3to #3',
      recipient: ['foo', '3'],
      templateData: {
        foo: 'bar',
        recipient: jasmine.any(Object)
      }
    });
  });

  it('event1 at night should just do type1 for entity #1 and type3 for entity#2', function() {
    isDaytime = false;
    var messages = EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2'],
      ['foo', '3']
    ], 'event1', null);
    expect(messages.length).toEqual(2);
    expect(messages[0]).toEqual({
      type: 'type1',
      subjectTemplate: 'Type 1 subject',
      bodyTemplate: 'Type 1 template',
      delay: 0,
      timeout: 0,
      transportConfig: 'type1value',
      recipient: ['foo', '1'],
      templateData: {
        foo: 'bar',
        recipient: jasmine.any(Object)
      }
    });

    expect(messages[1]).toEqual({
      type: 'type3',
      subjectTemplate: 'Type 3 subject',
      bodyTemplate: 'Type 3 template',
      delay: 0,
      timeout: 0,
      transportConfig: 'type3to',
      recipient: ['foo', '2'],
      templateData: {
        foo: 'bar',
        recipient: jasmine.any(Object)
      }
    });
  });

  it('event 2 during the day should trigger type 3 for entity#2', function() {
    isDaytime = true;
    var messages = EmissaryRouter._generateMessages([
      ['foo', '2'],
      ['foo', '3']
    ], 'event2', null);

    expect(messages.length).toEqual(1);
    expect(messages[0]).toEqual({
      type: 'type3',
      subjectTemplate: '',
      bodyTemplate: '',
      delay: 0,
      timeout: 0,
      transportConfig: {
        nested: {
          boop: 'scoop',
          foo: 'bar'
        },
        other: 'baz'
      },
      recipient: ['foo', '2'],
      templateData: {
        foo: 'bar',
        recipient: jasmine.any(Object)
      }
    });
  });

  it('should run all the config functions with the correct arguments', function() {
    spyOn(EmissaryRouter._config, 'retrieveEntities').and.returnValue({
      'foo_1': {},
      'foo_2': {}
    });
    spyOn(EmissaryRouter._config, 'generateTemplateData').and.returnValue({});
    EmissaryRouter._generateMessages([
      ['foo', '1'],
      ['foo', '2']
    ], 'event1', {
      someKey: 'someVal'
    });

    expect(EmissaryRouter._config.retrieveEntities.calls.count()).toEqual(1);
    expect(EmissaryRouter._config.retrieveEntities.calls.argsFor(0)).toEqual(
      [
        [
          ['foo', '1'],
          ['foo', '2']
        ]
      ]
    );

    expect(EmissaryRouter._config.generateTemplateData.calls.count()).toEqual(1);
    expect(EmissaryRouter._config.generateTemplateData.calls.argsFor(0)).toEqual(['event1', {
      someKey: 'someVal'
    }]);
  });

});
