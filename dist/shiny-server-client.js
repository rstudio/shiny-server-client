(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict"; // No ES6 allowed in this directory!

var message_utils = require("./message-utils");

module.exports = MessageBuffer;

function MessageBuffer() {
  this._messages = [];
  this._startIndex = 0;
  this._messageId = 0;
}

MessageBuffer.prototype.write = function (msg) {
  msg = message_utils.formatId(this._messageId++) + "#" + msg;

  this._messages.push(msg);

  return msg;
};

MessageBuffer.prototype.handleACK = function (msg) {
  var ackId = message_utils.parseACK(msg);

  if (ackId === null) {
    return -1;
  }

  return this.discard(ackId);
}; // Returns the number of messages that were actually
// discarded.
//
// Can throw an error, if nextId is outside of the valid range.


MessageBuffer.prototype.discard = function (nextId) {
  // The message ID they send is the first id *not* seen by
  // their side (and not the last id seen by them). This is
  // not intuitive, but it makes it possible to indicate
  // no messages seen ("0") and makes the indexing math a
  // bit cleaner as well.
  var keepIdx = nextId - this._startIndex;

  if (keepIdx < 0) {
    throw new Error("Discard position id too small");
  }

  if (keepIdx > this._messages.length) {
    throw new Error("Discard position id too big");
  }

  this._messages = this._messages.slice(keepIdx);
  this._startIndex = nextId;
  return keepIdx; // equal to the number of messages we dropped
};

MessageBuffer.prototype.nextId = function () {
  return this._messageId;
}; // Can throw an error, if startId is outside of the valid range.


MessageBuffer.prototype.getMessagesFrom = function (startId) {
  var from = startId - this._startIndex;

  if (from < 0) {
    throw new Error("Message buffer underrun detected");
  }

  if (from > this._messages.length) {
    throw new Error("Message id larger than expected");
  }

  return this._messages.slice(from);
};

},{"./message-utils":3}],2:[function(require,module,exports){
"use strict"; // No ES6 allowed in this directory!

var message_utils = require("./message-utils");

module.exports = MessageReceiver;

function MessageReceiver(ackTimeout) {
  this._pendingMsgId = 0;
  this._ackTimer = null;
  this._ackTimeout = ackTimeout || 2000; // This should be set by clients

  this.onacktimeout = function (e) {};
}

MessageReceiver.parseId = parseId;

function parseId(str) {
  return parseInt(str, 16);
}

MessageReceiver.prototype.receive = function (msg) {
  var self = this;
  var result = message_utils.parseTag(msg);

  if (!result) {
    throw new Error("Invalid robust-message, no msg-id found");
  } // The pending message ID is the first id *not* seen by
  // us (as opposed to the last id seen by us). This is
  // not intuitive, but it makes it possible to indicate
  // no messages seen ("0") and makes the indexing math a
  // bit cleaner as well.


  this._pendingMsgId = result.id + 1;

  if (!this._ackTimer) {
    this._ackTimer = setTimeout(function () {
      self._ackTimer = null;
      self.onacktimeout({
        messageId: self._pendingMessageId
      });
    }, this._ackTimeout);
  }

  return result.data;
};

MessageReceiver.prototype.nextId = function () {
  return this._pendingMsgId;
};

MessageReceiver.prototype.ACK = function () {
  return "ACK " + message_utils.formatId(this._pendingMsgId);
};

MessageReceiver.prototype.CONTINUE = function () {
  return "CONTINUE " + message_utils.formatId(this._pendingMsgId);
};

},{"./message-utils":3}],3:[function(require,module,exports){
"use strict";

exports.formatId = formatId;

function formatId(id) {
  return id.toString(16).toUpperCase();
}

exports.parseId = parseId;

function parseId(str) {
  return parseInt(str, 16);
}

exports.parseTag = function (val) {
  // [\s\S] instead of . because the val might include newlines
  var m = /^([\dA-F]+)#([\s\S]*)$/.exec(val);

  if (!m) {
    return null;
  }

  return {
    id: parseId(m[1]),
    data: m[2]
  };
};

exports.parseCONTINUE = function (val) {
  var m = /^CONTINUE ([\dA-F]+)$/.exec(val);

  if (!m) {
    return null;
  }

  return parseId(m[1]);
};

exports.parseACK = function (val) {
  var m = /^ACK ([\dA-F]+)$/.exec(val);

  if (!m) {
    return null;
  }

  return parseId(m[1]);
};

},{}],4:[function(require,module,exports){
"use strict";

var assert = require("assert");

exports.addPathParams = function (url, params) {
  var pathFragment = "";

  for (var key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      if (!/^\w*$/.test(key) || !/^\w*$/.test(params[key])) {
        throw new Error("util.addPathParams doesn't implement escaping");
      }

      pathFragment += "/" + key + "=" + params[key];
    }
  }

  return url.replace(/\/?(\?|$)/, pathFragment + "$1");
};

function parseUrl(url) {
  var urlParts = /^([^?]*)(\?.*)?$/.exec(url);
  assert(urlParts); // Could be full URL, absolute path, or relative path

  var mainUrl = urlParts[1];
  var search = urlParts[2] || ""; // Could be nothing

  var chunks = mainUrl.split(/\//); // Find first chunk that's either "" or "name=value"

  var firstParamIndex = chunks.length;
  var lastParamIndex;
  var seenParam = false; // Have we encountered any param yet?

  while (firstParamIndex > 0) {
    var prevChunk = chunks[firstParamIndex - 1];

    if (/^[a-z]+=/i.test(prevChunk)) {
      if (!lastParamIndex) lastParamIndex = firstParamIndex;
      seenParam = true;
      firstParamIndex--;
    } else if (!seenParam) {
      firstParamIndex--;
    } else {
      break;
    }
  } // No params detected


  if (!seenParam) {
    return {
      prefix: chunks,
      params: [],
      suffix: [],
      search: search
    };
  }

  assert(firstParamIndex >= 0 && firstParamIndex <= chunks.length);
  assert(lastParamIndex >= 0 && firstParamIndex <= chunks.length);
  return {
    prefix: chunks.slice(0, firstParamIndex),
    params: chunks.slice(firstParamIndex, lastParamIndex),
    suffix: chunks.slice(lastParamIndex),
    search: search
  };
}

function formatUrl(urlObj) {
  var url = [].concat(urlObj.prefix).concat(urlObj.params).concat(urlObj.suffix).join("/");
  return url + urlObj.search;
}

exports.reorderPathParams = function (url, order) {
  var urlObj = parseUrl(url); // Filter out empty chunks

  var params = urlObj.params.filter(function (v) {
    return v.length > 0;
  }); // Now actually reorder the chunks

  var frontParams = [];

  for (var i = 0; i < params.length; i++) {
    var m = /^(.+)=(.*)$/.exec(params[i]);
    assert(m);
    var desiredOrder = order.indexOf(m[1]);

    if (desiredOrder >= 0) {
      frontParams[desiredOrder] = params[i];
      delete params[i];
    }
  }

  urlObj.params = frontParams.concat(params).filter(function (v) {
    return typeof v !== "undefined";
  });
  return formatUrl(urlObj);
};

exports.extractParams = function (url) {
  var urlObj = parseUrl(url);
  var result = {};

  for (var i = 0; i < urlObj.params.length; i++) {
    var m = /^(.+?)=(.*)$/.exec(urlObj.params[i]);
    result[m[1]] = m[2];
  }

  return result;
};

},{"assert":27}],5:[function(require,module,exports){
/*eslint-disable no-console*/
"use strict";

module.exports = function (msg) {
  if (typeof console !== "undefined" && !module.exports.suppress) {
    console.log(new Date() + " [DBG]: " + msg);
  }
};

module.exports.suppress = false;

},{}],6:[function(require,module,exports){
"use strict";

module.exports = BaseConnectionDecorator;

function BaseConnectionDecorator(conn) {
  this._conn = conn;
  conn.onopen = this._handleOpen.bind(this);
  conn.onmessage = this._handleMessage.bind(this);
  conn.onerror = this._handleError.bind(this);
  conn.onclose = this._handleClose.bind(this);
}

BaseConnectionDecorator.prototype.send = function (data) {
  this._conn.send(data);
};

BaseConnectionDecorator.prototype.close = function (code, reason) {
  return this._conn.close.apply(this._conn, arguments);
};

BaseConnectionDecorator.prototype._handleOpen = function () {
  if (this.onopen) {
    this.onopen.apply(this, arguments);
  }
};

BaseConnectionDecorator.prototype._handleMessage = function () {
  if (this.onmessage) {
    this.onmessage.apply(this, arguments);
  }
};

BaseConnectionDecorator.prototype._handleError = function () {
  if (this.onerror) {
    this.onerror.apply(this, arguments);
  }
};

BaseConnectionDecorator.prototype._handleClose = function () {
  if (this.onclose) {
    this.onclose.apply(this, arguments);
  }
};

Object.defineProperty(BaseConnectionDecorator.prototype, "readyState", {
  get: function readyState() {
    return this._conn.readyState;
  }
});
Object.defineProperty(BaseConnectionDecorator.prototype, "url", {
  get: function readyState() {
    return this._conn.url;
  }
});
Object.defineProperty(BaseConnectionDecorator.prototype, "protocol", {
  get: function readyState() {
    return this._conn.protocol;
  }
});
Object.defineProperty(BaseConnectionDecorator.prototype, "extensions", {
  get: function readyState() {
    return this._conn.extensions;
  }
});

},{}],7:[function(require,module,exports){
"use strict";

var EventEmitter = require("events").EventEmitter;

var inherits = require("inherits");

module.exports = ConnectionContext;

function ConnectionContext() {
  EventEmitter.call(this);
}

inherits(ConnectionContext, EventEmitter);

},{"events":31,"inherits":32}],8:[function(require,module,exports){
"use strict";

var BaseConnectionDecorator = require("./base-connection-decorator");

exports.decorate = function (factory, options) {
  return function (url, ctx, callback) {
    factory(url, ctx, function (err, conn) {
      var wrapper = new BaseConnectionDecorator(conn);

      conn.onclose = function (e) {
        ctx.emit("disconnect", e);

        if (wrapper.onclose) {
          wrapper.onclose.apply(wrapper, arguments);
        }
      };

      callback(err, wrapper);
    });
  };
};

},{"./base-connection-decorator":6}],9:[function(require,module,exports){
(function (global){(function (){
"use strict";

var BaseConnectionDecorator = require("./base-connection-decorator");

var debug = require("../debug");

function extendSession() {
  global.jQuery.ajax("__extendsession__", {
    type: "POST",
    async: true
  }).done(function () {
    debug("__extendsession__ succeeded");
  }).fail(function () {
    debug("__extendsession__ failed");
  });
} // Sends __extendsession__ requests repeatedly while connection to the server
// exists. This keeps the session alive by causing the cookies to be refreshed.
//
// * Writes to ctx: nothing
// * Reads from ctx: nothing


exports.decorate = function (factory, options) {
  return function (url, ctx, callback) {
    var duration = options.extendSessionInterval || 5 * 60 * 1000; // Use this interval-id to shut down the interval when we lose our
    // connection to the server.

    var handle = null;
    factory(url, ctx, function (err, conn) {
      if (!err) {
        handle = setInterval(extendSession, duration);
      } // Pass through the connection except clear the extendSessionInterval on
      // close.


      var wrapper = new BaseConnectionDecorator(conn);

      conn.onclose = function () {
        clearInterval(handle);
        handle = null;
        if (wrapper.onclose) wrapper.onclose.apply(wrapper, arguments);
      };

      callback(err, wrapper);
    });
  };
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../debug":5,"./base-connection-decorator":6}],10:[function(require,module,exports){
(function (global){(function (){
"use strict";

var MultiplexClient = require("../multiplex-client");

var util = require("../util");

var PromisedConnection = require("../promised-connection");

var pathParams = require("../../common/path-params"); // The job of this decorator is to wrap the underlying
// connection with our Multiplexing protocol, designed
// to allow multiple iframes to share the same connection
// on the client but proxy out to multiple sessions on
// the server. This decorator provides the "primary"
// multiplex channel, i.e. the one from the outermost
// webpage/frame.
//
// * Writes to ctx: multiplexClient (MultiplexClient)
// * Reads from ctx: nothing


exports.decorate = function (factory, options) {
  return function (url, ctx, callback) {
    var multiplexClientPromise = util.promise();

    if (options.subappTag) {
      url = pathParams.addPathParams(url, {
        s: 0
      });
    }

    ctx.multiplexClient = {
      open: function open(relUrl) {
        var pc = new PromisedConnection();
        multiplexClientPromise.then(function (client) {
          var urlWithParams = pathParams.addPathParams(relUrl, {
            s: 1
          });
          pc.resolve(null, client.open(urlWithParams));
        }).then(null, function (err) {
          pc.resolve(err);
        });
        return pc;
      }
    };
    return factory(url, ctx, function (err, conn) {
      if (err) {
        callback(err);
        return;
      }

      var m = /\/([^/]+)$/.exec(global.location.pathname);
      var relUrl = m ? m[1] : "";

      try {
        var client = new MultiplexClient(conn);
        callback(null, client.open(relUrl));
        multiplexClientPromise(true, [client]);
      } catch (e) {
        multiplexClientPromise(false, [e]);
        callback(e);
      }
    });
  };
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../common/path-params":4,"../multiplex-client":17,"../promised-connection":19,"../util":25}],11:[function(require,module,exports){
"use strict";

var assert = require("assert");

var EventEmitter = require("events").EventEmitter;

var inherits = require("inherits");

var debug = require("../debug");

var log = require("../log");

var util = require("../util");

var WebSocket = require("../websocket");

var BaseConnectionDecorator = require("./base-connection-decorator");

var MessageBuffer = require("../../common/message-buffer");

var MessageReceiver = require("../../common/message-receiver");

var message_utils = require("../../common/message-utils");

var pathParams = require("../../common/path-params");

function generateId(size) {
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var id = '';

  for (var i = 0; i < size; i++) {
    var rnum = Math.floor(Math.random() * chars.length);
    id += chars.substring(rnum, rnum + 1);
  }

  return id;
} // The job of this decorator is to serve as a "logical"
// connection that can survive the death of a "physical"
// connection, and restore the connection.
//
// * Reads from options: reconnectTimeout (in millis; <0 to disable)
// * Writes to ctx: nothing
// * Reads from ctx: nothing


exports.decorate = function (factory, options) {
  // Returns a connection promise
  return function (url, ctx, callback) {
    // The robustId is an id that will be shared by all
    // physical connections belonging to this logical
    // connection. We will include it in the URL.
    var robustId = generateId(18);
    var timeout = options.reconnectTimeout;

    if (typeof timeout === "undefined") {
      timeout = 15000;
    }

    var connectErrorDelay = options.connectErrorDelay;

    if (typeof connectErrorDelay === "undefined") {
      // Delay return of promise by 500 milliseconds so
      // "Attempting reconnect" UI doesn't flash so quickly
      connectErrorDelay = 500;
    }

    var conn = new RobustConnection(timeout, factory, url, ctx, robustId, connectErrorDelay);
    conn = new BufferedResendConnection(conn);
    callback(null, conn);
  };
}; // Utility function takes a (potentially still CONNECTING)
// connection, and returns a promise. The promise resolves
// successfully if onopen is called, and resolves as an
// error if onerror or onclose is called.


function promisify_p(conn) {
  var promise = util.promise();

  if (conn.readyState === WebSocket.OPEN) {
    promise(true, [conn]);
  } else if (conn.readyState === WebSocket.CLOSING || conn.readyState === WebSocket.CLOSED) {
    promise(false, [new Error("WebSocket was closed")]);
  } else if (conn.readyState === WebSocket.CONNECTING) {
    conn.onopen = function () {
      conn.onopen = null;
      conn.onclose = null;
      conn.onerror = null; // PauseConnection helps avoid a race condition here. Between
      // conn.onopen being called and the promise resolution code
      // (onFulfilled/onRejected) being invoked, there's more than
      // enough time for onmessage/onerror/onclose events to occur.
      // You can see this if you have the server write a message
      // right away upon connection; that message will be dropped
      // because onmessage will be called before onFulfilled has
      // a chance to assign its onmessage callback. So we use a
      // paused connection that we can then resume() once all of
      // the appropriate callbacks are hooked up.
      //
      // There may still be a race condition in that the connection
      // might fire its onopen event between the time that the
      // factory creates it, and promisify_p is invoked. That at
      // least will manifest itself as a "stuck" connection, rather
      // than silently dropping a single message, which could be
      // much harder for the user to know that something is wrong.

      promise(true, [new util.PauseConnection(conn)]);
    };

    conn.onerror = function (e) {
      conn.onopen = null;
      conn.onclose = null;
      conn.onerror = null;
      promise(false, [new Error("WebSocket errored"), e]);
    };

    conn.onclose = function (e) {
      conn.onopen = null;
      conn.onclose = null;
      conn.onerror = null;
      promise(false, [new Error("WebSocket closed"), e]);
    };
  } else {
    throw new Error("Unexpected WebSocket readyState: " + conn.readyState);
  }

  return promise;
}
/*
Things that can move this robust connection into different states:

1) On construction, it's in CONNECTING.
2) On successful open of its first connection, it's OPEN.
3) On close() being called, it goes straight to CLOSED.
4) When a disconnect with !evt.wasClean occurs, attempt to
   reconnect; stay in OPEN. If we give up on this, then
   go to CLOSED.
5) When a wasClean disconnect occurs, go to CLOSED.
*/


function RobustConnection(timeout, factory, url, ctx, robustId, connectErrorDelay) {
  this._timeout = timeout;
  this._factory = factory;
  this._url = url;
  this.url = url; // public version; overridden by physical connections

  this._ctx = ctx;
  this._robustId = robustId;
  this._connectErrorDelay = connectErrorDelay;
  this._conn = null;
  this._stayClosed = false; // Initialize all event handlers to no-op.

  this.onopen = this.onclose = this.onerror = this.onmessage = function () {}; // We'll need to carefully maintain the readyState manually.


  this._setReadyState(WebSocket.CONNECTING);

  this._connect(this._timeout);
}

RobustConnection.prototype._setReadyState = function (value) {
  if (typeof this.readyState !== "undefined" && this.readyState > value) {
    throw new Error("Invalid readyState transition: " + this.readyState + " to " + value);
  }

  this.readyState = value;
};

RobustConnection.prototype._acceptConn = function (conn) {
  // It's a programmer error to accept a connection while the previous
  // connection is still active...
  assert(!this._conn || this._conn.readyState > WebSocket.OPEN, "_acceptConn called while previous conn was still active"); // ...or for the connection itself not to be open...

  assert(conn.readyState === WebSocket.OPEN, "_acceptConn called with non-open conn: " + conn.readyState); // ...or for the RobustConnection itself to be closed.

  assert(this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.OPEN, "_acceptConn called while readyState was " + this.readyState);
  this._conn = conn; // onopen intentionally not set; if we're here, we're
  // already in the OPEN state.

  this._conn.onclose = this._handleClose.bind(this);
  this._conn.onmessage = this._handleMessage.bind(this);
  this._conn.onerror = this._handleError.bind(this);
  this.protocol = conn.protocol;
  this.extensions = conn.extensions;
  this.url = conn.url;

  if (this.readyState === WebSocket.CONNECTING) {
    // This is our first time getting an open connection!
    // Transition to OPEN and let our clients know.
    this._setReadyState(WebSocket.OPEN);

    if (this.onopen) this.onopen(util.createEvent("open"));
  } else {
    log("Connection restored"); // Otherwise, let our clients know that we've just reconnected.

    this.onreconnect(util.createEvent("reconnect"));
  }
};

RobustConnection.prototype._clearConn = function () {
  if (this._conn) {
    this._conn.onopen = null;
    this._conn.onclose = null;
    this._conn.onerror = null;
    this._conn.onmessage = null;
    this._conn = null;
  }
}; // Call this when we don't have a connection (either we have never
// had one yet, or the last one we had is now closed and removed)
// but we want to get a new one.


RobustConnection.prototype._connect = function (timeoutMillis) {
  var _this = this;

  assert(!this._conn, "_connect called but _conn is not null");
  assert(this.readyState <= WebSocket.OPEN, "_connect called from wrong readyState"); // This function can be called repeatedly to get a connection promise.
  // Because it uses promisify_p, a successful resolve of the promise
  // means not only that the connection was created, but also entered
  // the WebSocket.OPEN state.

  var open_p = function open_p() {
    var params = {};
    params[_this.readyState === WebSocket.CONNECTING ? "n" : "o"] = _this._robustId;
    var url = pathParams.addPathParams(_this._url, params);
    var promise = util.promise();
    var connectErrorDelay = _this._connectErrorDelay;

    _this._factory(url, _this._ctx, function (err, conn) {
      if (err) {
        setTimeout(function () {
          promise(false, [err]);
        }, connectErrorDelay);
        return;
      }

      promisify_p(conn).then(function () {
        promise(true, arguments);
      }, function () {
        var args = arguments;
        setTimeout(function () {
          promise(false, args);
        }, connectErrorDelay);
      }).done();
    });

    return promise;
  };

  var expires = this.readyState !== WebSocket.OPEN ? 0 : Date.now() + timeoutMillis;
  var progressCallbacks = new EventEmitter();

  if (this.readyState === WebSocket.OPEN) {
    progressCallbacks.on("schedule", function (delay) {
      _this._ctx.emit("reconnect-schedule", delay);
    });
    progressCallbacks.on("attempt", function () {
      _this._ctx.emit("reconnect-attempt");
    });
    progressCallbacks.on("success", function () {
      _this._ctx.emit("reconnect-success");
    });
    progressCallbacks.on("failure", function () {
      _this._ctx.emit("reconnect-failure");
    });
  }

  function doReconnect() {
    progressCallbacks.emit("retry-now");
  }

  this._ctx.on("do-reconnect", doReconnect);

  util.retryPromise_p(open_p, util.createNiceBackoffDelayFunc(), expires, progressCallbacks).then(function (conn) {
    _this._ctx.removeListener("do-reconnect", doReconnect);

    assert(!_this._conn, "Connection promise fulfilled, but _conn was not null!"); // If RobustConnection.close() was called in the
    // meantime, close the new conn and bail out.

    if (_this.readyState === WebSocket.CLOSED) {
      conn.close();
      return;
    }

    _this._acceptConn(conn);

    conn.resume();
  }, function (err) {
    log(err);

    _this._ctx.removeListener("do-reconnect", doReconnect);

    assert(!_this._conn, "Connection promise rejected, but _conn was not null!"); // If RobustConnection.close() was called in the
    // meantime, just get out of here.

    if (_this.readyState === WebSocket.CLOSED) {
      return;
    } // If we're still waiting for the initial connection, we
    // want to raise an additional error event. (Is this
    // really necessary? I'm just guessing.)


    try {
      if (_this.readyState === WebSocket.CONNECTING) {
        _this.onerror(util.createEvent("error"));
      }
    } finally {
      // Whether onerror succeeds or not, we always want to close.
      // Note that code 1006 can't be passed to WebSocket.close (at
      // least on my Chrome install) but in this case we know for
      // sure there's no WebSocket to call close on--the connection
      // attempt failed, so this code will just be used to make an
      // event.
      _this.close(1006, "", false);
    }
  }).done();
};

RobustConnection.prototype._handleClose = function (e) {
  this._clearConn(); // Use 46xx for interactive debugging purposes to trigger reconnect


  if (!this._stayClosed && (!e.wasClean || e.code === 3000 || e.code >= 4600 && e.code < 4700)) {
    log("Disconnect detected; attempting reconnect");
    this.ondisconnect(util.createEvent("disconnect"));

    this._connect(this._timeout);
  } else {
    // Apparently this closure was on purpose; don't try to reconnect
    this._setReadyState(WebSocket.CLOSED);

    this.onclose(e);

    this._ctx.emit("disconnect", e);
  }
}; // Event callback for this._conn.onmessage. Delegates to public
// member. We have to add this level of indirection to allow
// the value of this.onmessage to change over time.


RobustConnection.prototype._handleMessage = function (e) {
  if (this.onmessage) this.onmessage(e);
}; // Event callback for this._conn.onerror. Delegates to public
// member. We have to add this level of indirection to allow
// the value of this.onerror to change over time.


RobustConnection.prototype._handleError = function (e) {
  if (this.onerror) this.onerror(e);
};

RobustConnection.prototype.send = function (data) {
  if (this.readyState === WebSocket.CONNECTING) {
    throw new Error("Can't send when connection is in CONNECTING state");
  } else if (this.readyState > WebSocket.OPEN) {
    throw new Error("Connection is already CLOSING or CLOSED");
  } else if (!this._conn) {
    // Previously, we buffered messages that were sent while in this
    // state, so we could send them if/when a reconnection succeeded.
    // But with BufferedResendConnection, such a mechanism is not only
    // unnecessary, but dangerous; buffering messages can only be
    // done safely by BufferedResendConnection, not by us, because
    // only BRC retains knowledge about the proper message order, and
    // what messages have actually been received by the other side.
    throw new Error("Can't send when connection is disconnected");
  }

  this._conn.send(data);
};

RobustConnection.prototype.close = function (code, reason) {
  if (this.readyState === WebSocket.CLOSED) {
    return;
  } // Be careful!!


  if (this._conn) {
    // If a connection is currently active, we want to call close on
    // it and, for the most part, let nature take its course.
    // May throw, if code or reason are invalid. I'm assuming when
    // that happens, the conn isn't actually closed, so we need to
    // undo any side effects we have done before calling close().
    try {
      this._stayClosed = true; // Make sure not to reconnect

      this._conn.close(code, reason);
    } catch (e) {
      // Undo the setting of the flag.
      this._stayClosed = false;
      throw e;
    } // If _conn.close() hasn't triggered the _handleClose handler yet
    // (and I don't think it will have) then we need to mark ourselves
    // as CLOSING.


    this._setReadyState(Math.max(this.readyState, WebSocket.CLOSING));
  } else {
    // There's no active connection. Just immediately put us in closed
    // state and raise the event.
    this._setReadyState(WebSocket.CLOSED);

    if (this.onclose) {
      this.onclose(util.createEvent("close", {
        currentTarget: this,
        target: this,
        srcElement: this,
        code: code,
        reason: reason,
        wasClean: false
      }));
    }
  }
};

function BufferedResendConnection(conn) {
  var _this2 = this;

  BaseConnectionDecorator.call(this, conn);
  assert(this._conn); // This connection decorator is tightly coupled to RobustConnection

  assert(conn.constructor === RobustConnection);
  this._messageBuffer = new MessageBuffer();
  this._messageReceiver = new MessageReceiver();

  this._messageReceiver.onacktimeout = function () {
    if (_this2._conn.readyState === WebSocket.OPEN && !_this2._disconnected) {
      _this2._conn.send(_this2._messageReceiver.ACK());
    }
  };

  this._disconnected = false;
  conn.onopen = this._handleOpen.bind(this);
  conn.onmessage = this._handleMessage.bind(this);
  conn.onerror = this._handleError.bind(this);
  conn.onclose = this._handleClose.bind(this); // These two events are specific to RobustConnection. They
  // are used to detect potentially-temporary disruptions,
  // and successful recovery from those disruptions.

  conn.ondisconnect = this._handleDisconnect.bind(this);
  conn.onreconnect = this._handleReconnect.bind(this);
}

inherits(BufferedResendConnection, BaseConnectionDecorator);

BufferedResendConnection.prototype._handleDisconnect = function () {
  this._disconnected = true;
};

BufferedResendConnection.prototype._handleReconnect = function () {
  var _this3 = this;

  // Tell the other side where we stopped hearing their messages
  this._conn.send(this._messageReceiver.CONTINUE());

  this._conn.onmessage = function (e) {
    if (message_utils.parseACK(e.data) !== null) {
      // In this state, ignore ACK, which can be sent at any time.
      return;
    }

    _this3._disconnected = false;
    _this3._conn.onmessage = _this3._handleMessage.bind(_this3); // If this is a proper, robustified connection, before we do
    // anything else we'll get a message indicating the most
    // recent message number seen + 1 (or 0 if none seen yet).

    try {
      var continueId = message_utils.parseCONTINUE(e.data);

      if (continueId === null) {
        // Anything but ACK or CONTINUE when we were expecting CONTINUE,
        // is an error.
        throw new Error("The RobustConnection handshake failed, CONTINUE expected");
      } else {
        // continueId represents the first id *not* seen by the server.
        // It might seem unintuitive to make it defined like that
        // rather than the last id seen by the server, but this allows
        // us to easily represent the case where the server has not
        // seen any messages (0) and also makes the iterating code here
        // a little cleaner.
        debug("Discard and continue from message " + continueId); // Note: discard can throw

        _this3._messageBuffer.discard(continueId); // Note: getMessageFrom can throw


        var msgs = _this3._messageBuffer.getMessagesFrom(continueId);

        if (msgs.length > 0) debug(msgs.length + " messages were dropped; resending");
        msgs.forEach(function (msg) {
          // This msg is already formatted by MessageBuffer (tagged with id)
          _this3._conn.send(msg);
        });
      }
    } catch (err) {
      log("Error: RobustConnection handshake error: " + err);
      log(err.stack);

      _this3.close(3007, "RobustConnection handshake error: " + err);
    }
  };
};

BufferedResendConnection.prototype._handleMessage = function (e) {
  // At any time we can receive an ACK from the server that tells us
  // it's safe to discard existing messages.
  try {
    var ackResult = this._messageBuffer.handleACK(e.data); // If the message wasn't an ACK at all, ackResult is a negative num.


    if (ackResult >= 0) {
      debug(ackResult + " message(s) discarded from buffer");
      return;
    }
  } catch (err) {
    log("Error: ACK handling failed: " + err);
    log(err.stack);
    this.close(3008, "ACK handling failed: " + err);
    return;
  }

  e.data = this._messageReceiver.receive(e.data);

  if (this.onmessage) {
    this.onmessage.apply(this, arguments);
  }
};

BufferedResendConnection.prototype.send = function (data) {
  if (typeof data === "undefined" || data === null) {
    throw new Error("data argument must not be undefined or null");
  } // Write to the message buffer, and also save the return value which
  // is the message prepended with the id. This is what a compatible
  // server will expect to see.


  data = this._messageBuffer.write(data); // If not disconnected, attempt to send; otherwise, it's enough
  // that we wrote it to the buffer.

  if (!this._disconnected) this._conn.send(data);
};

},{"../../common/message-buffer":1,"../../common/message-receiver":2,"../../common/message-utils":3,"../../common/path-params":4,"../debug":5,"../log":15,"../util":25,"../websocket":26,"./base-connection-decorator":6,"assert":27,"events":31,"inherits":32}],12:[function(require,module,exports){
(function (global){(function (){
"use strict";

var pathParams = require("../../common/path-params"); // The job of this decorator is to request a token from
// the server, and append that to the URL.
//
// * Writes to ctx: nothing
// * Reads from ctx: nothing


exports.decorate = function (factory, options) {
  return function (url, ctx, callback) {
    if (!exports.ajax) {
      throw new Error("No HTTP transport was provided");
    }

    exports.ajax("__token__", {
      type: "GET",
      cache: false,
      dataType: "text",
      success: function success(data, textStatus) {
        var newUrl = pathParams.addPathParams(url, {
          "t": data
        });
        factory(newUrl, ctx, callback);
      },
      error: function error(jqXHR, textStatus, errorThrown) {
        callback(new Error("Failed to retrieve token: " + errorThrown));
      }
    });
  };
}; // Override this to mock.


exports.ajax = null;

if (typeof global.jQuery !== "undefined") {
  exports.ajax = global.jQuery.ajax;
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../common/path-params":4}],13:[function(require,module,exports){
(function (global){(function (){
"use strict";

var pathParams = require("../../common/path-params"); // The job of this decorator is to add the worker ID
// to the connection URL.
//
// In the future, this will not only read the worker
// ID from the current URL, but also go get a new
// worker ID if we're in a reconnect scenario.
//
// * Writes to ctx: nothing
// * Reads from ctx: nothing


exports.decorate = function (factory, options) {
  return function (url, ctx, callback) {
    if (!global.location) {
      // Pass-through if we're neither in a browser
      // nor have a mocked location
      return factory(url, ctx, callback);
    } // Search for the worker ID either in the URL query string,
    // or in the <base href> element


    var search = global.location.search.replace(/^\?/, '');
    var worker = '';

    if (search.match(/\bw=[^&]+/)) {
      worker = search.match(/\bw=[^&]+/)[0].substring(2);
    } // TODO: Dynamic workerId for reconnection case


    if (!worker) {
      // Check to see if we were assigned a base href
      var base = global.jQuery('base').attr('href') || global.location.href; // Extract the worker ID if it's included in a larger URL.

      var mtch = base.match(/_w_(\w+)\//);
      base = mtch[1];

      if (base) {
        // Trim trailing slash
        base = base.replace(/\/$/, '');
        base = base.replace(/^_w_/, '');
        worker = base;
      }
    }

    if (worker) {
      url = pathParams.addPathParams(url, {
        "w": worker
      });
    }

    return factory(url, ctx, callback);
  };
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../common/path-params":4}],14:[function(require,module,exports){
"use strict";

var assert = require("assert");

module.exports = fixupUrl;

function fixupUrl(href, location) {
  var origHref = href; // Strip the worker out of the href

  href = href.replace(/\/_w_[a-f0-9]+\//g, "/");

  if (href === origHref) {
    // Must not have been a relative URL, or base href isn't in effect.
    return origHref;
  }

  var m = /^([^#?]*)(\?[^#]*)?(#.*)?$/.exec(href);
  assert(m);
  var base = m[1] || "";
  var search = m[2] || "";
  var hash = m[3] || "";

  if (base !== location.origin + location.pathname) {
    return origHref;
  }

  if (!search) {
    // href doesn't include the query string, which means that if one is
    // present (e.g. ?rscembedded=1) anchor links will be labeled page changes
    // by the browser, triggering a reload (and perhaps nested toolbars).
    search = location.search;
  }

  return base + search + hash;
}

},{"assert":27}],15:[function(require,module,exports){
/*eslint-disable no-console*/
"use strict";

module.exports = function (msg) {
  if (typeof console !== "undefined" && !module.exports.suppress) {
    console.log(new Date() + " [INF]: " + msg);
  }
};

module.exports.suppress = false;

},{}],16:[function(require,module,exports){
(function (global){(function (){
"use strict";

var assert = require("assert");

var fixupUrl = require("./fixup-url");

var log = require("./log");

var token = require("./decorators/token");

var subapp = require("./subapp");

var extendSession = require("./decorators/extend-session");

var reconnect = require("./decorators/reconnect");

var disconnect = require("./decorators/disconnect");

var multiplex = require("./decorators/multiplex");

var workerId = require("./decorators/worker-id");

var sockjs = require("./sockjs");

var PromisedConnection = require("./promised-connection");

var ConnectionContext = require("./decorators/connection-context");

var ReconnectUI = require("./reconnect-ui");

var ui = require("./ui");

var ProtocolChooser = require("./protocol-chooser");
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


var reconnectUI = new ReconnectUI();
/**
 * options = {
 *   debugging: false,
 *   extendSession: false,
 *   fixupInternalLinks: false,
 *   reconnect: false,
 *   subappTag: false,
 *   token: false,
 *   workerId: false,
 *
 *   reconnectTimeout: 15000,
 *   connectErrorDelay: 500,
 *   disableProtocols: [],
 *   transportDebugging: false
 * }
 *
 */

function initSession(shiny, options, shinyServer) {
  if (subapp.isSubApp()) {
    shiny.createSocket = function () {
      return subapp.createSocket();
    };
  } else {
    // Not a subapp
    ProtocolChooser.init(shinyServer, options.disableProtocols);
    var factory = sockjs.createFactory(ProtocolChooser, options);

    if (options.workerId) {
      factory = workerId.decorate(factory, options);
    }

    if (options.token) {
      factory = token.decorate(factory, options);
    }

    if (options.reconnect) {
      factory = reconnect.decorate(factory, options);
    } else {
      factory = disconnect.decorate(factory, options);
    }

    if (options.extendSession) {
      factory = extendSession.decorate(factory, options);
    }

    factory = multiplex.decorate(factory, options); // Register the connection with Shiny.createSocket, etc.

    shiny.createSocket = function () {
      var url = location.protocol + "//" + location.host + location.pathname.replace(/\/[^/]*$/, "");
      url += "/__sockjs__/";
      reconnectUI.hide();
      var ctx = new ConnectionContext();

      var doReconnectHandler = function doReconnectHandler() {
        ctx.emit("do-reconnect");
      };

      reconnectUI.on("do-reconnect", doReconnectHandler);

      if (reconnectUI.listenerCount("do-reconnect") > 1) {
        log("do-reconnect handlers are leaking!");
      }

      ctx.on("reconnect-schedule", function (delay) {
        reconnectUI.showCountdown(delay);
      });
      ctx.on("reconnect-attempt", function () {
        reconnectUI.showAttempting();
      });
      ctx.on("reconnect-success", function () {
        reconnectUI.hide();
      });

      var onDisconnected = function onDisconnected() {
        reconnectUI.removeListener("do-reconnect", doReconnectHandler);
        reconnectUI.showDisconnected();
      };

      ctx.on("reconnect-failure", onDisconnected);
      ctx.on("disconnect", onDisconnected);
      var pc = new PromisedConnection();
      factory(url, ctx, function (err, conn) {
        pc.resolve(err, conn);
      });
      assert(ctx.multiplexClient);
      shinyServer.multiplexer = ctx.multiplexClient; // Signal to Shiny 0.14 and above that a Shiny-level reconnection (i.e.
      // automatically starting a new session) is permitted.

      pc.allowReconnect = true;
      ctx.on("disconnect", function (e) {
        // e here is the websocket/SockJS close event.
        // Don't allow a Shiny-level reconnection (new session) if we close
        // cleanly; this is an indication that the server wanted us to close
        // and stay closed (e.g. session idle timeout).
        //
        // But in some cases, even a clean close should allow reconnect; these
        // are cases where the server couldn't service our existing session
        // but wouldn't mind us starting a new one. E.g.: robust id not found
        // or expired. The server indicates this by sending a close code in
        // the 47xx range.
        if (e.code && e.code >= 4700 && e.code < 4800) {
          pc.allowReconnect = true;
        } else {
          pc.allowReconnect = false;
        }
      });
      return pc;
    };
  }
}

global.preShinyInit = function (options) {
  if (options.fixupInternalLinks && !subapp.isSubApp()) {
    global.jQuery(function () {
      fixupInternalLinks();
    });
  }

  if (!global.Shiny) {
    // Don't do anything if this isn't even a Shiny URL
    return;
  }

  global.ShinyServer = global.ShinyServer || {};
  initSession(global.Shiny, options, global.ShinyServer);

  if (!subapp.isSubApp()) {
    /*eslint-disable no-console*/
    global.Shiny.oncustommessage = function (message) {
      if (message.license) ui.onLicense(global.Shiny, message.license);
      if (message.credentials) ui.onLoggedIn(message.credentials);
      if (typeof message === "string" && console.log) console.log(message); // Legacy format

      if (message.alert && console.log) console.log(message.alert);
      if (message.console && console.log) console.log(message.console);
    };
    /*eslint-enable no-console*/

  }
};

global.fixupInternalLinks = fixupInternalLinks;

function fixupInternalLinks() {
  global.jQuery("body").on("click", "a", function (ev) {
    // We don't scrub links from subapps because a.) We need to make sure that
    // everything (even relative links) stick to the same worker, as this app
    // doesn't exist on another worker, and b.) because we don't care about the
    // side-effect of creating a big mess in the URL bar, since it's just an
    // iframe and won't be visible anyway.
    assert(!subapp.isSubApp()); // Bootstrap collapse/tab links should not have their href touched

    if (ev.currentTarget.hasAttribute("data-toggle")) {
      return;
    } // setting /any/ value to ev.target.href (even assigning it to itself) would
    // have the side-effect of creating a real value in that property, even if
    // one shouldn't exist


    if (ev.currentTarget.href === null || !ev.currentTarget.href) {
      return;
    }

    var href = fixupUrl(ev.currentTarget.href, global.location);

    if (href === ev.currentTarget.href) {
      // Must not have been a relative URL, or base href isn't in effect.
      return;
    }

    ev.currentTarget.href = href;
  });
}

global.Shiny.createSocket = function () {
  throw new Error("shiny-server-client was loaded but preShinyInit() was not called");
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./decorators/connection-context":7,"./decorators/disconnect":8,"./decorators/extend-session":9,"./decorators/multiplex":10,"./decorators/reconnect":11,"./decorators/token":12,"./decorators/worker-id":13,"./fixup-url":14,"./log":15,"./promised-connection":19,"./protocol-chooser":20,"./reconnect-ui":21,"./sockjs":22,"./subapp":23,"./ui":24,"assert":27}],17:[function(require,module,exports){
(function (global){(function (){
"use strict";

var log = require("./log");

var debug = require("./debug"); // MultiplexClient sits on top of a SockJS connection and lets the caller
// open logical SockJS connections (channels). The SockJS connection is
// closed when all of the channels close. This means you can't start with
// zero channels, open a channel, close that channel, and then open
// another channel.


module.exports = MultiplexClient;

function MultiplexClient(conn) {
  var _this = this;

  // The underlying SockJS connection. At this point it is not likely to
  // be opened yet.
  this._conn = conn; // A table of all active channels.
  // Key: id, value: MultiplexClientChannel

  this._channels = {};
  this._channelCount = 0; // ID to use for the next channel that is opened

  this._nextId = 0; // Channels that need to be opened when the SockJS connection's open
  // event is received

  this._pendingChannels = []; // A list of functions that fire when our connection goes away.

  this.onclose = [];

  this._conn.onopen = function () {
    log("Connection opened. " + global.location.href);
    var channel;

    while (channel = _this._pendingChannels.shift()) {
      // Be sure to check readyState so we don't open connections for
      // channels that were closed before they finished opening
      if (channel.readyState === 0) {
        channel._open();
      } else {
        debug("NOT opening channel " + channel.id);
      }
    }
  };

  this._conn.onclose = function (e) {
    log("Connection closed. Info: " + JSON.stringify(e));
    debug("SockJS connection closed"); // If the SockJS connection is terminated from the other end (or due
    // to loss of connectivity or whatever) then we can notify all the
    // active channels that they are closed too.

    for (var key in _this._channels) {
      if (Object.prototype.hasOwnProperty.call(_this._channels, key)) {
        _this._channels[key]._destroy(e);
      }
    }

    for (var i = 0; i < _this.onclose.length; i++) {
      _this.onclose[i]();
    }
  };

  this._conn.onmessage = function (e) {
    var msg = parseMultiplexData(e.data);

    if (!msg) {
      log("Invalid multiplex packet received from server");

      _this._conn.close();

      return;
    }

    var id = msg.id;
    var method = msg.method;
    var payload = msg.payload;
    var channel = _this._channels[id];

    if (!channel) {
      log("Multiplex channel " + id + " not found");
      return;
    }

    if (method === "c") {
      // If we're closing, we want to close everything, not just a subapp.
      // So don't send to a single channel.
      _this._conn.close(payload.code, payload.reason);
    } else if (method === "m") {
      channel.onmessage({
        data: payload
      });
    }
  };
}

MultiplexClient.prototype.open = function (url) {
  var channel = new MultiplexClientChannel(this, this._nextId++ + "", this._conn, url);
  this._channels[channel.id] = channel;
  this._channelCount++;

  switch (this._conn.readyState) {
    case 0:
      this._pendingChannels.push(channel);

      break;

    case 1:
      setTimeout(function () {
        channel._open();
      }, 0);
      break;

    default:
      setTimeout(function () {
        channel.close();
      }, 0);
      break;
  }

  return channel;
};

MultiplexClient.prototype.removeChannel = function (id) {
  delete this._channels[id];
  this._channelCount--;
  debug("Removed channel " + id + ", " + this._channelCount + " left");

  if (this._channelCount === 0 && this._conn.readyState < 2) {
    debug("Closing SockJS connection since no channels are left");

    this._conn.close();
  }
};

function MultiplexClientChannel(owner, id, conn, url) {
  this._owner = owner;
  this.id = id;
  this.conn = conn;
  this.url = url;
  this.readyState = 0;

  this.onopen = function () {};

  this.onclose = function () {};

  this.onmessage = function () {};
}

MultiplexClientChannel.prototype._open = function (parentURL) {
  debug("Open channel " + this.id);
  this.readyState = 1; //let relURL = getRelativePath(parentURL, this.url)

  this.conn.send(formatOpenEvent(this.id, this.url));
  if (this.onopen) this.onopen();
};

MultiplexClientChannel.prototype.send = function (data) {
  if (this.readyState === 0) throw new Error("Invalid state: can't send when readyState is 0");
  if (this.readyState === 1) this.conn.send(formatMessage(this.id, data));
};

MultiplexClientChannel.prototype.close = function (code, reason) {
  if (this.readyState >= 2) return;
  debug("Close channel " + this.id);

  if (this.conn.readyState === 1) {
    // Is the underlying connection open? Send a close message.
    this.conn.send(formatCloseEvent(this.id, code, reason));
  }

  this._destroy({
    code: code,
    reason: reason,
    wasClean: true
  });
}; // Internal version of close that doesn't notify the server


MultiplexClientChannel.prototype._destroy = function (e) {
  var _this2 = this;

  // If we haven't already, invoke onclose handler.
  if (this.readyState !== 3) {
    this.readyState = 3;
    debug("Channel " + this.id + " is closed");
    setTimeout(function () {
      _this2._owner.removeChannel(_this2.id);

      if (_this2.onclose) _this2.onclose(e);
    }, 0);
  }
};

function formatMessage(id, message) {
  return id + '|m|' + message;
}

function formatOpenEvent(id, url) {
  return id + '|o|' + url;
}

function formatCloseEvent(id, code, reason) {
  return id + '|c|' + JSON.stringify({
    code: code,
    reason: reason
  });
}

function parseMultiplexData(msg) {
  try {
    var m = /^(\d+)\|(m|o|c)\|([\s\S]*)$/m.exec(msg);
    if (!m) return null;
    msg = {
      id: m[1],
      method: m[2],
      payload: m[3]
    };

    switch (msg.method) {
      case 'm':
        break;

      case 'o':
        if (msg.payload.length === 0) return null;
        break;

      case 'c':
        try {
          msg.payload = JSON.parse(msg.payload);
        } catch (e) {
          return null;
        }

        break;

      default:
        return null;
    }

    return msg;
  } catch (e) {
    log('Error parsing multiplex data: ' + e);
    return null;
  }
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./debug":5,"./log":15}],18:[function(require,module,exports){
(function (process,setImmediate){(function (){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }

/* eslint-disable no-inner-declarations */
// https://github.com/timjansen/PinkySwear.js/blob/fa78f9799868893101b0960ef977ffa3900e9a94/pinkyswear.js
// Modified to remove UMD

/*
 * PinkySwear.js 2.2.2 - Minimalistic implementation of the Promises/A+ spec
 *
 * Public Domain. Use, modify and distribute it any way you like. No attribution required.
 *
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 *
 * PinkySwear is a very small implementation of the Promises/A+ specification. After compilation with the
 * Google Closure Compiler and gzipping it weighs less than 500 bytes. It is based on the implementation for
 * Minified.js and should be perfect for embedding.
 *
 *
 * PinkySwear has just three functions.
 *
 * To create a new promise in pending state, call pinkySwear():
 *         var promise = pinkySwear();
 *
 * The returned object has a Promises/A+ compatible then() implementation:
 *          promise.then(function(value) { alert("Success!"); }, function(value) { alert("Failure!"); });
 *
 *
 * The promise returned by pinkySwear() is a function. To fulfill the promise, call the function with true as first argument and
 * an optional array of values to pass to the then() handler. By putting more than one value in the array, you can pass more than one
 * value to the then() handlers. Here an example to fulfill a promsise, this time with only one argument:
 *         promise(true, [42]);
 *
 * When the promise has been rejected, call it with false. Again, there may be more than one argument for the then() handler:
 *         promise(true, [6, 6, 6]);
 *
 * You can obtain the promise's current state by calling the function without arguments. It will be true if fulfilled,
 * false if rejected, and otherwise undefined.
 * 		   var state = promise();
 *
 * https://github.com/timjansen/PinkySwear.js
 */
var undef;

function isFunction(f) {
  return typeof f == "function";
}

function isObject(f) {
  return _typeof(f) == "object";
}

function defer(callback) {
  if (typeof setImmediate != "undefined") setImmediate(callback);else if (typeof process != "undefined" && process["nextTick"]) process["nextTick"](callback);else setTimeout(callback, 0);
}

function pinkySwear(extend) {
  var state; // undefined/null = pending, true = fulfilled, false = rejected

  var values = []; // an array of values as arguments for the then() handlers

  var deferred = []; // functions to call when set() is invoked

  var set = function set(newState, newValues) {
    if (state == null && newState != null) {
      state = newState;
      values = newValues;
      if (deferred.length) defer(function () {
        for (var i = 0; i < deferred.length; i++) {
          deferred[i]();
        }
      });
    }

    return state;
  };

  set["then"] = function (onFulfilled, onRejected) {
    var promise2 = pinkySwear(extend);

    var callCallbacks = function callCallbacks() {
      try {
        var f = state ? onFulfilled : onRejected;

        if (isFunction(f)) {
          var resolve = function resolve(x) {
            var then,
                cbCalled = 0;

            try {
              if (x && (isObject(x) || isFunction(x)) && isFunction(then = x["then"])) {
                if (x === promise2) throw new TypeError();
                then["call"](x, function () {
                  if (!cbCalled++) resolve.apply(undef, arguments);
                }, function (value) {
                  if (!cbCalled++) promise2(false, [value]);
                });
              } else promise2(true, arguments);
            } catch (e) {
              if (!cbCalled++) promise2(false, [e]);
            }
          };

          resolve(f.apply(undef, values || []));
        } else promise2(state, values);
      } catch (e) {
        promise2(false, [e]);
      }
    };

    if (state != null) defer(callCallbacks);else deferred.push(callCallbacks);
    return promise2;
  };

  if (extend) {
    set = extend(set);
  }

  return set;
}

module.exports = pinkySwear;

}).call(this)}).call(this,require('_process'),require("timers").setImmediate)
},{"_process":34,"timers":35}],19:[function(require,module,exports){
"use strict";

var util = require("./util");

var WebSocket = require("./websocket");

module.exports = PromisedConnection;

function PromisedConnection() {
  this._conn = null;
  this._closed = false;
}

PromisedConnection.prototype.resolve = function (err, conn) {
  var _this = this;

  if (err) {
    this._closed = true; // TODO: raise onerror
    // TODO: raise onclose
  }

  this._conn = conn;

  if (this._closed) {
    this._conn.close.apply(this._conn, this._closed);
  } else {
    this._conn.onclose = function (evt) {
      if (_this.onclose) _this.onclose(evt);
    };

    this._conn.onopen = function (evt) {
      if (_this.onopen) _this.onopen(evt);
    };

    this._conn.onmessage = function (evt) {
      if (_this.onmessage) _this.onmessage(evt);
    };

    this._conn.onerror = function (evt) {
      if (_this.onerror) _this.onerror(evt);
    };
  }
};

PromisedConnection.prototype.close = function (code, reason) {
  var _this2 = this;

  // Already closed; no-op.
  if (this._closed) {
    return;
  } // Set _closed to arguments instead of true; arguments is
  // truthy and it also lets us send the arguments to the real
  // connection if necessary


  this._closed = arguments;

  if (this._conn) {
    // If we already have the connection, close it. If not, we
    // rely on the promise callback to check the _closed flag.
    // Use the tortured .apply() form because both parameters
    // are optional.
    this._conn.close.apply(this._conn, arguments);
  } else {
    setTimeout(function () {
      if (_this2.onclose) {
        var evt = util.createEvent("close", {
          currentTarget: _this2,
          target: _this2,
          srcElement: _this2,
          code: code || 1005,
          reason: reason || "",
          wasClean: true
        });

        _this2.onclose(evt);
      }
    }, 0);
  }
};

PromisedConnection.prototype.send = function (data) {
  if (this._conn) {
    return this._conn.send(data);
  } else if (this.readyState === WebSocket.CONNECTING) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CONNECTING state.");
  } else if (this.readyState === WebSocket.CLOSED) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CLOSED state.");
  } else if (this.readyState === WebSocket.CLOSING) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CLOSING state.");
  } else {
    throw new Error("Unexpected PromisedConnection readyState " + this.readyState);
  }
}; // Convenience method for returning a property on the connection, or
// if the promise is pending or failed, return some other value.


PromisedConnection.prototype._getConnProperty = function (prop, ifPending, ifFailed) {
  if (!this._conn && this._closed) {
    // Failure
    return ifFailed;
  } else if (this._conn) {
    // Success
    return this._conn[prop];
  } else {
    // this._connPromise() === undefined
    return ifPending;
  }
}; // Proxy some properties


Object.defineProperty(PromisedConnection.prototype, "readyState", {
  get: function readyState() {
    if (this._closed) return WebSocket.CLOSED;else return this._getConnProperty("readyState", WebSocket.CONNECTING, WebSocket.CLOSED);
  }
});
Object.defineProperty(PromisedConnection.prototype, "protocol", {
  get: function protocol() {
    return this._getConnProperty("readyState", "", "");
  }
});
Object.defineProperty(PromisedConnection.prototype, "extensions", {
  get: function protocol() {
    return this._getConnProperty("extensions", "", "");
  }
});

},{"./util":25,"./websocket":26}],20:[function(require,module,exports){
(function (global){(function (){
"use strict";

var whitelist = [];
Object.defineProperty(exports, "whitelist", {
  get: function get() {
    return whitelist;
  }
});

exports.init = function (shinyServer, disableProtocols) {
  var $ = global.jQuery;

  function supports_html5_storage() {
    // window.localStorage is allowed to throw a SecurityError, so we must catch
    try {
      return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
      return false;
    }
  }

  var availableOptions = ["websocket", "xhr-streaming", "xdr-streaming", "eventsource", "iframe-eventsource", "htmlfile", "iframe-htmlfile", "xhr-polling", "xdr-polling", "iframe-xhr-polling", "jsonp-polling"]; // `slice` with no args is a shallow clone. since `availableOptions` is all strings, it's de facto deep cloned.

  var defaultPermitted = availableOptions.slice(); // MS Edge works very poorly with xhr-streaming (repro'd with shinyapps.io and RSC on Edge 17.17134)

  if (/\bEdge\//.test(window.navigator.userAgent)) {
    defaultPermitted.splice($.inArray("xhr-streaming", defaultPermitted), 1);
  }

  var store = null; // If a whitelist exists in localstorage, load that instead of the default whitelist

  if (supports_html5_storage()) {
    store = window.localStorage;
    var whitelistStr = store["shiny.whitelist"];

    if (!whitelistStr || whitelistStr === "") {
      // use our user-agent defaults if not specified
      whitelist = defaultPermitted;
    } else {
      whitelist = JSON.parse(whitelistStr); // Regardless of what the user set, disable any protocols that aren't offered by the server.

      $.each(whitelist, function (i, p) {
        if ($.inArray(p, availableOptions) === -1) {
          // Then it's not a valid option
          whitelist.splice($.inArray(p, whitelist), 1);
        }
      });
    }
  } else {
    whitelist = defaultPermitted;
  }

  var networkSelectorVisible = false;
  var networkSelector = undefined;
  var networkOptions = undefined; // Build the SockJS network protocol selector.
  //
  // Has the side-effect of defining values for both "networkSelector"
  // and "networkOptions".

  function buildNetworkSelector() {
    networkSelector = $('<div style="top: 50%; left: 50%; position: absolute; z-index: 99999;">' + '<div style="position: relative; width: 300px; margin-left: -150px; padding: .5em 1em 0 1em; height: 400px; margin-top: -190px; background-color: #FAFAFA; border: 1px solid #CCC; font.size: 1.2em;">' + '<h3>Select Network Methods</h3>' + '<div id="ss-net-opts"></div>' + '<div id="ss-net-prot-warning" style="color: #44B">' + (supports_html5_storage() ? '' : "These network settings can only be configured in browsers that support HTML5 Storage. Please update your browser or unblock storage for this domain.") + '</div>' + '<div style="float: right;">' + '<input type="button" value="Reset" onclick="ShinyServer.enableAll()"></input>' + '<input type="button" value="OK" onclick="ShinyServer.toggleNetworkSelector();" style="margin-left: 1em;" id="netOptOK"></input>' + '</div>' + '</div></div>');
    networkOptions = $('#ss-net-opts', networkSelector);
    $.each(availableOptions, function (index, val) {
      var label = $(document.createElement("label")).css({
        color: $.inArray(val, disableProtocols) >= 0 ? "silver" : "",
        display: "block"
      });
      var checkbox = $(document.createElement("input")).attr("type", "checkbox").attr("id", "ss-net-opt-" + val).attr("name", "shiny-server-proto-checkbox").attr("value", index + "").attr("checked", $.inArray(val, whitelist) >= 0 ? "checked" : null).attr("disabled", supports_html5_storage() ? null : "disabled");
      label.append(checkbox);
      label.append(val + " ");
      networkOptions.append(label);
      checkbox.on("change", function (evt) {
        shinyServer.setOption(val, $(evt.target).prop('checked'));
      });
    });
  }

  $(document).keydown(function (event) {
    if (event.shiftKey && event.ctrlKey && event.altKey && event.keyCode == 65) {
      toggleNetworkSelector();
    }
  });
  shinyServer.toggleNetworkSelector = toggleNetworkSelector;

  function toggleNetworkSelector() {
    if (networkSelectorVisible) {
      networkSelectorVisible = false;
      networkSelector.hide();
    } else {
      // Lazily build the DOM for the selector the first time it is toggled.
      if (networkSelector === undefined) {
        buildNetworkSelector();
        $('body').append(networkSelector);
      }

      networkSelectorVisible = true;
      networkSelector.show();
    }
  }

  shinyServer.enableAll = enableAll;

  function enableAll() {
    $('input', networkOptions).each(function (index, val) {
      $(val).prop('checked', true);
    }); // Enable each protocol internally

    $.each(availableOptions, function (index, val) {
      setOption(val, true);
    });
  }
  /**
   * Doesn't update the DOM, just updates our internal model.
   */


  shinyServer.setOption = setOption;

  function setOption(option, enabled) {
    $("#ss-net-prot-warning").html("Updated settings will be applied when you refresh your browser or load a new Shiny application.");

    if (enabled && $.inArray(option, whitelist) === -1) {
      whitelist.push(option);
    }

    if (!enabled && $.inArray(option, whitelist >= 0)) {
      // Don't remove if it's the last one, and recheck
      if (whitelist.length === 1) {
        $("#ss-net-prot-warning").html("You must leave at least one method selected.");
        $("#ss-net-opt-" + option).prop('checked', true);
      } else {
        whitelist.splice($.inArray(option, whitelist), 1);
      }
    }

    store["shiny.whitelist"] = JSON.stringify(whitelist);
  }
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],21:[function(require,module,exports){
(function (global){(function (){
"use strict";

var EventEmitter = require("events").EventEmitter;

var inherits = require("inherits");

var $ = global.jQuery;
var dialogHtml = '<div id="ss-connect-dialog" style="display: none;"></div><div id="ss-overlay" class="ss-gray-out" style="display: none;"></div>';
var countdownContentsHtml = '<label>Reconnect failed. Retrying in <span id="ss-dialog-countdown"></span> seconds...</label> <a id="ss-reconnect-link" href="#" class="ss-dialog-link">Try now</a>';
var reconnectContentsHtml = '<label>Attempting to reconnect...</label><label>&nbsp;</label>';
var disconnectContentsHtml = '<label>Disconnected from the server.</label> <a id="ss-reload-link" href="#" class="ss-dialog-link">Reload</a>';
module.exports = ReconnectUI;

function ReconnectUI() {
  var _this = this;

  EventEmitter.call(this);
  $(function () {
    var dialog = $(dialogHtml);
    dialog.appendTo('body');
    $(document).on("click", '#ss-reconnect-link', function (e) {
      e.preventDefault();

      _this.emit("do-reconnect");
    });
    $(document).on("click", "#ss-reload-link", function (e) {
      e.preventDefault();
      window.location.reload();
    });
  });
}

inherits(ReconnectUI, EventEmitter); // Relevant events:
//
// Reconnect SCHEDULED
// Reconnect ATTEMPTING
// Reconnect SUCEEDED
// Reconnect FAILURE (final failure)
// States:
// Everything up to first disconnect: show nothing
// On reconnect attempt: Show "Attempting to reconnect [Cancel]"
// On disconnect or reconnect failure: Show "Reconnecting in x seconds [Try now]"
// On reconnect success: show nothing
// On stop: "Connection lost [Reload]"

ReconnectUI.prototype.showCountdown = function (delay) {
  if (delay < 200) return;
  var attemptTime = Date.now() + delay;
  $('#ss-connect-dialog').html(countdownContentsHtml);
  $('#ss-connect-dialog').show(); // $('#ss-overlay').show();

  function updateCountdown(seconds
  /* optional */
  ) {
    if (typeof seconds === "undefined") {
      seconds = Math.max(0, Math.floor((attemptTime - Date.now()) / 1000)) + "";
    }

    $("#ss-dialog-countdown").html(seconds);
  }

  updateCountdown(Math.round(delay / 1000));

  if (delay > 15000) {
    var updateInterval = setInterval(function () {
      if (Date.now() > attemptTime) {
        clearInterval(updateInterval);
      } else {
        updateCountdown();
      }
    }, 15000);
  }
};

ReconnectUI.prototype.showAttempting = function () {
  $('body').addClass('ss-reconnecting');
  $("#ss-connect-dialog").html(reconnectContentsHtml);
  $('#ss-connect-dialog').show(); // $('#ss-overlay').show();
};

ReconnectUI.prototype.hide = function () {
  $('body').removeClass('ss-reconnecting');
  $('#ss-connect-dialog').hide();
  $('#ss-overlay').hide();
};

ReconnectUI.prototype.showDisconnected = function () {
  $('#ss-connect-dialog').html(disconnectContentsHtml).show();
  $('#ss-overlay').show();
  $('body').removeClass('ss-reconnecting');
  $('#ss-overlay').addClass('ss-gray-out');
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"events":31,"inherits":32}],22:[function(require,module,exports){
(function (global){(function (){
"use strict";

var log = require("./log");

var pathParams = require("../common/path-params");

var currConn = null;
global.__shinyserverdebug__ = {
  interrupt: function interrupt() {
    log("OK, we'll silently drop messages starting now.");

    currConn.send = function (data) {
      log("Dropping message " + data);
    };

    currConn.onmessage = function (e) {
      log("Ignoring message " + e.data);
    };
  },
  disconnect: function disconnect() {
    log("OK, we'll simulate a disconnection."); // 46xx range for close code tells the reconnect
    // decorator to try reconnecting, which we normally
    // only do on !wasClean disconnects.

    currConn.close(4600);
  }
}; // options.disableProtocols can be an array of protocols to remove from the
// whitelist

exports.createFactory = function (protocolChooser, options) {
  return function (url, context, callback) {
    if (!callback) throw new Error("callback is required");
    url = pathParams.reorderPathParams(url, ["n", "o", "t", "w", "s"]);
    var whitelist = [];
    protocolChooser.whitelist.forEach(function (prot) {
      if (!options.disableProtocols || options.disableProtocols.indexOf(prot) < 0) {
        whitelist.push(prot);
      }
    }); // If we are left with an empty whitelist, add a dummy protocol for the
    // edge case where we end up with no valid protocols. SockJS interprets an
    // empty transport list as permitting _all_ protocols. Useful when trying
    // to test behavior when all protocols are disabled.

    if (whitelist.length == 0) {
      whitelist.push("dummy");
    }

    var sockjsOptions = {
      transports: whitelist
    };
    var conn = new global.SockJS(url, null, sockjsOptions);
    currConn = conn;
    callback(null, conn);
  };
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../common/path-params":4,"./log":15}],23:[function(require,module,exports){
(function (global){(function (){
"use strict";

exports.isSubApp = isSubApp;

function isSubApp() {
  var subApp = global.location.search.match(/\?.*__subapp__=(\d)/);
  return subApp && subApp[1]; //is truthy
}

exports.createSocket = createSocket;

function createSocket() {
  if (!window.parent || !window.parent.ShinyServer || !window.parent.ShinyServer.multiplexer) {
    throw new Error("Multiplexer not found in parent");
  }

  var relURL = window.frameElement.getAttribute("src"); // Add /__sockjs__/ to the end of the path

  relURL = relURL.replace(/\/?(\?.*|$)/, "/__sockjs__/");
  return window.parent.ShinyServer.multiplexer.open(relURL);
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],24:[function(require,module,exports){
(function (global){(function (){
"use strict";

var $ = global.jQuery;
exports.onLoggedIn = onLoggedIn;

function onLoggedIn(credentials) {
  if (!credentials) return;
  var user = credentials.user;
  var str = '<div class="shiny-server-account">' + '  Logged in as <span class="shiny-server-username"></span>';

  if (credentials.strategy !== 'proxy-auth') {
    str += '  <a href="__logout__">Logout</a>';
  }

  str += '</div>';
  var div = $(str);
  div.find('.shiny-server-username').text(user);
  $('body').append(div);
}

function formatDate(date) {
  if (!date) return '?/?/????';
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

exports.onLicense = onLicense;

function onLicense(Shiny, license) {
  if (!license) return;

  try {
    if (window.localStorage.getItem("ssp_log_license")) {
      console.log(license);
    }
  } catch (err) {// No need to report
  }

  if (license.status !== 'expired' && license.status !== 'grace') return;
  var noun = license.evaluation ? 'evaluation' : 'license';
  var message = 'Your Shiny Server ' + noun + ' expired';
  if (license.expiration) message += ' on ' + formatDate(new Date(license.expiration));
  message += '.';

  if (license.status === 'expired') {
    setTimeout(function () {
      window.alert(message + '\n\n' + 'Please purchase and activate a license.');
    }, 0);

    if (Shiny && Shiny.shinyapp && Shiny.shinyapp.$socket) {
      Shiny.shinyapp.$socket.close();
    }
  } else if (license.status === 'grace') {
    $('.shiny-server-expired').remove();
    var div = $('<div class="shiny-server-expired">' + 'WARNING: ' + message + '</div>');
    $('body').append(div);
    setTimeout(function () {
      div.animate({
        top: -(div.height() + 16
        /* total vertical padding */
        )
      }, 'slow', function () {
        div.remove();
      });
    }, 8000);
  }
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],25:[function(require,module,exports){
(function (global){(function (){
"use strict";

var log = require("./log");

var pinkySwear = require("./pinkyswear");

exports.createNiceBackoffDelayFunc = function () {
  // delays, in seconds; recycle the last value as needed
  var niceBackoff = [0, 1, 2, 3, 5];
  var pos = -1;
  return function () {
    pos = Math.min(++pos, niceBackoff.length - 1);
    return niceBackoff[pos] * 1000;
  };
}; // Call a function that returns a promise one or more times, until
// it either returns successfully, or time expires. Use a configurable
// delay in between attempts.
//
// progressCallbacks should be an EventEmitter or similar; this function will
// emit the following events (and arguments):
//
// "schedule", delayMillis  // Called each time the next attempt is scheduled
// "attempt"                // Called each time an attempt begins
// "success"                // Called if retryPromise_p ends in success
// "failure"                // Called if retryPromise_p ends in failure
//
// On the same progressCallbacks object, this function will LISTEN FOR the
// following event (note that it can be invoked repeatedly):
//
// "retry-now"              // Stop waiting for next attempt; do it immediately.
//                          // If emitted during an attempt, event will be
//                          // ignored.


exports.retryPromise_p = function (create_p, delayFunc, expiration, progressCallbacks) {
  if (!progressCallbacks) progressCallbacks = {
    emit: function emit() {}
  };
  var promise = exports.promise();
  var delay = delayFunc(); // Don't let the delay exceed the remaining time til expiration.

  delay = Math.min(delay, expiration - Date.now()); // But in no case should the delay be less than zero, either.

  delay = Math.max(0, delay);

  function attempt() {
    progressCallbacks.removeListener("retry-now", retryNow);
    progressCallbacks.emit("attempt");
    create_p().then(function (value) {
      progressCallbacks.emit("success");
      promise(true, [value]);
    }, function (err) {
      if (Date.now() >= expiration) {
        progressCallbacks.emit("failure");
        promise(false, [err]);
      } else {
        // Recurse. pinkySwear doesn't give us a way to easily
        // resolve a promise with another promise, so we have to
        // do it manually.
        exports.retryPromise_p(create_p, delayFunc, expiration, progressCallbacks).then(function () {
          promise(true, arguments);
        }, function () {
          promise(false, arguments);
        }).done();
      }
    }).done();
  }

  var timeoutHandle = setTimeout(attempt, delay);

  function retryNow() {
    clearTimeout(timeoutHandle);
    attempt();
  }

  progressCallbacks.on("retry-now", retryNow);
  progressCallbacks.emit("schedule", delay);
  return promise;
};

exports.createEvent = function (type, props) {
  if (global.document) {
    try {
      return new Event(type, props);
    } catch (e) {
      // "new Event()" not supported in MSIE, not even 11
      var evt = global.document.createEvent("Event");
      evt.initEvent(type, true, false);

      for (var key in props) {
        evt[key] = props[key];
      }

      return evt;
    }
  } else if (props) {
    props.type = type;
    return props;
  } else {
    return {
      type: type
    };
  }
};

function addDone(prom) {
  prom.done = function () {
    prom.then(null, function (err) {
      log("Unhandled promise error: " + err);
      log(err.stack);
    });
  };

  return prom;
}

exports.promise = function () {
  return pinkySwear(addDone);
}; // PauseConnection is similar to pauseable streams
// in Node.js; used to delay events in case the
// process of registering event handlers has some
// asynchronicity to it. In our case, returning a
// connection as a promise means that whoever is
// waiting on the promise won't get a chance to
// register event listeners until at least one trip
// through the event loop.
//
// PauseConnection instances start out in the paused
// state, and must be manually resumed with .resume().
// The readyState is also paused, to ensure that it
// is in sync with the events (i.e. it'd be weird to
// see a connection transition to OPEN without onopen)
// but it is debatable whether this is more correct
// than having readyState always reflect the actual
// state of the underlying connection, because the
// underlying state is more relevant when it comes to
// calling send()/close() on this connection (which
// pass straight through to the underlying connection).


exports.PauseConnection = PauseConnection;

function PauseConnection(conn) {
  this._conn = conn;
  this._paused = true;
  this._events = [];
  this._timeout = null;
  this.readyState = conn.readyState;
  var pauseConnection = this;
  ["onopen", "onmessage", "onerror", "onclose"].forEach(function (evt) {
    conn[evt] = function () {
      if (pauseConnection._paused) {
        pauseConnection._events.push({
          event: evt,
          args: arguments,
          readyState: conn.readyState
        });
      } else {
        this.readyState = conn.readyState;
        pauseConnection[evt].apply(this, arguments);
      }
    };
  });
}

PauseConnection.prototype.resume = function () {
  var _this = this;

  this._timeout = setTimeout(function () {
    while (_this._events.length) {
      var e = _this._events.shift();

      _this.readyState = e.readyState;

      _this[e.event].apply(_this, e.args);
    }

    _this._paused = false;
  }, 0);
};

PauseConnection.prototype.pause = function () {
  clearTimeout(this._timeout);
  this._paused = true;
};

PauseConnection.prototype.close = function () {
  this._conn.close.apply(this._conn, arguments);
};

PauseConnection.prototype.send = function () {
  this._conn.send.apply(this._conn, arguments);
};

Object.defineProperty(PauseConnection.prototype, "url", {
  get: function get() {
    return this._conn.url;
  }
});
Object.defineProperty(PauseConnection.prototype, "protocol", {
  get: function get() {
    return this._conn.protocol;
  }
});
Object.defineProperty(PauseConnection.prototype, "extensions", {
  get: function get() {
    return this._conn.extensions;
  }
});

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./log":15,"./pinkyswear":18}],26:[function(require,module,exports){
"use strict"; // Constants from WebSocket and SockJS APIs.

exports.CONNECTING = 0;
exports.OPEN = 1;
exports.CLOSING = 2;
exports.CLOSED = 3;

},{}],27:[function(require,module,exports){
(function (global){(function (){
'use strict';

var objectAssign = require('object-assign');

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:
// NB: The URL to the CommonJS spec is kept just for tradition.
//     node-assert has evolved a lot since then, both in API and behavior.

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util/');
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = (function () {
  return function foo() {}.name === 'foo';
}());
function pToString (obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' +  name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' +
         self.operator + ' ' +
         truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if ((actual === null || typeof actual !== 'object') &&
             (expected === null || typeof expected !== 'object')) {
    return strict ? actual === expected : actual == expected;

  // If both values are instances of typed arrays, wrap their underlying
  // ArrayBuffers in a Buffer each to increase performance
  // This optimization requires the arrays to have the same type as checked by
  // Object.prototype.toString (aka pToString). Never perform binary
  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
  // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) &&
             pToString(actual) === pToString(expected) &&
             !(actual instanceof Float32Array ||
               actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer),
                   new Uint8Array(expected.buffer)) === 0;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || {actual: [], expected: []};

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b))
    return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
      return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}


// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if ((isUnwantedException &&
      userProvidedMessage &&
      expectedException(actual, expected)) ||
      isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function(err) { if (err) throw err; };

// Expose a strict only variant of assert
function strict(value, message) {
  if (!value) fail(value, true, message, '==', strict);
}
assert.strict = objectAssign(strict, assert, {
  equal: assert.strictEqual,
  deepEqual: assert.deepStrictEqual,
  notEqual: assert.notStrictEqual,
  notDeepEqual: assert.notDeepStrictEqual
});
assert.strict.strict = assert.strict;

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"object-assign":33,"util/":30}],28:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],29:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],30:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":29,"_process":34,"inherits":28}],31:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}

},{}],32:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],33:[function(require,module,exports){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

'use strict';
/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],34:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],35:[function(require,module,exports){
(function (setImmediate,clearImmediate){(function (){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this)}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":34,"timers":35}]},{},[16]);
