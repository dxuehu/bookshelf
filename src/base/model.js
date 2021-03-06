// Base Model
// ---------------
var _        = require('lodash');
var inherits = require('inherits');

var Events   = require('./events');
var slice    = Array.prototype.slice

// List of attributes attached directly from the `options` passed to the constructor.
var modelProps = ['tableName', 'hasTimestamps'];

// The "ModelBase" is similar to the 'Active Model' in Rails,
// it defines a standard interface from which other objects may inherit.
function ModelBase(attributes, options) {
  var attrs = attributes || {};
  options   = options    || {};
  this.attributes = Object.create(null);
  this._reset();
  this.relations = {};
  this.cid  = _.uniqueId('c');
  if (options) {
    _.extend(this, _.pick(options, modelProps));
    if (options.parse) attrs = this.parse(attrs, options) || {};
  }
  this.set(attrs, options);
  this.initialize.apply(this, arguments);
}
inherits(ModelBase, Events);

ModelBase.prototype.initialize = function() {};

// The default value for the "id" attribute.
ModelBase.prototype.idAttribute = 'id';

// Get the value of an attribute.
ModelBase.prototype.get = function(attr) {
  return this.attributes[attr];
};

// Set a property.
ModelBase.prototype.set = function(key, val, options) {
  if (key == null) return this;
  var attrs;

  // Handle both `"key", value` and `{key: value}` -style arguments.
  if (typeof key === 'object') {
    attrs = key;
    options = val;
  } else {
    (attrs = {})[key] = val;
  }
  options = _.clone(options) || {};

  // Extract attributes and options.
  var unset   = options.unset;
  var current = this.attributes;
  var prev    = this._previousAttributes;

  // Check for changes of `id`.
  if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

  // For each `set` attribute, update or delete the current value.
  for (var attr in attrs) {
    val = attrs[attr];
    if (!_.isEqual(prev[attr], val)) {
      this.changed[attr] = val;
    } else {
      delete this.changed[attr];
    }
    if (unset) {
      delete current[attr]
    } else {
      current[attr] = val
    }
  }
  return this;
};

// A model is new if it has never been persisted, which we assume if it lacks an id.
ModelBase.prototype.isNew = function() {
  return this.id == null;
};

ModelBase.prototype.serialize = function(options) {
  var attrs = _.clone(this.attributes);
  if (options && options.shallow) return attrs;
  var relations = this.relations;
  for (var key in relations) {
    var relation = relations[key];
    attrs[key] = relation.toJSON ? relation.toJSON(options) : relation;
  }
  if (options && options.omitPivot) return attrs;
  if (this.pivot) {
    var pivot = this.pivot.attributes;
    for (key in pivot) {
      attrs['_pivot_' + key] = pivot[key];
    }
  }
  return attrs;  
}

// Returns an object containing a shallow copy of the model attributes,
// along with the `toJSON` value of any relations,
// unless `{shallow: true}` is passed in the `options`.
// Also includes _pivot_ keys for relations unless `{omitPivot: true}`
// is passed in `options`.
ModelBase.prototype.toJSON = function(options) {
  return this.serialize(options)
};

// Returns the string representation of the object.
ModelBase.prototype.toString = function() {
  return '[Object Model]';
};

// Get the HTML-escaped value of an attribute.
ModelBase.prototype.escape = function(key) {
  return _.escape(this.get(key));
};

// Returns `true` if the attribute contains a value that is not null
// or undefined.
ModelBase.prototype.has = function(attr) {
  return this.get(attr) != null;
};

// **parse** converts a response into the hash of attributes to be `set` on
// the model. The default implementation is just to pass the response along.
ModelBase.prototype.parse = function(resp) {
  return resp;
};

// Remove an attribute from the model, firing `"change"`. `unset` is a noop
// if the attribute doesn't exist.
ModelBase.prototype.unset = function(attr, options) {
  return this.set(attr, void 0, _.extend({}, options, {unset: true}));
};

// Clear all attributes on the model, firing `"change"`.
ModelBase.prototype.clear = function(options) {
  var attrs = {};
  for (var key in this.attributes) attrs[key] = void 0;
  return this.set(attrs, _.extend({}, options, {unset: true}));
};

// **format** converts a model into the values that should be saved into
// the database table. The default implementation is just to pass the data along.
ModelBase.prototype.format = function(attrs) {
  return attrs;
};

// Returns the related item, or creates a new
// related item by creating a new model or collection.
ModelBase.prototype.related = function(name) {
  return this.relations[name] || (this[name] ? this.relations[name] = this[name]() : void 0);
};

// Create a new model with identical attributes to this one,
// including any relations on the current model.
ModelBase.prototype.clone = function() {
  var model = new this.constructor(this.attributes);
  var relations = this.relations;
  for (var key in relations) {
    model.relations[key] = relations[key].clone();
  }
  model._previousAttributes = _.clone(this._previousAttributes);
  model.changed = _.clone(this.changed);
  return model;
};

// Returns the method that will be used on save, either 'update' or 'insert'.
// This is an internal helper that uses `isNew` and `options.method` to
// determine the correct method. If `option.method` is provided, it will be
// returned, but lowercased for later comparison.
ModelBase.prototype.saveMethod = function(options) {
  var method = options && options.method && options.method.toLowerCase();
  return method || (this.isNew(options) ? 'insert' : 'update');
};

// Sets the timestamp attributes on the model, if `hasTimestamps` is set to true
// or an array. Check if the model `isNew` or if `{method: 'insert'}` is
// provided as an option and set the `created_at` and `updated_at` attributes to
// the current date if it is being inserted, and just the `updated_at` attribute
// if it's being updated. This method may be overriden to use different column
// names or types for the timestamps.
ModelBase.prototype.timestamp = function(options) {
  if (!this.hasTimestamps) return {};

  var now          = new Date();
  var attributes   = {};
  var method       = this.saveMethod(options);
  var keys         = _.isArray(this.hasTimestamps) ? this.hasTimestamps : ['created_at', 'updated_at'];
  var createdAtKey = keys[0];
  var updatedAtKey = keys[1];

  if (updatedAtKey) {
    attributes[updatedAtKey] = now;
  }

  if (createdAtKey && method === 'insert') {
    attributes[createdAtKey] = now;
  }

  this.set(attributes, options);

  return attributes;
};

// Determine if the model has changed since the last `"change"` event.
// If you specify an attribute name, determine if that attribute has changed.
ModelBase.prototype.hasChanged = function(attr) {
  if (attr == null) return !_.isEmpty(this.changed);
  return _.has(this.changed, attr);
};

// Get the previous value of an attribute, recorded at the time the last
// `"change"` event was fired.
ModelBase.prototype.previous = function(attr) {
  if (attr == null || !this._previousAttributes) return null;
  return this._previousAttributes[attr];
};

// Get all of the attributes of the model at the time of the previous
// `"change"` event.
ModelBase.prototype.previousAttributes = function() {
  return _.clone(this._previousAttributes);
};

// Resets the `_previousAttributes` and `changed` hash for the model.
// Typically called after a `sync` action (save, fetch, delete) -
ModelBase.prototype._reset = function() {
  this._previousAttributes = _.clone(this.attributes);
  this.changed = Object.create(null);
  return this;
};

// "_" methods that we want to implement on the Model.
var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit'];

// Mix in each "_" method as a proxy to `Model#attributes`.
_.each(modelMethods, function(method) {
  ModelBase.prototype[method] = function() {
    var args = slice.call(arguments);
    args.unshift(this.attributes);
    return _[method].apply(_, args);
  };
});

ModelBase.extend = require('../extend');

module.exports = ModelBase;
