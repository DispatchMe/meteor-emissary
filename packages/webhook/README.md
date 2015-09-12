Webhook Transport
===============

Hit an arbitrary endpoint as a notification

## Setup

Add the package as a dependency of another package:

```javascript
api.use(['dispatch:emissary-transport-webhook'], 'server');
```

Or just use it in your root application:

```bash
$ meteor add dispatch:emissary-transport-webhook
```

## Usage

### Configuration/Working the Queue
In this package, the configuration for the HTTP request itself is stored on the job. So there is no configuration for the transport.

```javascript
var transport = new WebhookTransport();

transport.register();
```

### Queuing Messages
The HTTP request configuration is defined when you run `Emissary.queueTask`.

```javascript
Emissary.queueTask('webhook', {
  bodyTemplate:'<arbitrary handlebars template for request body>',
  templateData:{<data to fill in bodyTemplate with>},
  to:{
    headers:{
      'Content-Type':'text/plain',
      'Some Other Header':'some value'
    },
    url:'https://mydomain.com/webhook',
    method:'POST',
    basicAuth:'username:password',
    expectStatus:200
  }
});
```

#### Parameters
* **headers** - optional dictionary of request headers
* **url** - full URL of the endpoint
* **method** - HTTP method ("GET", "POST", "PUT", "DELETE", or "PATCH")
* **basicAuth** - optional credentials for HTTP basic auth. Format with '<username>:<password>'
* **expectStatus** - if this is provided, the request will be considered a failure if the response status code does not equal this value. Otherwise, it will be considered a failure if it is not a 200-level status code'
