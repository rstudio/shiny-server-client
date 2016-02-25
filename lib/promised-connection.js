var WebSocket = require("./websocket");

module.exports = PromisedConnection;
function PromisedConnection() {
  this._conn = null;
  this._closed = false;
}

PromisedConnection.prototype.resolve = function(err, conn) {
  if (err) {
    this._closed = true;
    // TODO: raise onerror
    // TODO: raise onclose
  }

  var self = this;

  this._conn = conn;
  if (this._closed) {
    this._conn.close.apply(this._conn, this._closed);
  } else {
    this._conn.onclose = function(evt) {
      self.onclose(evt);
    };
    this._conn.onopen = function(evt) {
      self.onopen(evt);
    };
    this._conn.onmessage = function(evt) {
      self.onmessage(evt);
    };
    this._conn.onerror = function(evt) {
      self.onerror(evt);
    };
  }
};

PromisedConnection.prototype.close = function(code, reason) {
  var self = this;

  // Already closed; no-op.
  if (this._closed) {
    return;
  }

  // Set _closed to arguments instead of true; arguments is
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
    setTimeout(function() {
      if (self.onclose) {
        var evt = util.createEvent("close", {
          currentTarget: self,
          target: self,
          srcElement: self,
          code: code || 1005,
          reason: reason || "",
          wasClean: true
        });
        self.onclose(evt);
      }
    }, 0);
  }
};

PromisedConnection.prototype.send = function(data) {
  if (this._conn) {
    return this._conn.send(data);
  } else if (this.readyState === WebSocket.CONNECTING) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CONNECTING state.");
  } else if (this.readyState === WebSocket.CLOSED) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CLOSED state.");
  } else if (this.readyState === WebSocket.CLOSING) {
    throw new Error("Can't execute 'send' on 'WebSocket' when in CLOSING state.");
  }
};

// Convenience method for returning a property on the connection, or
// if the promise is pending or failed, return some other value.
PromisedConnection.prototype._getConnProperty = function(prop, ifPending, ifFailed) {
  if (!this._conn && this._closed) {
    // Failure
    return ifFailed;
  } else if (this._conn) {
    // Success
    return this._conn[prop];
  } else { // this._connPromise() === undefined
    return ifPending;
  }
};

// Proxy some properties

Object.defineProperty(PromisedConnection.prototype, "readyState", {
  get: function readyState() {
    if (this._closed)
      return WebSocket.CLOSED;
    else
      return this._getConnProperty("readyState", WebSocket.CONNECTING, WebSocket.CLOSED);
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
