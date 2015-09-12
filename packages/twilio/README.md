Twilio Transport
===============

Send an SMS notification using the Twilio API

## Setup
Note: You need a Twilio account to use this package

Add the package as a dependency of another package:

```javascript
api.use(['dispatch:emissary-transport-twilio'], 'server');
```

Or just use it in your root application:

```bash
$ meteor add dispatch:emissary-transport-twilio
```

## Usage

### Configuration/Working the Queue
```javascript
var transport = new TwilioTransport({
  sid:'<Twilio SID>',
  from:'<Valid "From" number in your Twilio account>',
  token:'<Twilio Auth Token>'
});

transport.register();
```

The above will create a new Twilio transport and register it to work `"sms"` messages in the Emissary job queue. 

### Setting up the Webhook
Twilio's API is asynchronous, so you don't know the status of the SMS right away. Instead, Twilio can hit a predefined URL via a webhook when the message status changes. This functionality is built into this package - all you have to do is turn on webhooks on a public-facing server after registering your transport:

```javascript
Emissary.enableWebhooks();
```

### Queuing Messages
```javascript
Emissary.queueTask('sms', {
  bodyTemplate:'<Handlebars template>',
  templateData:{},
  to:'+15555555555'
})
```

