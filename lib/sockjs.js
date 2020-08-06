"use strict";

const log = require("./log");
const pathParams = require("../common/path-params");
let currConn = null;

global.__shinyserverdebug__ = {
  interrupt: function() {
    log("OK, we'll silently drop messages starting now.");
    currConn.send = function(data) {
      log("Dropping message " + data);
    };
    currConn.onmessage = function(e) {
      log("Ignoring message " + e.data);
    };
  },
  disconnect: function() {
    log("OK, we'll simulate a disconnection.");
    // 46xx range for close code tells the reconnect
    // decorator to try reconnecting, which we normally
    // only do on !wasClean disconnects.
    currConn.close(4600);
  }
};

// options.disableProtocols can be an array of protocols to remove from the
// whitelist
exports.createFactory = function(protocolChooser, options) {
  return function(url, context, callback) {
    if (!callback) throw new Error("callback is required");

    url = pathParams.reorderPathParams(url, ["n", "o", "t", "w", "s"]);

    let whitelist = [];
    protocolChooser.whitelist.forEach(prot => {
      if (!options.disableProtocols || options.disableProtocols.indexOf(prot) < 0) {
        whitelist.push(prot);
      }
    });

    // If we are left with an empty whitelist, add a dummy protocol for the
    // edge case where we end up with no valid protocols. SockJS interprets an
    // empty protocols_whitelist as permitting _all_ protocols. Useful when
    // trying to test behavior when all protocols are disabled.
    if (whitelist.length == 0) {
      whitelist.push("dummy");
    }

    let transportDebugging = options.transportDebugging == true;

    let sockjsOptions = {
      // sockjs 0.3.4 and earlier
      protocols_whitelist: whitelist,
      debug: transportDebugging,
      // sockjs 1.0.0+
      transports: whitelist
    };

    let conn = new global.SockJS(url, null, sockjsOptions);
    currConn = conn;

    callback(null, conn);
  };
};
