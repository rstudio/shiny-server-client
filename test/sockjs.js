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
    // https://github.com/sockjs/sockjs-client/blob/v0.3.4/lib/sockjs.js#L9
    // and just return an object with those values.
    global.SockJS = (url, dep_protocols_whitelist, options) => {
      return {url, dep_protocols_whitelist, options};
    };
    protocolChooser = {whitelist: ["alpha", "bravo", "charley"]};
  });

  after(() => {
    global.SockJS = sockjsOriginal;
  });
  
  it("does not configure debugging when transport debugging is not specified", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {});
    factory(targetURL, context, (_, conn) => {
      assert.equal(conn.options.debug, false);
      done();
    });
  });

  it("does not configure debugging when transport debugging is disabled", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {transportDebugging: false});
    factory(targetURL, context, (_, conn) => {
      assert.equal(conn.options.debug, false);
      done();
    });
  });
  
  it("does configures debugging when transport debugging is enabled", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {transportDebugging: true});
    factory(targetURL, context, (_, conn) => {
      assert.equal(conn.options.debug, true);
      done();
    });
  });
  
  it("with no disabled protocols, all protocols are enumerated", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.protocols_whitelist, ["alpha", "bravo", "charley"]);
      done();
    });
  });

  it("with an empty set of disabled protocols, all protocols are enumerated", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: []});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.protocols_whitelist, ["alpha", "bravo", "charley"]);
      done();
    });
  });

  it("with a subset of protocols disabled, only the remaining protocols are included", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: ["bravo"]});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.protocols_whitelist, ["alpha", "charley"]);
      done();
    });
  });

  it("with all protocols disabled, a dummy protocol is included", (done) => {
    let factory = sockjs.createFactory(
      protocolChooser,
      {disableProtocols: ["alpha", "bravo", "charley"]});
    factory(targetURL, context, (_, conn) => {
      assert.deepEqual(conn.options.protocols_whitelist, ["dummy"]);
      done();
    });
  });
});
