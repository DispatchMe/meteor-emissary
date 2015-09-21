function isWriteDenied(userId, doc) {
  var type = doc.entityType;

  if (type === '_default') {
    return !Configuration._canEditDefault(userId);
  }

  return !Configuration._entityTypeWrite[type](userId, doc.entityId);
}

Configuration.Collection.allow({
  insert: _.constant(true),
  update: _.constant(true),
  remove: _.constant(true)
});

Configuration.Collection.deny({
  insert: isWriteDenied,
  update: isWriteDenied,
  remove: isWriteDenied
});

Configuration._canEditDefault = _.constant(false);
Configuration.canEditDefault = function (func) {
  check(func, Function);
  Configuration._canEditDefault = func;
};
