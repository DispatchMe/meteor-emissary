Emissary
==========

Emissary is a flexible, scalable notifications framework for Meteor.

## What's it do?
In a nutshell, Emissary does the following:

* Configure **transports** to deliver messages of a certain type (e.g. "sms" or "email")
* Use a message queue ([vsivsi:job-collection](https://github.com/vsivsi/meteor-job-collection)) to defer the work (sending the message) to any number of worker servers
* Handle retry/fatal error logic for transport-specific error types

## Basic Concepts
### The Queue
Emissary uses [vsivsi:job-collection](https://github.com/vsivsi/meteor-job-collection) under the hood to queue up messages to be sent using a transport. The `Job` class from that package is wrapped in an `EmissaryJob` to provide additional functionality specific to Emissary.

To queue messages to be sent, you can use `Emissary.queueTask()`, like so:

```javascript
Emissary.queueTask('<message type>', {
  bodyTemplate:'<handlebars template>',
  subjectTemplate:'<optional handlebars template (depends on transport)>',
  templateData:{'<data to pass to templates>'},
  to:'<format depends on message type>',
  recipient:'<arbitrary recipient data of any type>'
});
```

### Message Types
Types are defined using `Emissary.registerType`. Transports work messages of a certain type. The types determine the format and data type of the `to` property when running `queueTask`.

There are four built-in message types:

#### sms
```javascript
{
  // phone number
  to:String
}
```

#### email
```javascript
{
  // email address
  to:String
}
```

#### webhook
```javascript
{
  to: {
    headers: Match.Optional(Object),
    url: String,
    method: Match.OneOf('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
    basicAuth: Match.Optional(String),
    expectStatus: Match.Optional(Number)
  }
}
```

#### push
```javascript
{
  // User ID (using the raix:push package)
  to:String
}
```

### Webhook Endpoints
Some transports (e.g. those relying on third-party APIs) can not know the status of the message synchronously after calling the API. For example, the Twilio API sends back a status of `"queued"`, and then later hits a designated webhook for status updates. Emissary makes it easy for transports to register webhook endpoints to accommodate these asynchronous processes.

If you use a transport that needs webhook support, you must simply call `Emissary.enableWebhooks` on a server exposed to the public (of course, this must happen after you define and register your transports just as you do in your workers). It is best practice to define and register all of your transports in a shared package, and then you can run `Emissary.enableWebhooks()` on your webhook endpoint server and `Emissary.workQueue()` on your worker server(s).

### Transports
Transports are separate packages that send messages of a certain type. For example, the [Twilio](packages/twilio/README.md) transport sends messages of type `sms` using the Twilio API.

* [Twilio](packages/twilio/README.md) (SMS)
* [Mandrill](packages/mandrill/README.md) (Email)
* [Webhook](packages/webhook/README.md)
* [Raix:Push](packages/raix-push/README.md) (Push)

#### Creating your own Transport
It's simple to create your own transport. The transport is responsible for registering itself as a worker on the Emissary job queue, so as long as the message type is registered using `Emissary.registerType`, you can add a worker function for that type.

When a message is read from the queue, the worker function is executed with the `EmissaryJob` as its single argument. The job exposes several useful functions:

* `job.done(err)` - complete the job. If `err` is defined, it will be considered a failure. If you just run `job.done()` it will be completed successfully. You can also pass an `Emissary.FatalError` instance to `job.done`, in which case the job will be failed *fatally* (meaning, it will not be retried).
* `job.log(level, msg, data)` - log an arbitrary message about the job
* `job.getInfo()` - return the data from the `vsivsi:job-collection` job document, including properties like `status` and `runId`
* `job.getMessage()` - return the data passed to `Emissary.queueTask`

You can also make use of `job.handleResponse()` to automatically run `job.done()` with the appropriate error type (or lack thereof) based on a common "response" format. This is useful if your transport uses an external API, so you can translate the API response into the common `response` and then pass it to this function.

```javascript
{
  // Set to false to signify an error, true to signify "ok/continue"
  ok:Boolean,

  // Was the message delivered successfully?
  done:Boolean,

  // If there was an error, what was it?
  error:String,
  
  // Emissary.ERROR_LEVEL.NONE|MINOR|FATAL|CATASTROPHIC
  errorLevel:Number,
  
  // Current status of the message (specific to the transport)
  status:String

  // If there was a fatal error, how should it be resolved?
  resolution:String
}
```

A fatal or catastrophic error will emit a `"turnOff"` event on the global `Emissary` object, signaling that notifications of that type should no longer be sent to that specific recipient until some action is performed. The action can be defined by the `resolution` property of the response. A minor error results in the message being retried. When `done` is `true`, the process is considered a success.

## Router
You can use the [emissary-router](packages/router/README.md) package to automatically queue notifications to be sent based on certain events. It is completely configurable and easy to use.
