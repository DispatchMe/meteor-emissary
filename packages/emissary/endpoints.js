/* global Emissary:true */
/* global JsonRoutes:false - from simple:json-routes */
var webhooks = {};

var rootUrl = null;
/**
 * Register an endpoint as a webhook/callback. For transports to use when dealing with asynchronous APIs that 
 * communicate status updates and failures via webhook. Note that these endpoints aren't actually created until you run
 * Emissary.enableWebhooks(). This lets you choose which server you use for your endpoints.
 * 
 * @param  {String}   method   The HTTP method
 * @param  {String}   uri      The endpoint URI in your domain
 * @param  {Function} callback The function to execute when the endpoint is hit
 * @param  {Function}   [parser]   If provided, this will be passed the raw `request` object and expected to return
 *                                 an array of arguments to pass to your callback. Otherwise the request body is 
 *                                 assumed to be JSON and the JSON-parsed body will be passed as the only argument to
 *                                 your callback
 * @param {Function} middleware If provided, will be registered as middleware. Must be a function that takes a `path`
 *                              and `connect` argument, and then you can run `connect.use(path, connectMiddleware)`.
 */
Emissary.registerWebhookEndpoint = function (method, uri, callback, parser, middleware) {
  if (uri.substr(0, 1) !== '/') {
    throw new Emissary.Error('Webhook URI must begin with a forward slash');
  }

  uri = '/emissary' + uri;
  if (webhooks.hasOwnProperty(uri)) {
    throw new Emissary.Error('There is already a webhook endpoint registered at URI %s', uri);
  }

  webhooks[uri] = {
    method: method,
    callback: callback,
    parser: parser,
    middleware: middleware
  };

};

/**
 * Turn on the webhook endpoints. Uses simple:rest
 */
Emissary.enableWebhooks = function () {
  for (var uri in webhooks) {
    if (webhooks.hasOwnProperty(uri)) {
      var hook = webhooks[uri];
      var options = {
        httpMethod: hook.method.toLowerCase(),
        url: uri
      };

      if (hook.parser && _.isFunction(hook.parser)) {
        options.getArgsFromRequest = hook.parser;
      }

      if (hook.middleware) {
        hook.middleware(uri, JsonRoutes.Middleware);
      }

      Meteor.method(uri, hook.callback, options);
    }
  }
};

Emissary.setRootUrl = function (url) {
  rootUrl = url;

  // Make sure it ends with a slash
  if (rootUrl.substr(-1) !== '/') {
    rootUrl += '/';
  }
};

Emissary.getFullUrlForEndpoint = function (endpoint) {
  var path = '/emissary' + endpoint;

  if (rootUrl === null) {
    throw new Emissary.Error(
      'In order to use webhooks you must first set the root URL of your server with Emissary.setRootUrl()');
  }

  return rootUrl + path;
};
