/* global Configuration:false */
/* global SimpleSchema:false - from aldeed:simple-schema */

var rootCollection = new Mongo.Collection('roots', {
  connection: null
});
var childCollection = new Mongo.Collection('children', {
  connection: null
});
var grandchildCollection = new Mongo.Collection('grandchildren', {
  connection: null
});

Meteor.methods({
  dropConfigCollection: function() {
    Configuration.Collection.remove({});
  }
});

if (Meteor.isServer) {
  Configuration.canEditDefault(function() {
    return true;
  });
}

// TODO
// Make sure extending happens in the correct order and with proper deep extension
// Verify that publication is dictated by the publish functions
// Verify that client-side write is dictated by the write functions
describe('Inheritance', function() {
  afterEach(function(done) {
    Meteor.call('dropConfigCollection', done);
    rootCollection.remove({});
    childCollection.remove({});
    grandchildCollection.remove({});
  });

  beforeEach(function(done) {
    var self = this;

    var setup = function() {
      Configuration.setSchema(new SimpleSchema({
        simpleProperty: {
          type: String,
        },
        arrayProperty: {
          type: [String],
        },

        'nested.property': {
          type: Number,
        },
        arrayOfObjects: {
          type: Array,
        },
        'arrayOfObjects.$': {
          type: Object,
        },
        'arrayOfObjects.$.foo': {
          type: String,
        }
      }));

      Configuration.addEntityType('root', {
        inherit: 'default'
      });
      Configuration.addEntityType('child', {
        inherit: function(id) {
          var child = childCollection.findOne(id);
          return ['root', child.rootId];
        }
      });
      Configuration.addEntityType('grandchild', {
        inherit: function(id) {
          var grandchild = grandchildCollection.findOne(id);
          return ['child', grandchild.childId];
        }
      });

      self.rootId = rootCollection.insert({
        foo: 'bar'
      });

      self.childId = childCollection.insert({
        rootId: self.rootId
      });

      self.grandchildId = grandchildCollection.insert({
        childId: self.childId
      });
      done();
    };

    if (Meteor.isClient) {
      Tracker.autorun(function(c) {
        if (!Configuration.subscription.ready()) return;
        c.stop();
        setup();
      });
    } else {
      setup();
    }


  });

  it('should use defaults', function(done) {
    var self = this;
    Configuration.setDefault({
      simpleProperty: 'foo',
      nested: {
        property: 10
      }
    }, function(err) {
      if (err) {
        return done(err);
      }
      var config = Configuration.getForEntity('child', self.childId);
      expect(config.simpleProperty).toEqual('foo');
      expect(config.nested.property).toEqual(10);
      done();
    });


  });

  describe('parameters', function() {
    var params = [{
      root: {
        arrayProperty: ['foo', 'bar', 'baz'],
        arrayOfObjects: [{
          foo: 'bar'
        }, {
          foo: 'baz'
        }]
      },
      expectation: {
        nested: {},
        arrayProperty: ['foo', 'bar', 'baz'],
        arrayOfObjects: [{
          foo: 'bar'
        }, {
          foo: 'baz'
        }]
      }
    }, {
      root: {
        arrayProperty: ['foo', 'bar', 'baz'],
        arrayOfObjects: [{
          foo: 'bar'
        }, {
          foo: 'baz'
        }]
      },
      child: {
        arrayProperty: ['a', 'b', 'c']
      },
      expectation: {
        nested: {},
        arrayProperty: ['a', 'b', 'c'],
        arrayOfObjects: [{
          foo: 'bar'
        }, {
          foo: 'baz'
        }]
      }
    }];

    params.forEach(function(param, idx) {
      it('should work with param #' + (idx + 1).toString(), function() {
        if (param.default) {
          Configuration.setDefault(param.default);
        }

        if (param.root) {
          Configuration.setForEntity('root', this.rootId, param.root);
        }

        if (param.child) {
          Configuration.setForEntity('child', this.childId, param.child);
        }

        if (param.grandchild) {
          Configuration.setForEntity('grandchild', this.grandchildId, param.grandchild);
        }

        // Make sure grandchild is expected
        if (param.grandchild) {
          expect(JSON.stringify(Configuration.getForEntity('grandchild', this.grandchildId)))
            .toEqual(JSON.stringify(param.expectation));
        } else {
          // Make sure the child and the grandchild look the same, since the grandchild has no custom config
          expect(JSON.stringify(Configuration.getForEntity('child', this.childId)))
            .toEqual(JSON.stringify(param.expectation));
          expect(JSON.stringify(Configuration.getForEntity('grandchild', this.grandchildId)))
            .toEqual(JSON.stringify(param.expectation));
        }

      });
    });
  });


});
