dispatch:configuration
===============

A Meteor package that provides a simple API for working with cascading app configurations.

## A Simple Example

Let's suppose you want to allow users to configure a setting within your app. After they have changed the setting, you want to use their choice, but until then you want to use a default.

First we call `Configuration.setSchema` in common (both client and server) startup code:

```js
Configuration.setSchema(new SimpleSchema({
  hideAlerts: {type: Boolean}
}));
```

You can also call `Configuration.setSchemaForPrefix` if you want to set the schema only for a certain nested property. This is useful if you have packages that define their own configuration.

```js
Configuration.setSchemaForPrefix('myPrefix', newSimpleSchema({
  propertyUniqueToThisPackage:{type:String}
}));
```

Next we call `Configuration.setDefault` in server code to define the default values for all settings.

```js
Configuration.setDefault({
  hideAlerts: false
});
```

And later you can set the default for a prefix:

```js
Configuration.setDefaultForPrefix('myPrefix', {
  propertyUniqueToThisPackage:'foo'
});
```

Now when we want to get the settings for user "ABC", we can do this in either client or server code:

```js
var shouldHideAlerts = Configuration.user('ABC').hideAlerts;
```

And to change the user's settings (overriding the defaults) in client or server code, you only have to set the property and the database will be updated:

```js
Configuration.user('ABC').hideAlerts = true;
```

This relies on the `dispatch:bound-document` package to work. You can't set object properties or properties within arrays with this method. If you need to do so, you can call `Configuration.setForEntity` to replace the whole user config with a new one:


```js
Configuration.setForEntity('user', 'ABC', {
  hideAlerts: true
});
```

## A Complex Example

There is a default `user` entity type, but you can override it to add additional layers of inheritance. Call `Configuration.addEntityType` in common code for each entity type, including `user`. Here is an example where users inherit their configuration from the `organization` they belong to.

```js
Configuration.addEntityType('organization', {
  inherit: 'default',
  publish: function (userId) {
    // must return id or array of ids
    if (!userId) return;

    var user = Meteor.users.findOne(userId);
    if (!user) return;

    return user.organization_id;
  },
  write: function (userId, id) {
    // must return true or false
    if (!userId) return false;

    var user = Meteor.users.findOne(userId);
    if (!user) return false;

    return user.organization_id === id;
  }
});

// We override the default user entity type in order to specify inheritance from org
Configuration.addEntityType('user', {
  inherit: function (id) {
    // must return [entityType, entityId] or "default"
    var user = Meteor.users.findOne(id, {
      fields: {
        organization_id: 1
      }
    });
    if (!user || !user.organization_id) return 'default';

    return ['organization', user.organization_id];
  },
  publish: function (userId) {
    // must return id or array of ids
    return userId;
  },
  write: function (userId, id) {
    // must return true or false
    return userId === id;
  }
});
```

There are lots of possibilities. You could do role-based configuration where users inherit from role entity types like `admin` or `manager`, which in turn inherit from default.

## Configuration.addEntityType Options

 * `inherit` A function that returns `[entityType, entityId]` to inherit from or "default". Receives the entityId as first argument and any options you pass to `getForEntity` are provided as the second argument, allowing you to do complex inheritance based on calling context if necessary. For inheriting from the default configuration, you can set this to the string "default" instead of a function.
 * `write` A function that receives the `userId` and `entityId` and returns `true` or `false` to allow or disallow updating it from the client
 * `publish` A function that receives the `userId` and returns the `entityId` or array of entityIds that should be published for this type, or returns `undefined` for none
 * `cannotOverride` An array of fields in the schema that cannot be overridden (must inherit) for this entity type

## Security for Editing Defaults From Client

To allow calling `Configuration.setDefault` from client code for some users, define a role checking function using `Configuration.canEditDefault` in server code. This is like the `write` function for the default entity.

```js
Configuration.canEditDefault(function (userId) {
  if (!userId) return false;

  var userRole = new Roles.User(userId);
  return userRole.is(Roles.ADMIN);
});
```

## Edit Form

You can render a form for creating or updating entity configuration like this:

```
{{> configurationEditForm entityType="user" entityId=entityId}}
```

To render a form for editing defaults, specify `entityType="default"`, specify no `entityId`, and be sure that you have defined a security function using `Configuration.canEditDefault`.

This uses a quickForm. Refer to [aldeed:autoform](https://github.com/aldeed/meteor-autoform) for details.

## Limitations

Currently all entity IDs must be strings and must not contain the underscore character.
