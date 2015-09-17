/* global EmissaryRouter:true */
EmissaryRouter._toFormatters = {};
EmissaryRouter.registerToFormatter = function (type, formatter) {
  check(type, String);
  check(formatter, Function);
  EmissaryRouter._toFormatters[type] = formatter;
};

EmissaryRouter.registerToFormatter('email', function (recipient) {
  return recipient.email;
});

EmissaryRouter.registerToFormatter('sms', function (recipient) {
  return recipient.phoneNumber;
});

EmissaryRouter.registerToFormatter('push', function (recipient) {
  return recipient._id;
});

EmissaryRouter.registerToFormatter('webhook', function (recipient, config, eventName) {
  return config.webhooks[eventName];
});
