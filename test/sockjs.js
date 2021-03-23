"use strict";

const assert = require("chai").assert;

const sockjs = require("../lib/sockjs");

describe("sockjs factory", () => {
  const targetURL = "http://some-url.com/";
  const context = null;

  let sockjsOriginal;
  let protocolChooser;
  before(() => {
    sockjsOriginal = global.SockJS;
    // mimic signature from
    // https://github.com/sockjs/sockjs-client/blob/v1.5.0/lib/main.js#L32
    // and just return an object with those values.
    global.SockJS = (url, deprecated_protocols, options) => {
      return {url, deprecated_protocols, options};
    };
    protocolChooser = {whitelist: ["alpha", "bravo", "charley"]};
  });

  after(() => {
    global.SockJS = sockjsOriginal;
  });
  
  it("with no disabled protocols, all protocols are enumerated as transports", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.transports, ["alpha", "bravo", "charley"]);
      done();
    });
  });

  it("with an empty set of disabled protocols, all protocols are enumerated as transports", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: []});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.transports, ["alpha", "bravo", "charley"]);
      done();
    });
  });

  it("with a subset of protocols disabled, only the remaining protocols are included as transports", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: ["bravo"]});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.transports, ["alpha", "charley"]);
      done();
    });
  });

  it("with all protocols disabled, a dummy protocol is included as transport", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: ["alpha", "bravo", "charley"]});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.transports, ["dummy"]);
      done();
    });
  });
});
