"use strict";

/**
 * Module dependencies.
 */

var EventEmitter = require("events").EventEmitter
  , Option = require("./option")
  , VantageUtil = require("./util")
  , _ = require("lodash")
  ;

/**
 * Command prototype.
 */

var command = Command.prototype;

/**
 * Expose `Command`.
 */

module.exports = exports = Command;

/**
 * Initialize a new `Command` instance.
 *
 * @param {String} name
 * @param {Vantage} parent
 * @return {Command}
 * @api public
 */

function Command(name, parent) {
  if (!(this instanceof Command)) { return new Command(); }
  this.commands = [];
  this.options = [];
  this._allowUnknownOption = false;
  this._args = [];
  this._aliases = [];
  this._name = name;
  this._relay = false;
  this._hidden = false;
  this._parent = parent;
  this._mode = false;
  this._init = void 0;
  this._after = void 0;
}

/**
 * Registers an option for given command.
 *
 * @param {String} flags
 * @param {String} description
 * @param {Function} fn
 * @param {String} defaultValue
 * @return {Command}
 * @api public
 */

command.option = function(flags, description, fn, defaultValue) {

  var self = this
    , option = new Option(flags, description)
    , oname = option.name()
    , name = _camelcase(oname);

  // default as 3rd arg
  if (typeof fn !== "function") {
    if (fn instanceof RegExp) {
      var regex = fn;
      fn = function(val, def) {
        var m = regex.exec(val);
        return m ? m[0] : def;
      };
    }
    else {
      defaultValue = fn;
      fn = null;
    }
  }

  // preassign default value only for --no-*, [optional], or <required>
  if (option.bool === false || option.optional || option.required) {
    // when --no-* we make sure default is true
    if (option.bool === false) { defaultValue = true; }
    // preassign only if we have a default
    if (defaultValue !== undefined) { self[name] = defaultValue; }
  }

  // register the option
  this.options.push(option);

  // when it"s passed assign the value
  // and conditionally invoke the callback
  this.on(oname, function(val) {
    // coercion
    if (val !== null && fn) { val = fn(val, self[name] === undefined
      ? defaultValue
      : self[name]);
    }

    // unassigned or bool
    if (typeof self[name] === "boolean" || typeof self[name] === "undefined") {
      // if no value, bool true, and we have a default, then use it!
      if (val === null) {
        self[name] = option.bool
          ? defaultValue || true
          : false;
      } else {
        self[name] = val;
      }
    } else if (val !== null) {
      // reassign
      self[name] = val;
    }
  });

  return this;
};

/**
 * Defines an action for a given command.
 *
 * @param {Function} fn
 * @return {Command}
 * @api public
 */

command.action = function(fn) {
  var self = this;
  self._fn = fn;
  return this;
};

/**
 * Defines an init action for a mode command.
 *
 * @param {Function} fn
 * @return {Command}
 * @api public
 */

command.init = function(fn) {
  var self = this;
  if (self._mode !== true) {
    throw Error("Cannot call init from a non-mode action.");
  }
  self._init = fn;
  return this;
};

/**
 * Defines a prompt delimiter for a
 * mode once entered.
 *
 * @param {String} delimiter
 * @return {Command}
 * @api public
 */

command.delimiter = function(delimiter) {
  this._delimiter = delimiter;
  return this;
};

/**
 * Defines an alias for a given command.
 *
 * @param {String} alias
 * @return {Command}
 * @api public
 */

command.alias = function(alias) {
  this._aliases.push(alias);
  return this;
};

/**
 * Defines description for given command.
 *
 * @param {String} str
 * @return {Command}
 * @api public
 */

command.description = function(str) {
  if (arguments.length === 0) { return this._description; }
  this._description = str;
  return this;
};

/**
 * Returns the commands arguments as string.
 *
 * @param {String} desc
 * @return {String}
 * @api public
 */

command.arguments = function (desc) {
  return this._parseExpectedArgs(desc.split(/ +/));
};

/**
 * Returns the help info for given command.
 *
 * @return {String}
 * @api public
 */

command.helpInformation = function() {

  var desc = []
    , cmdName = this._name
    , alias = ""
    ;

  if (this._description) {
    desc = [
      "  " + this._description
      , ""
    ];
  }

  if (this._aliases.length > 0) {
    alias = "  Alias: " + this._aliases.join(" | ") + "\n";
  }
  var usage = [
    ""
    , "  Usage: " + cmdName + " " + this.usage()
    , ""
  ];

  var cmds = [];

  var options = [
    "  Options:"
    , ""
    , "" + this.optionHelp().replace(/^/gm, "    ")
    , ""
  ];

  var res = usage
    .concat(cmds)
    .concat(alias)
    .concat(desc)
    .concat(options)
    .join("\n");

  return res;
};

/**
 * Doesn"t show command in the help menu.
 *
 * @return {Command}
 * @api public
 */

command.hidden = function() {
  this._hidden = true;
  return this;
};

/**
 * Returns the command usage string for help.
 *
 * @param {String} str
 * @return {String}
 * @api public
 */

command.usage = function(str) {
  var args = this._args.map(function(arg) {
    return VantageUtil.humanReadableArgName(arg);
  });

  var usage = "[options]"
    + (this.commands.length ? " [command]" : "")
    + (this._args.length ? " " + args.join(" ") : "");

  if (arguments.length === 0) { return (this._usage || usage); }
  this._usage = str;

  return this;
};

/**
 * Returns the help string for the command's options.
 *
 * @return {String}
 * @api public
 */

command.optionHelp = function() {
  var width = this._largestOptionLength();

  // Prepend the help information
  return [VantageUtil.pad("-h, --help", width) + "  " + "output usage information"]
    .concat(this.options.map(function(option) {
      return VantageUtil.pad(option.flags, width) + "  " + option.description;
      }))
    .join("\n");
};

/**
 * Returns the length of the longest option.
 *
 * @return {Integer}
 * @api private
 */

command._largestOptionLength = function() {
  return this.options.reduce(function(max, option) {
    return Math.max(max, option.flags.length);
  }, 0);
};

/**
 * Adds a command to be executed after command completion.
 *
 * @param {Function} fn
 * @return {Command}
 * @api public
 */

command.after = function(fn) {
  if (_.isFunction(fn)) {
    this._after = fn;
  }
  return this;
};

/**
 * Parses and returns expected command arguments.
 *
 * @param {String} args
 * @return {Array}
 * @api private
 */

command._parseExpectedArgs = function(args) {
  if (!args.length) { return; }
  var self = this;
  args.forEach(function(arg) {
    var argDetails = {
      required: false,
      name: "",
      variadic: false
    };

    switch (arg[0]) {
      case "<":
        argDetails.required = true;
        argDetails.name = arg.slice(1, -1);
        break;
      case "[":
        argDetails.name = arg.slice(1, -1);
        break;
    }

    if (argDetails.name.length > 3 && argDetails.name.slice(-3) === "...") {
      argDetails.variadic = true;
      argDetails.name = argDetails.name.slice(0, -3);
    }
    if (argDetails.name) {
      self._args.push(argDetails);
    }
  });
  return;
};

/**
 * Converts string to camel case.
 *
 * @param {String} flag
 * @return {String}
 * @api private
 */

function _camelcase(flag) {
  return flag.split("-").reduce(function(str, word) {
    return str + word[0].toUpperCase() + word.slice(1);
  });
}

/**
 * Make command an EventEmitter.
 */

command.__proto__ = EventEmitter.prototype;

