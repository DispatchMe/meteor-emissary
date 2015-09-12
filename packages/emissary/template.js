/* global Emissary:true */

var Handlebars = Npm.require('handlebars');

/**
 * Render a template with handlebars. Used just to abstract the templating engine
 * so we can change it later
 * @param  {String} template The template
 * @param  {Object} data     Template vars for rendering
 * @return {String}          Rendered template
 */
Emissary.renderTemplate = function (template, data) {
  var tpl = Handlebars.compile(template);
  return tpl(data);
};
