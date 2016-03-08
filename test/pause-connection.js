"use strict";

const assert = require("chai").assert;
const util = require("../lib/util");
const WebSocket = require("../lib/websocket");

const PauseConnection = util.PauseConnection;

// This will model the underlying connection that's
// being paused.
function TrivialConnection() {
  this.readyState = WebSocket.CONNECTING;
  this.url = "http://localhost/websocket";
  this.log = [];

  this.onopen = function(e) {};
  this.onclose = function(e) {};
  this.onmessage = function(e) {};
  this.onerror = function(e) {};
}
TrivialConnection.prototype.send = function(data) {
  this.log.push({
    type: "send",
    data: data
  });
};
TrivialConnection.prototype.close = function(code, reason) {
  this.log.push({
    type: "close",
    data: {code: code, reason: reason}
  });
  this.onclose(util.createEvent("close", {
    code: code,
    reason: reason
  }));
};

describe("PauseConnection", () => {
  let tc = new TrivialConnection();
  tc.protocol = "whatever";
  let pc = new PauseConnection(tc);
  let pcLog = [];
  pc.onopen = () => pcLog.push("open");
  pc.onmessage = () => pcLog.push("message");
  pc.onclose = () => pcLog.push("close");
  pc.onerror = () => pcLog.push("error");

  it("copies basic properties", () => {
    assert.equal(pc.url, tc.url);
    assert.equal(pc.protocol, tc.protocol);
  });

  it("pauses", done => {
    tc.readyState = WebSocket.OPEN;
    tc.onopen(util.createEvent("open"));
    tc.onmessage(util.createEvent("message", {
      data: "Hello"
    }));
    assert.equal(pcLog.length, 0);
    assert.equal(pc.readyState, WebSocket.CONNECTING);
    setTimeout(() => {
      assert.equal(pcLog.length, 0);
      assert.equal(pc.readyState, WebSocket.CONNECTING);
      done();
    }, 100);
  });

  it("resumes", done => {
    pc.resume();
    setTimeout(() => {
      assert.equal(pcLog.length, 2);
      assert.equal(pc.readyState, WebSocket.OPEN);
      done();
    }, 100);
  });
});
