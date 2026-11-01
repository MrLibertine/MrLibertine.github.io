System.register([], function (_export, _context) {
  "use strict";

  var cc, Application;
  function _typeof(o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }

  return {
    setters: [],
    execute: function () {
      _export("Application", Application = function () {
        function Application() {
          _classCallCheck(this, Application);
          this.settingsPath = 'src/settings.json';
          this.showFPS = false;
        }
        Application.prototype.init = function (engine) {
          cc = engine;
          cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this));
          cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this));
        };
        Application.prototype.onPostInitBase = function () {};
        Application.prototype.onPostSystemInit = function () {};
        Application.prototype.start = function () {
          var self = this;
          var debugMode = (cc.DebugMode && cc.DebugMode.ERROR != null) ? cc.DebugMode.ERROR : 1;
          return cc.game.init({
            debugMode: debugMode,
            settingsPath: this.settingsPath,
            overrideSettings: { profiling: { showFPS: this.showFPS } }
          }).then(function () { return cc.game.run(); }).then(function () {
            return System.import('./src/game.js').then(function (g) { return g.boot(cc); });
          });
        };
        return Application;
      }());
    }
  };

  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
});
