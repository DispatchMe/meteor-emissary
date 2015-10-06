Push Transport
===============

Send a push notification using the [raix:push](https://github.com/raix/push)

## Setup
Add the package as a dependency of another package:

```javascript
api.use(['dispatch:emissary-transport-raix-push'], 'server');
```

Or just use it in your root application:

```bash
$ meteor add dispatch:emissary-transport-raix-push
```

## Usage

### Configuration/Working the Queue
The `pushConfig` is passed verbatim for [raix:push](https://github.com/raix/push). Please see the documentation for that package.

```javascript
var transport = new PushTransport({
  from:'your app',
  pushConfig:{...}
});

transport.register();
```

The above will create a new Push transport and register it to work `"push"` messages in the Emissary job queue.

### Queuing Messages
The `badge` and `payload` arguments are optional. Payload is passed verbatim to the push notification payload, so you can use it in your app.

```javascript
Emissary.queueTask('push', {
  bodyTemplate:'<handlebars template>',
  subjectTemplate:'<handlebars template>',
  templateData:{},
  to:{
    userId:'<meteor user ID>',
    badge:0,
    payload:{}
  }
})
```
