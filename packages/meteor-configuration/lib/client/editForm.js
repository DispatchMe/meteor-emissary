/* global AutoForm:false - from aldeed:autoform */

Template.configurationEditForm.helpers({
  configDoc: function () {
    var type = this.entityType;
    if (type === 'default') {
      return Configuration.getDefault();
    }
    return Configuration.getForEntity(type, this.entityId, {inherit: false});
  }
});

AutoForm.addHooks('dispatch_appConfiguration', {
  onSubmit: function (doc) {
    var self = this;

    // Move back up the tree to the configurationEditForm template instance
    var template = self.template.parent(5);

    try {
      var type = template.data.entityType;
      if (type === 'default') {
        Configuration.setDefault(doc, self.done);
      } else {
        Configuration.setForEntity(type, template.data.entityId, doc, self.done);
      }
    } catch (error) {
      console.log(error);
      self.done(error);
    }

    return false;
  }
});
