emissary-router
===================

This package facilitates the decision process for turning an event liked "document created" into one or more notifications.

For example, with the appropriate configuration, the below code could end up queuing an SMS message to user #1, a push notification to user #2, and a webhook `POST` to a third-party integration.

```js
EmissaryRouter.emit('document created', {
  someKey:'someVal'
});
```

## How it works

### Configuration
This package uses the [`dispatch:configuration`](https://github.com/DispatchMe/meteor-configuration) package under the hood to facilitate schema-agnostic, inherited configuration. The configuration schema specific to the router is defined, and the defaults are initialized, when you run `EmissaryRouter.init`. Here's an example (the properties are described below):

```js
Emissary.emit({
  events:['<event 1>', '<event 2>'],
  notificationTypes:['push', 'sms', 'email'],
  receivePreferences:[{
    type:'always',
    check:function(){
      return true
    }
  }, {
    type:'at night',
    check:function(recipient) {
      return someTimeFunction.isItNightTime(recipient.timezone);
  }],
  prefix:'myNotifications',
  getPotentialRecipientsForEvent:function(){...},
  retrieveEntity:function(entityType, entityId) {...},
  generateTemplateData:function() {...},
  transformJob:function(job) {...}
});
```

#### events
These are the types of events that can possibly be sent. Because this package allows entity-level configuration on a **per event** basis, they must be defined and added to the schema here. For example:

```js
events:['userLoggedIn', 'todoListCreated', 'todoItemCompleted']
```

**IMPORTANT!** - event names are used as keys in the configuration document in MongoDB. As such, they cannot have dots/periods in them nor can they start with a dollar sign.

#### notificationTypes
Notification types in this package should match one-to-one with the types registered with `Emissary.registerType`. Here, you must also register a "to formatter" function to return the `to` property of the job in the proper format for that notification type. For example, the `to` property for an `'email'` type is just a string, while the `to` property of a `'webhook'` type is a dictionary with several key/value pairs.

The built-in Emissary types (`email`, `sms`, `push`, and `webhook`) are already registered, but if you add your own type, you must register the "to formatter" like so:

```js
EmissaryRouter.init({
  (...)
  notificationTypes:['email', 'sms', 'push', 'webhook', 'myNewType']
  (...)
});

// And later...

EmissaryRouter.registerToFormatter('myNewType', function(recipient) {
  return {
    foo:recipient.foo
  }
});
```

#### receivePreferences
Your recipients may want to receive different messages for different events, well, differently. `EmissaryRouter` lets you define one or more "receive preference" types with a function to determine if that type is currently valid. Those functions are then used internally by the router to determine if the recipient should be sent a message for a particular event.

For example, you may want to send different message types for different events based on the time of day (let's say `"always"`, `"day"`, and `"night"` are the options). In this case, you'd pass those three options to `EmissaryRouter.init`:


```js
EmissaryRouter.init({
  (...)
  receivePreferences:[
    {
      type:'always',
      check:function(){ return true;}
    }, {
      type:'night',
      check:function(recipient) {
        var timezone = recipient.timezone;
        var time = getCurrentTimeInTimezone(timezone);
        return time.hour >= 20 || time.hour < 5;
      }
    }, {
      type:'day',
      check:function(recipient) {
        ver timezone = recipient.timezone;
        var time = getCurrentTimeInTimezone(timezone);
        return time.hour >= 5 && time.hour < 20;
      }
    }
  ]
  (...)
});
```

The `preferences` key of the configuration, then, will look like this (let's say you have events `["event1", "event2"]` and message types `["sms", "email"]`):

```js
{
  notifications:{
    preferences:{
      sms:{
        day:['event1'],
        always:['event2']
      },
      email:{
        always:['event1', 'event2']
      }
    }
  }
}
```

In this case, this recipient will receive an SMS for `event1` only if it's during the daytime, but will always receive an SMS for `event2`. Similarly, she will always receive an email for both `event1` and `event2`, regardless of the time of day.

#### prefix
The prefix property allows you to configure the key on which all emissary-specific configuration is stored via the `dispatch:configuration` package. It defaults to `notifications`.

#### getPotentialRecipientsForEvent
See [Deciding who to potentially notify](#deciding-who-to-potentially-notify) - this is the function that does the decision logic.
There are three basic functions this package performs: **deciding who to potentially notify when an event occurs**, **deciding how to notify them**, and **queuing those notifications with Emissary**.

#### retrieveEntity
This is a function used by the router to fetch the entity document from the **entity tuple** (`["<entity type>", "<entity id>"]`). The return value is not used internally by the router, but is passed to several user-provided functions like the "to formatters" and the `skipFilter` function. For example:

```js
EmissaryRouter.init({
  (...)
  retrieveEntity:function(type, id) {
    return myCollectionMap[type].findOne(id);
  }
  (...)
});
```

#### generateTemplateData
This function is used to generate the `templateData` object written to the Emissary message queue (which is in turn used to fill out the templates using Handlebars). Similar to the `getPotentialRecipientsForEvent` function, there's nothing we can really do to abstract this functionality since it really depends on your application.

For example:

```js
EmissaryRouter.init({
  (...)
  generateTemplateData:function(eventName, eventData) {
    if(eventName === 'listCreated') {
      return {
        list:ListCollection.findOne(eventData.id)
      }
    }
  }
  (...)
});
```

#### transformJob
This is an optional function that you can use to modify the [vsivsi:job-collection](https://github.com/vsivsi/meteor-job-collection) Job entity before it is written to the queue. See the [job API reference](https://github.com/vsivsi/meteor-job-collection#user-content-job-api) for that package for more information (the `Job` is the single argument passed to the transform function and it expects the mutated (or unmutated) job in return).

#### skipFilter
This optional function lets you define which message types to skip given a recipient and an event. For example, you could use this as a failsafe to make sure that push notifications are only attempted to be sent to one specific type of user. In that case, the function should return `["push"]` to skip push notifications, **even if the configuration dictates otherwise**.

For example:

```js
EmissaryRouter.init({
  (...)
  skipFilter:function(recipient, recipientConfig, eventName) {
    if(recipient.type !== 'special type') {
      return ['push'];
    } 
    return [];
  }
  (...)
});
```

### Decision Logic
#### Deciding who to potentially notify
From what we can tell, there's no good way to abstract this function out of your application code and into this package - there are just too many options for the decision logic. For that reason, the meat of this function comes from the `[getPotentialRecipientsForEvent](#getPotentialRecipientsForEvent)` function passed as a configuration option when running `EmissaryRouter.init()` . 

That function is passed two arguments, the `eventName` and `eventData` (`'document created'` and `{someKey:'someVal'}` in the above example, respectively), and is expected to return an array of tuples (IE `['<entity type>', '<entity ID>']` readable by the [`dispatch:configuration`](https://github.com/DispatchMe/meteor-configuration) package. For example:

```js
return [
  ['user', '12345'],
  ['user', '55555'],
  ['integration_partner', '54321']
];
```

In the above example, your application code has determined that based on the event and event data, `user#12345`, `user#55555`, and `integration_partner#54321` should **potentially** be notified. The key here is the **potentiality** - the actual decision process for whether to **actually** send those entities a notification comes later.

#### Deciding whether to notify them
This decision is made based on the configuration for each potential recipient. The `preferences` configuration key provided during `EmissaryRouter.init` (see [receivePreferences](#receivePreferences)). For each recipient, the router reads the configuration preferences and uses the `preference.check` `skipFilter` functions to end up with an array of notification types to send, e.g. `["sms", "email"]`

#### Deciding how to notify them
In this step, the recipient document is passed through the corresponding "to formatter" for each notification type, and the payload is constructed from that, the template data returned by the `getTemplateData` function, the templates defined in the `template` section of the configuration schema, and the timing (delay, timeout) defined in the `timing` section of the configuration schema.

These are written as jobs to the Emissary queue using `Emissary.queueTask`, and from there, your registered workers will take over.
