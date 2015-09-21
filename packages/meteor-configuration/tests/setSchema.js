/* global Configuration:false */
describe('setSchema', function() {
  afterEach(function() {
    // Meteor.call('dropConfigCollection', done);
  });

  it('should let you set schema for prefixes multiple times', function() {
    Configuration.setSchemaForPrefix('foo', {
      'bar.baz': {
        type: String
      }
    });


    expect(function() {
      Configuration.Collection.insert({
        _id: '1',
        entityType: 'foo',
        entityId: 'bar',
        config: {
          foo: {
            bar: {
              baz: 10
            }
          }
        }
      }, {
        autoConvert: false
      });
    }).toThrow();

    Configuration.setSchemaForPrefix('a', {
      'b.c': {
        type: Number
      }
    });
    expect(function() {
      Configuration.Collection.insert({
        _id: '2',
        entityType: 'foo',
        entityId: 'bar',
        config: {
          foo: {
            bar: {
              baz: 'string'
            }
          },
          a: {
            b: {
              c: 'string'
            }
          }
        }
      }, {
        autoConvert: false
      });
    }).toThrow();

    expect(function() {
      Configuration.Collection.insert({
        _id: '3',
        entityType: 'foo',
        entityId: 'bar',
        config: {
          foo: {
            bar: {
              baz: 'asdf'
            }
          },
          a: {
            b: {
              c: 10
            }
          }
        }
      }, {
        autoConvert: false
      });
    }).not.toThrow();
  });
});
