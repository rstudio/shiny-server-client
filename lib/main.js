let util = require('./util');
let token = require('./decorators/token');
//let subapp = require('./subapp');
//let extendsession = require('./extendsession');
let reconnect = require('./decorators/reconnect');
let multiplex = require('./decorators/multiplex');
let sockjs = require("./sockjs");
let PromisedConnection = require("./promised-connection");

/*
Connection factories:
- SockJS (reconnect-aware)
- Subapp

Connection factory decorators:
- WorkerId maintainer (reconnect-aware)
- Token adder
- Reconnector (requires underlying connections to be reconnect-aware)
- MultiplexClient

SSOS config:
  Primary app:
    SockJS + Reconnector + MultiplexClient
  Subapp:
    Subapp

SSP/RSC config:
  Primary app:
    SockJS + WorkerId + Token + Reconnector + MultiplexClient
  Subapp:
    Subapp
*/

/**
 * options = {
 *   reconnect: false
 *   debugging: false
 *   extendsession: false
 * }
 *
 */
function initSession(shiny, options) {
  let factory;

  if (false && subapp.isSubApp()) {
    // TODO
  } else {
    // Not a subapp
    // if (options.extendsession) {
    //   extendsession.init();
    // }

    factory = sockjs.createFactory(options);
    if (options.reconnect) {
      factory = reconnect.decorate(factory, options);
    }
    factory = multiplex.decorate(factory);
  }

  // Register the connection with Shiny.createSocket, etc.
  shiny.createSocket = function() {
    let url = location.protocol + "//" + location.host + location.pathname.replace(/\\$/, "");
    url += "/__sockjs__/";

    let pc = new PromisedConnection();
    factory(url, {}, pc.resolve.bind(pc));
    return pc;
  };
}

global.preShinyInit = function(options) {
  initSession(global.Shiny, options);
}
