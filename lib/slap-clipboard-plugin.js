var path = require('path');
var Promise = require('bluebird');
var _ = require('lodash');
var rc = require('rc');
var clipboard = Promise.promisifyAll(require('copy-paste'));

var util = require('slap-util');
var opts = require('./opts');
var Editor = require.main.require('editor-widget'); // this way the Editor prototype that Slap uses can be modified
var Slap = require.main.require('./lib/ui/Slap');


module.exports = function (slap) {
  Editor.prototype.copy = Promise.method(function () {
    var self = this;
    var text = self.textBuf.getTextInRange(self.selection.getRange());
    if (!text) return self;
    slap.data.clipboard = text;
    self.screen.copyToClipboard(text);
    return clipboard.copyAsync(text)
      .catch(function (err) {
        util.logger.warn("Editor#copy", err);
        switch (err.code) {
          case 'EPIPE':
            slap._warnAboutXclip();
            break;
        }
      })
      .tap(function () { util.logger.debug("copied " + text.length + " characters"); })
      .return(self);
  });
  Editor.prototype.paste = Promise.method(function () {
    var self = this;
    return clipboard.pasteAsync()
      .catch(function (err) {
        util.logger.warn("Editor#paste", err);
        switch (err.code) {
          case 'ENOENT':
            slap._warnAboutXclip();
            break;
        }
      })
      .then(function (text) {
        if (!text) text = slap.data.clipboard;
        if (typeof text === 'string') {
          self.textBuf.setTextInRange(self.selection.getRange(), text);
          self.selection.reversed = false;
          self.selection.clearTail();
          util.logger.debug("pasted " + text.length + " characters");
        }
        return self;
      });
  });

  Slap.prototype._warnAboutXclip = function () {
    if (this._warnedAboutXclip) return;
    this.header.message("install xclip to use system clipboard", 'warning');
    this._warnedAboutXclip = true;
  };

  var _initHandlers = Editor.prototype._initHandlers;
  Editor.prototype._initHandlers = function () {
    var self = this;
    self.ready.then(function () { self._initSlapClipboardPlugin(); }).done();
    return _initHandlers.apply(self, arguments);
  };
  Editor.prototype.getBindings = function () {
    return _.merge({}, Editor.prototype.__proto__.getBindings.call(this), opts.editor.bindings);
  };
  Editor.prototype._initSlapClipboardPlugin = function () {
    var self = this;
    self.on('keypress', function (ch, key) {
      var binding = self.resolveBinding(key);
      switch (binding) {
        case 'copy':
        case 'cut':
          self.copy().done();
          if (binding === 'cut') self.delete();
          return false;
        case 'paste': self.paste().done(); return false;
      }
    });
  };

  slap.panes.forEach(function (pane) {
    pane.editor._initSlapClipboardPlugin();
  });
};
