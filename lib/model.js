// Model
// ---------------
var _              = require('lodash');
var createError    = require('create-error')

var Sync           = require('./sync');
var Helpers        = require('./helpers');
var EagerRelation  = require('./eager');
var Errors         = require('./errors');

var ModelBase      = require('./base/model');
var Promise        = require('./base/promise');

/**
 * When creating an instance of a model, you can pass in the initial values of
 * the attributes, which will be {@linkcode Model#set set} on the
 * model. If you define an {@linkcode initialize} function, it will be invoked
 * when the model is created.
 *
 *     new Book({
 *       title: "One Thousand and One Nights",
 *       author: "Scheherazade"
 *     });
 *
 * In rare cases, if you're looking to get fancy, you may want to override
 * {@linkcode Model#constructor constructor}, which allows you to replace the
 * actual constructor function for your model.
 *
 *     var Books = bookshelf.Model.extend({
 *     
 *       tableName: 'documents',
 *     
 *       constructor: function() {
 *         bookshelf.Model.apply(this, arguments);
 *         this.on('saving', function(model, attrs, options) {
 *           options.query.where('type', '=', 'book');
 *         });
 *       }
 *     
 *     });
 *
 * @constructor
 * @extends ModelBase
 * @alias Bookshelf#Model
 *
 * @param {Object}   attributes            Initial values for this model's attributes.
 * @param {Object=}  options               Hash of options.
 * @param {string=}  options.tableName     Initial value for {@linkcode Model#tableName tableName}.
 * @param {boolean=} [options.hasTimestamps=false]
 *
 *   Initial value for {@linkcode Model#hasTimestamps hasTimestamps}.
 *
 * @param {boolean} [options.parse=false]
 *
 *   Convert attributes by {@linkcode Model#parse parse} before being
 *   {@linkcode Model#set set} on the model.
 *   
 */
var BookshelfModel = ModelBase.extend({

  /**
   * A required property for any database usage, The
   * {@linkcode Model#tableName tableName} property refers to the database
   * table name the model will query against.
   *
   *     var Television = bookshelf.Model.extend({
   *       tableName: 'televisions'
   *     });
   *
   * @member {string} Bookshelf#Model#tableName
   */

  /**
   * This tells the model which attribute to expect as the unique identifier
   * for each database row (typically an auto-incrementing primary key named
   * `"id"`). Note that if you are using {@link Model#parse parse} and {@link
   * Model#format format} (to have your model's attributes in `camelCase`,
   * but your database's columns in `snake_case`, for example) this refers to
   * the name returned by parse (`myId`), not the database column (`my_id`).
   *
   * @member {string} Bookshelf#Model#idAttribute
   */

  /**
   * The `hasOne` relation specifies that this table has exactly one of another
   * type of object, specified by a foreign key in the other table.
   * 
   *     var Record = bookshelf.Model.extend({
   *       tableName: 'health_records'
   *     });
   *
   *     var Patient = bookshelf.Model.extend({
   *       tableName: 'patients',
   *       record: function() {
   *         return this.hasOne(Record);
   *       }
   *     });
   *
   *     // select * from `health_records` where `patient_id` = 1;
   *     new Patient({id: 1}).related('record').fetch().then(function(model) {
   *       ...
   *     }); 
   *
   *     // alternatively, if you don't need the relation loaded on the patient's relations hash:
   *     new Patient({id: 1}).record().fetch().then(function(model) {
   *       ...
   *     });
   *
   * @function #hasOne
   * @memberOf Model
   *
   * @param {Model} Target
   *
   *   Constructor of {@linkcode Model} targeted by join.
   *
   * @param {string=} foreignKey
   *
   *   ForeignKey in the `Target` model. By default, the `foreignKey` is assumed to
   *   be the singular form of this model's {@linkcode Model#tableName tableName},
   *   followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`.
   *
   * @returns {Model}
   */
  hasOne: function(Target, foreignKey) {
    return this._relation('hasOne', Target, {foreignKey: foreignKey}).init(this);
  },

  /**
   * The `hasMany` relation specifies that this model has one or more rows in
   * another table which match on this model's primary key.
   *
   * @method Model#hasMany
   *
   * @param {Model} Target
   *
   *   Constructor of {@linkcode Model} targeted by join.
   *
   * @param {string=} foreignKey
   *
   *   ForeignKey in the `Target` model. By default, the foreignKey is assumed to
   *   be the singular form of this model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @returns {Collection}
   */
  hasMany: function(Target, foreignKey) {
    return this._relation('hasMany', Target, {foreignKey: foreignKey}).init(this);
  },
 
  /**
   * The `belongsTo` relationship is used when a model is a member of
   * another `Target` model.
   *
   * It can be used in a {@link oneToOne one-to-one} associations as the inverse
   * of a {@linkcode Model#hasOne hasOne}. It can also used in {@link oneToMany
   * one-to-many} associations as the inverse of a {@link
   * Model#hasMany hasMany} (and is the one side of that association).
   * In both cases, the belongsTo relationship is used for a model that is a
   * member of another Target model, referenced by the foreignKey in the current
   * model.
   *
   *     var Book = bookshelf.Model.extend({
   *       tableName: 'books',
   *       author: function() {
   *         return this.belongsTo(Author);
   *       }
   *     });
   * 
   *     // select * from `books` where id = 1
   *     // select * from `authors` where id = book.author_id
   *     Book.where({id: 1}).fetch({withRelated: ['author']}).then(function(book) {
   *       console.log(JSON.stringify(book.related('author')));
   *     });
   * 
   * @method Bookshelf#Model#belongsTo
   *
   * @param {Model} Target
   *
   *   Constructor of {@linkcode Model} targeted by join.
   *
   * @param {string=} foreignKey
   *
   *   ForeignKey in this model. By default, the foreignKey is assumed to
   *   be the singular form of the `Target` model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @returns {Model}
   */
  belongsTo: function(Target, foreignKey) {
    return this._relation('belongsTo', Target, {foreignKey: foreignKey}).init(this);
  },

  /**
   * Defines a many-to-many relation, where the current model is joined to one
   * or more of a `Target` model through another table. The default name for
   * the joining table is the two table names, joined by an underscore, ordered
   * alphabetically. For example, a `users` table and an `accounts` table would have
   * a joining table of accounts_users.
   *
   *     var Account = bookshelf.Model.extend({
   *       tableName: 'accounts'
   *     });
   *     
   *     var User = bookshelf.Model.extend({
   *     
   *       tableName: 'users',
   *     
   *       allAccounts: function () {
   *         return this.belongsToMany(Account);
   *       },
   *     
   *       adminAccounts: function() {
   *         return this.belongsToMany(Account).query({where: {access: 'admin'}});
   *       },
   *     
   *       viewAccounts: function() {
   *         return this.belongsToMany(Account).query({where: {access: 'readonly'}});
   *       }
   *     
   *     });  
   *
   *  The default key names in the joining table are the singular versions of the
   *  model table names, followed by `_id` /
   *  _{{{@link Model#idAttribute idAttribute}}}. So in the above case, the
   *  columns in the joining table
   *  would be `user_id`, `account_id`, and `access`, which is used as an
   *  example of how dynamic relations can be formed using different contexts.
   *  To customize the keys used in, or the {@link Model#tableName tableName}
   *  used for the join table, you may specify them like so:
   *
   *      this.belongsToMany(Account, 'users_accounts', 'userid', 'accountid');
   *
   * If you wish to create a {@link Model#belongsToMany belongsToMany}
   * association where the joining table has a primary key, and more information
   * about the model, you may create a {@link Model#belongsToMany belongsToMany}
   * {@link Relation#through through} relation:
   *
   *     var Doctor = bookshelf.Model.extend({
   *     
   *       patients: function() {
   *         return this.belongsToMany(Patient).through(Appointment);
   *       }
   *     
   *     });
   *     
   *     var Appointment = bookshelf.Model.extend({
   *     
   *       patient: function() {
   *         return this.belongsTo(Patient);
   *       },
   *     
   *       doctor: function() {
   *         return this.belongsTo(Doctor);
   *       }
   *     
   *     });
   *     
   *     var Patient = bookshelf.Model.extend({
   *     
   *       doctors: function() {
   *         return this.belongsToMany(Doctor).through(Appointment);
   *       }
   *     
   *     });
   *
   * @belongsTo Model
   * @function  Model#belongsToMany
   * @param {Model} Target
   *
   *   Constructor of {@linkcode Model} targeted by join.
   *
   * @param {string=} foreignKey
   *
   *   Foreign key in this model. By default, the `foreignKey` is assumed to
   *   be the singular form of the `Target` model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @param {string=} table
   *
   *   Name of the joining table. Defaults to the two table names, joined by an
   *   underscore, ordered alphabetically.
   *
   * @param {string=} otherKey
   *
   *   Foreign key in the `Target` model. By default, the `otherKey` is assumed to
   *   be the singular form of this model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @returns {Collection}
   */
  belongsToMany: function(Target, joinTableName, foreignKey, otherKey) {
    return this._relation('belongsToMany', Target, {
      joinTableName: joinTableName, foreignKey: foreignKey, otherKey: otherKey
    }).init(this);
  },

  /**
   * The {@link Model#morphOne morphOne} is used to signify a {@link oneToOne
   * one-to-one} {@link polymorphicRelation polymorphic relation} with
   * another `Target` model, where the `name` of the model is used to determine
   * which database table keys are used. The naming convention requires the
   * `name` prefix an `_id` and `_type` field in the database. So for the case
   * below the table names would be `imageable_type` and `imageable_id`. The
   * `morphValue` may be optionally set to store/retrieve a different value in
   * the `_type` column than the {@link Model#tableName}.
   *
   *     var Site = bookshelf.Model.extend({
   *       tableName: 'sites',
   *       photo: function() {
   *         return this.morphOne(Photo, 'imageable');
   *       }
   *     });
   *
   * And with custom `columnNames`:
   *
   *     var Site = bookshelf.Model.extend({
   *       tableName: 'sites',
   *       photo: function() {
   *         return this.morphOne(Photo, 'imageable', ["ImageableType", "ImageableId"]);
   *       }
   *     });
   *
   * Note that both `columnNames` and `morphValue` are optional arguments. How
   * your argument is treated when only one is specified, depends on the type.
   * If your argument is an array, it will be assumed to contain custom
   * `columnNames`. If it's not, it will be assumed to indicate a `morphValue`.
   *
   * @method Bookshelf#Model#morphOne
   *
   * @param {Model}     Target      Constructor of {@linkcode Model} targeted by join.
   * @param {string=}   name        Prefix for `_id` and `_type` columns.
   * @param {(string[])=}  columnNames
   *
   *   Array containing two column names, the first is the `_type`, the second is the `_id`.
   *
   * @param {string=} [morphValue=Target#{@link Model#tableName tablename}]
   *
   *   The string value associated with this relationship. Stored in the `_type`
   *   column of the polymorphic table. Defaults to `Target`#{@link Model#tableName
   *   tablename}.
   *
   * @returns {Model} The related model.
   */
  morphOne: function(Target, name, columnNames, morphValue) {
    return this._morphOneOrMany(Target, name, columnNames, morphValue, 'morphOne');
  },

  /**
   * {@link Model#morphMany morphMany} is essentially the same as a {@link
   * Model#morphOne morphOne}, but creating a {@link Collection collection}
   * rather than a {@link Model model} (similar to a {@link Model#hasOne
   * hasOne} vs. {@link Model#hasMany hasMany} relation).
   *  
   * {@link Model#morphMany morphMany} is used to signify a {@link oneToMany
   * one-to-many} or {@link manyToMany many-to-many} {@link polymorphicRelation
   * polymorphic relation} with another `Target` model, where the `name` of the
   * model is used to determine which database table keys are used. The naming
   * convention requires the `name` prefix an `_id` and `_type` field in the
   * database. So for the case below the table names would be `imageable_type`
   * and `imageable_id`. The `morphValue` may be optionally set to
   * store/retrieve a different value in the `_type` column than the `Target`'s
   * {@link Model#tableName tableName}.
   *
   *     var Post = bookshelf.Model.extend({
   *       tableName: 'posts',
   *       photos: function() {
   *         return this.morphMany(Photo, 'imageable');
   *       }
   *     });
   *
   * And with custom columnNames:
   *
   *     var Post = bookshelf.Model.extend({
   *       tableName: 'posts',
   *       photos: function() {
   *         return this.morphMany(Photo, 'imageable', ["ImageableType", "ImageableId"]);
   *       }
   *     });
   *
   * @method Bookshelf#Model#morphMany
   *
   * @param {Model}     Target      Constructor of {@linkcode Model} targeted by join.
   * @param {string=}   name        Prefix for `_id` and `_type` columns.
   * @param {(string[])=}  columnNames
   *
   *   Array containing two column names, the first is the `_type`, the second is the `_id`.
   *
   * @param {string=} [morphValue=Target#{@link Model#tableName tablename}]
   *
   *   The string value associated with this relationship. Stored in the `_type`
   *   column of the polymorphic table. Defaults to `Target`#{@link Model#tableName
   *   tablename}.
   *
   * @returns {Collection} A collection of related models.
   */
  morphMany: function(Target, name, columnNames, morphValue) {
    return this._morphOneOrMany(Target, name, columnNames, morphValue, 'morphMany');
  },

  /**
   * The {@link Model#morphTo morphTo} relation is used to specify the inverse
   * of the {@link Model#morphOne morphOne} or {@link Model#morphMany
   * morphMany} relations, where the `targets` must be passed to signify which
   * {@link Model models} are the potential opposite end of the {@link
   * polymorphicRelation polymorphic relation}.
   *
   *     var Photo = bookshelf.Model.extend({
   *       tableName: 'photos',
   *       imageable: function() {
   *         return this.morphTo('imageable', Site, Post);
   *       }
   *     });
   *
   * And with custom columnNames:
   *
   *     var Photo = bookshelf.Model.extend({
   *       tableName: 'photos',
   *       imageable: function() {
   *         return this.morphTo('imageable', ["ImageableType", "ImageableId"], Site, Post);
   *       }
   *     });
   * 
   * @method Bookshelf#Model#morphTo
   *
   * @param {string}      name        Prefix for `_id` and `_type` columns.
   * @param {(string[])=} columnNames
   *
   *   Array containing two column names, the first is the `_type`, the second is the `_id`.
   *
   * @param {...Model} Target Constructor of {@linkcode Model} targeted by join.
   *
   * @returns {Model}
   */
  morphTo: function(morphName) {
    var columnNames, remainder;
    if (!_.isString(morphName)) throw new Error('The `morphTo` name must be specified.');
    if (_.isArray(arguments[1])) {
      columnNames = arguments[1];
      remainder = _.rest(arguments, 2);
    } else {
      columnNames = null;
      remainder = _.rest(arguments);
    }
    return this._relation('morphTo', null, {morphName: morphName, columnNames: columnNames, candidates: remainder}).init(this);
  },

  /**
   * Helps to create dynamic relations between {@link Model models} and {@link
   * Collection collections}, where a {@link Model#hasOne hasOne}, {@link
   * Model#hasMany hasMany}, {@link Model#belongsTo belongsTo}, or {@link
   * Model#belongsToMany belongsToMany} relation may run through a `JoinModel`.  
   *
   * A good example of where this would be useful is if a book {@link
   * Model#hasMany hasMany} paragraphs through chapters. Consider the following examples:
   *
   *
   *     var Book = bookshelf.Model.extend({
   *     
   *       tableName: 'books',
   *     
   *       // Find all paragraphs associated with this book, by
   *       // passing through the "Chapter" model.
   *       paragraphs: function() {
   *         return this.hasMany(Paragraph).through(Chapter);
   *       },
   *     
   *       chapters: function() {
   *         return this.hasMany(Chapter);
   *       }
   *     
   *     });
   *     
   *     var Chapter = bookshelf.Model.extend({
   *     
   *       tableName: 'chapters',
   *     
   *       paragraphs: function() {
   *         return this.hasMany(Paragraph);
   *       }
   *     
   *     });
   *     
   *     var Paragraph = bookshelf.Model.extend({
   *     
   *       tableName: 'paragraphs',
   *     
   *       chapter: function() {
   *         return this.belongsTo(Chapter);
   *       },
   *     
   *       // A reverse relation, where we can get the book from the chapter.
   *       book: function() {
   *         return this.belongsTo(Book).through(Chapter);
   *       }
   *     
   *     });
   *
   * The "through" table creates a pivot model, which it assigns to {@link
   * Model#pivot model.pivot} after it is created. On {@link Model#toJSON
   * toJSON}, the pivot model is flattened to values prefixed with
   * `_pivot_`.
   *
   * @method Bookshelf#Model#through
   * @param {Model} Interim Pivot model.
   * @param {string=} throughForeignKey
   *
   *   Foreign key in this model. By default, the `foreignKey` is assumed to
   *   be the singular form of the `Target` model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @param {string=} otherKey
   *
   *   Foreign key in the `Interim` model. By default, the `otherKey` is assumed to
   *   be the singular form of this model's tableName, followed by `_id` /
   *   `_{{idAttribute}}`.
   *
   * @returns {Collection}
   */
  through: function(Interim, throughForeignKey, otherKey) {
    return this.relatedData.through(this, Interim, {throughForeignKey: throughForeignKey, otherKey: otherKey});
  },

  /**
   * Fetches a {@link Model model} from the database, using any {@link
   * Model#attributes attributes} currently set on the model to form a `select`
   * query. Returns a {@link Promise promise}, which will resolve with the
   * fetched {@link Model model}, or `undefined` if the model isn't fetched. A
   * `"fetching"` event will be fired just before the record is fetched; a good
   * place to hook into for validation. A `"fetched"` event will be fired when
   * a record is successfully retrieved. If you need to constrain the query
   * performed by fetch, you can call {@link Model#query query} before calling
   * {@link Model#fetch fetch}.  
   *
   *     // select * from `books` where `ISBN-13` = '9780440180296'
   *     new Book({'ISBN-13': '9780440180296'})
   *       .fetch()
   *       .then(function(model) {
   *         // outputs 'Slaughterhouse Five'
   *         console.log(model.get('title'));
   *       });
   *
   * _If you'd like to only fetch specific columns, you may specify a `columns`
   * property in the `options` for the {@link Model#fetch fetch} call, or use
   * {@link Model#query query}, tapping into the {@link Knex} {@link
   * Knex#column column} method to specify which columns will be fetched._
   *
   * The `withRelated` parameter may be specified to fetch the resource, along
   * with any specified {@link Model#relations relations} named on the model. A
   * single property, or an array of properties can be specified as a value for
   * the `withRelated` property. The results of these relation queries will be
   * loaded into a {@link Model#relations relations} property on the model, may
   * be retrieved with the {@link Model#related related} method, and will be
   * serialized as properties on a {@link Model#toJSON toJSON} call unless
   * `{shallow: true}` is passed.  
   *
   *     var Book = bookshelf.Model.extend({
   *       tableName: 'books',
   *       editions: function() {
   *         return this.hasMany(Edition);
   *       },
   *       genre: function() {
   *         return this.belongsTo(Genre);
   *       }
   *     })
   *     
   *     new Book({'ISBN-13': '9780440180296'}).fetch({
   *       withRelated: ['genre', 'editions']
   *     }).then(function(book) {
   *       console.log(book.related('genre').toJSON());
   *       console.log(book.related('editions').toJSON());
   *       console.log(book.toJSON());
   *     });
   *
   * @method Bookshelf#Model#fetch
   *
   * @param {Object=}  options - Hash of options.
   * @param {boolean=} [options.require=false]
   *
   *   If `true`, will reject the returned response with a {@link
   *   Model#NotFoundError NotFoundError} if no result is found.
   *
   * @param {(string|string[])=} [options.columns='*']
   *
   *   Limit the number of columns fetched.
   *
   * @fires Model#fetching
   * @fires Model#fetched 
   *
   * @returns {Promise} A promise resolving to the fetched {@link Model model} or `undefined`.
   */
  fetch: Promise.method(function(options) {
    options = options ? _.clone(options) : {};

    // Run the `first` call on the `sync` object to fetch a single model.
    return this.sync(options)
      .first()
      .bind(this)

      // Jump the rest of the chain if the response doesn't exist...
      .tap(function(response) {
        if (!response || response.length === 0) {
          if (options.require) throw new this.constructor.NotFoundError('EmptyResponse');
          return Promise.reject(null);
        }
      })

      // Now, load all of the data into the model as necessary.
      .tap(this._handleResponse)

      // If the "withRelated" is specified, we also need to eager load all of the
      // data on the model, as a side-effect, before we ultimately jump into the
      // next step of the model. Since the `columns` are only relevant to the current
      // level, ensure those are omitted from the options.
      .tap(function(response) {
        if (options.withRelated) {
          return this._handleEager(response, _.omit(options, 'columns'));
        }
      })

      .tap(function(response) {
        return this.triggerThen('fetched', this, response, options);
      })
      .return(this)
      .catch(function(err) {
        if (err === null) return err;
        throw err;
      });
  }),

  // Shortcut for creating a collection and fetching the associated models.
  fetchAll: function(options) {
    var collection = this.constructor.collection();
    collection._knex = this.query().clone();
    this.resetQuery();
    if (this.relatedData) collection.relatedData = this.relatedData;
    var model = this;
    return collection
      .on('fetching', function(collection, columns, options) {
        return model.triggerThen('fetching:collection', collection, columns, options);
      })
      .on('fetched', function(collection, resp, options) {
        return model.triggerThen('fetched:collection', collection, resp, options);
      })
      .fetch(options);
  },

  // Eager loads relationships onto an already populated `Model` instance.
  load: Promise.method(function(relations, options) {
    return Promise.bind(this)
      .then(function() {
        return [this.format(_.extend(Object.create(null), this.attributes))];
      })
      .then(function(response) {
        return this._handleEager(response, _.extend({}, options, {
          shallow: true,
          withRelated: _.isArray(relations) ? relations : [relations]
        }));
      })
      .return(this);
  }),

  // Sets and saves the hash of model attributes, triggering
  // a "creating" or "updating" event on the model, as well as a "saving" event,
  // to bind listeners for any necessary validation, logging, etc.
  // If an error is thrown during these events, the model will not be saved.
  save: Promise.method(function(key, val, options) {
    var attrs;

    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (key == null || typeof key === "object") {
      attrs = key || {};
      options = _.clone(val) || {};
    } else {
      (attrs = {})[key] = val;
      options = options ? _.clone(options) : {};
    }

    return Promise.bind(this).then(function() {
      return this.isNew(options);
    }).then(function(isNew) {

      // Determine whether which kind of save we will do, update or insert.
      var method = options.method = this.saveMethod(options);

      // If the object is being created, we merge any defaults here rather than
      // during object creation.
      if (method === 'insert' || options.defaults) {
        var defaults = _.result(this, 'defaults');
        if (defaults) {
          attrs = _.extend({}, defaults, this.attributes, attrs);
        }
      }

      // Set the attributes on the model. Note that we do this before adding
      // timestamps, as `timestamp` calls `set` internally.
      this.set(attrs, {silent: true});

      // Now set timestamps if appropriate. Extend `attrs` so that the
      // timestamps will be provided for a patch operation.
      if (this.hasTimestamps) {
        _.extend(attrs, this.timestamp({method: method, silent: true}));
      }

      // If there are any save constraints, set them on the model.
      if (this.relatedData && this.relatedData.type !== 'morphTo') {
        Helpers.saveConstraints(this, this.relatedData);
      }

      // Gives access to the `query` object in the `options`, in case we need it
      // in any event handlers.
      var sync = this.sync(options);
      options.query = sync.query;

      return this.triggerThen((method === 'insert' ? 'creating saving' : 'updating saving'), this, attrs, options)
      .bind(this)
      .then(function() {
        return sync[options.method](method === 'update' && options.patch ? attrs : this.attributes);
      })
      .then(function(resp) {

        // After a successful database save, the id is updated if the model was created
        if (method === 'insert' && this.id == null) {
          this.attributes[this.idAttribute] = this.id = resp[0];
        } else if (method === 'update' && resp === 0) {
          if (options.require !== false) {
            throw new this.constructor.NoRowsUpdatedError('No Rows Updated');
          }
        }

        // In case we need to reference the `previousAttributes` for the this
        // in the following event handlers.
        options.previousAttributes = this._previousAttributes;

        this._reset();

        return this.triggerThen((method === 'insert' ? 'created saved' : 'updated saved'), this, resp, options);
      });
    })
    .return(this);
  }),

  // Destroy a model, calling a "delete" based on its `idAttribute`.
  // A "destroying" and "destroyed" are triggered on the model before
  // and after the model is destroyed, respectively. If an error is thrown
  // during the "destroying" event, the model will not be destroyed.
  destroy: Promise.method(function(options) {
    options = options ? _.clone(options) : {};
    var sync = this.sync(options);
    options.query = sync.query;
    return Promise.bind(this).then(function() {
      return this.triggerThen('destroying', this, options);
    }).then(function() {
      return sync.del();
    }).then(function(resp) {
      if (options.require && resp === 0) {
        throw new this.constructor.NoRowsDeletedError('No Rows Deleted');
      }
      this.clear();
      return this.triggerThen('destroyed', this, resp, options);
    }).then(this._reset);
  }),

  // Reset the query builder, called internally
  // each time a query is run.
  resetQuery: function() {
    this._knex = null;
    return this;
  },

  // Tap into the "query chain" for this model.
  query: function() {
    return Helpers.query(this, _.toArray(arguments));
  },

  // Add the most common conditional directly to the model, everything else
  // can be accessed with the `query` method.
  where: function() {
    var args = _.toArray(arguments);
    return this.query.apply(this, ['where'].concat(args));
  },

  // Creates and returns a new `Sync` instance.
  sync: function(options) {
    return new Sync(this, options);
  },

  // Helper for setting up the `morphOne` or `morphMany` relations.
  _morphOneOrMany: function(Target, morphName, columnNames, morphValue, type) {
    if (!_.isArray(columnNames)) {
      // Shift by one place
      morphValue = columnNames;
      columnNames = null;
    }
    if (!morphName || !Target) throw new Error('The polymorphic `name` and `Target` are required.');
    return this._relation(type, Target, {morphName: morphName, morphValue: morphValue, columnNames: columnNames}).init(this);
  },

  // Handles the response data for the model, returning from the model's fetch call.
  // Todo: {silent: true, parse: true}, for parity with collection#set
  // need to check on Backbone's status there, ticket #2636
  _handleResponse: function(response) {
    var relatedData = this.relatedData;
    this.set(this.parse(response[0]), {silent: true})._reset();
    if (relatedData && relatedData.isJoined()) {
      relatedData.parsePivot([this]);
    }
  },

  // Handle the related data loading on the model.
  _handleEager: function(response, options) {
    return new EagerRelation([this], response, this).fetch(options);
  }

}, {

  extended: function(child) {
    child.NotFoundError      = createError(this.NotFoundError)
    child.NoRowsUpdatedError = createError(this.NoRowsUpdatedError)
    child.NoRowsDeletedError = createError(this.NoRowsDeletedError)
  }

});

BookshelfModel.NotFoundError      = Errors.NotFoundError,
BookshelfModel.NoRowsUpdatedError = Errors.NoRowsUpdatedError,
BookshelfModel.NoRowsDeletedError = Errors.NoRowsDeletedError

module.exports = BookshelfModel;
