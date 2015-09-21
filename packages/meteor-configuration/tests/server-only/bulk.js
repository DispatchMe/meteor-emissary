/* global Configuration:false */
/* global SimpleSchema:false - from aldeed:simple-schema */

var rootCollection = new Mongo.Collection('roots', {
  connection: null
});
var childCollection = new Mongo.Collection('children', {
  connection: null
});



describe('getForEntities', function() {
  beforeEach(function() {
    // Something about the way velocity runs the tests make this compete with the different
    // schema in inheritance.js, so for now make them compatible.
    Configuration.setSchema(new SimpleSchema({
      simpleProperty: {
        type: String,
      },
      numberProp: {
        type: Number
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
        if (!child) {
          return 'default';
        }
        return ['root', child.rootId];
      }
    });

    Configuration.setDefault({
      simpleProperty: 'foo'
    });

    this.root1Id = rootCollection.insert({});
    this.child1Id = childCollection.insert({
      rootId: this.root1Id
    });

    this.root2Id = rootCollection.insert({});

    Configuration.setForEntity('root', this.root1Id, {
      simpleProperty: 'bar',
      numberProp: 10
    });

    Configuration.setForEntity('child', this.child1Id, {
      numberProp: 12
    });

  });

  afterEach(function() {
    Configuration.Collection.remove({});
    rootCollection.remove({});
    childCollection.remove({});
  });


  it('with inheritance', function() {


    var bulk = Configuration.getForEntities([
      ['root', this.root1Id],
      ['child', 'random unknown id'],
      ['child', this.child1Id],
      ['root', this.root2Id]
    ]);

    var root1Config = bulk[0];
    var randomChildConfig = bulk[1];
    var child1Config = bulk[2];
    var root2Config = bulk[3];

    expect(bulk.length).toEqual(4);

    expect(root1Config.simpleProperty).toEqual('bar');
    expect(root1Config.numberProp).toEqual(10);

    expect(randomChildConfig.simpleProperty).toEqual('foo');
    expect(child1Config.simpleProperty).toEqual('bar');
    expect(child1Config.numberProp).toEqual(12);

    expect(root2Config.simpleProperty).toEqual('foo');
    expect(root2Config.numberProp).toBeUndefined();
  });

  it('without inheritance', function() {
    var bulk = Configuration.getForEntities([
      ['root', this.root1Id],
      ['child', 'random unknown id'],
      ['child', this.child1Id],
      ['root', this.root2Id]
    ], {
      inherit: false
    });

    var root1Config = bulk[0];
    var randomChildConfig = bulk[1];
    var child1Config = bulk[2];
    var root2Config = bulk[3];

    console.log(root1Config);
    expect(bulk.length).toEqual(4);

    expect(root1Config.simpleProperty).toEqual('bar');
    expect(root1Config.numberProp).toEqual(10);

    expect(randomChildConfig.simpleProperty).toBeUndefined();
    expect(randomChildConfig.numberProp).toBeUndefined();

    expect(child1Config.simpleProperty).toBeUndefined();
    expect(child1Config.numberProp).toEqual(12);

    expect(root2Config.simpleProperty).toBeUndefined();
    expect(root2Config.numberProp).toBeUndefined();
  });
});
