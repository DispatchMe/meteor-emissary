Mandrill Transport
===============

Send an email notification using the Mandrill API

## Setup
Note: You need a Mandrill account to use this package

Add the package as a dependency of another package:

```javascript
api.use(['dispatch:emissary-transport-mandrill'], 'server');
```

Or just use it in your root application:

```bash
$ meteor add dispatch:emissary-transport-mandrill
```

## Usage

### Configuration/Working the Queue
```javascript
var transport = new MandrillTransport({
  key:'<Mandrill API key>',
  fromEmail:'no-reply@mycompany.com',
  fromName:'My Company'
});

transport.register();
```

The above will create a new Mandrill transport and register it to work `"email"` messages in the Emissary job queue. 

### Queueing Messages
The body template functions a bit different than other transports. Mandrill let's you define templates in their interface, so instead of being the raw Handlebars template, `bodyTemplate` in this case is the name of the template in Mandrill.

Note that at the moment, this package only supports Handlebars as the merge language.

```javascript
Emissary.queueTask('email', {
  bodyTemplate:'<Mandrill template name>',
  subjectTemplate:'<subject handlebars template>',
  templateData:{},
  to:'person@email.com'
})
```
