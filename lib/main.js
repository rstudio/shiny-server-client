"use strict";

const assert = require("assert");
const log = require("./log");
const token = require("./decorators/token");
const subapp = require("./subapp");
const extendSession = require("./decorators/extend-session");
const reconnect = require("./decorators/reconnect");
const multiplex = require("./decorators/multiplex");
const workerId = require("./decorators/worker-id");
const sockjs = require("./sockjs");
const PromisedConnection = require("./promised-connection");
const ConnectionContext = require("./decorators/connection-context");
const ReconnectUI = require("./reconnect-ui");

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

let reconnectUI = new ReconnectUI();

/**
 * options = {
 *   debugging: false,
 *   extendSession: false,
 *   reconnect: false,
 *   subappTag: false,
 *   token: false,
 *   workerId: false,
 *
 *   reconnectTimeout: 15000,
 *   connectErrorDelay: 500
 * }
 *
 */
function initSession(shiny, options, shinyServer) {

  if (subapp.isSubApp()) {
    shiny.createSocket = _ => {
      return subapp.createSocket();
    };
  } else {
    // Not a subapp

    let factory = sockjs.createFactory(options);
    if (options.workerId) {
      factory = workerId.decorate(factory, options);
    }
    if (options.token) {
      factory = token.decorate(factory, options);
    }
    if (options.reconnect) {
      factory = reconnect.decorate(factory, options);
    }
    if (options.extendSession) {
      factory = extendSession.decorate(factory, options);
    }
    factory = multiplex.decorate(factory, options);

    // Register the connection with Shiny.createSocket, etc.
    shiny.createSocket = _ => {
      let url = location.protocol + "//" + location.host + location.pathname.replace(/\/[^\/]*$/, "");
      url += "/__sockjs__/";

      reconnectUI.hide();

      let ctx = new ConnectionContext();

      let doReconnectHandler = _ => {
        ctx.emit("do-reconnect");
      };

      reconnectUI.on("do-reconnect", doReconnectHandler);
      if (reconnectUI.listenerCount("do-reconnect") > 1) {
        log("do-reconnect handlers are leaking!");
      }

      ctx.on("reconnect-schedule", delay => {
        reconnectUI.showCountdown(delay);
      });
      ctx.on("reconnect-attempt", _ => {
        reconnectUI.showAttempting();
      });
      ctx.on("reconnect-success", _ => {
        reconnectUI.hide();
      });

      let onDisconnected = _ => {
        reconnectUI.removeListener("do-reconnect", doReconnectHandler);
        reconnectUI.showDisconnected();
      };
      ctx.on("reconnect-failure", onDisconnected);
      ctx.on("disconnect", onDisconnected);

      let pc = new PromisedConnection();

      factory(url, ctx, (err, conn) => {
        pc.resolve(err, conn);
      });

      assert(ctx.multiplexClient);
      shinyServer.multiplexer = ctx.multiplexClient;

      return pc;
    };
  }
}

global.preShinyInit = function(options) {
  global.ShinyServer = global.ShinyServer || {};
  initSession(global.Shiny, options, global.ShinyServer);

  /*eslint-disable no-console*/
  global.Shiny.oncustommessage = function(message) {
    if (typeof message === "string" && console.log) console.log(message); // Legacy format
    if (message.alert && console.log) console.log(message.alert);
    if (message.console && console.log) console.log(message.console);
  };
  /*eslint-enable no-console*/
};
