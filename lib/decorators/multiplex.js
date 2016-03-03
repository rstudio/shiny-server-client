let MultiplexClient = require("../multiplex-client");

var util = require("../util");
var PromisedConnection = require("../promised-connection");

// The job of this decorator is to wrap the underlying
// connection with our Multiplexing protocol, designed
// to allow multiple iframes to share the same connection
// on the client but proxy out to multiple sessions on
// the server. This decorator provides the "primary"
// multiplex channel, i.e. the one from the outermost
// webpage/frame.
//
// * Writes to ctx: multiplexClient (MultiplexClient)
// * Reads from ctx: nothing
exports.decorate = function(factory, options) {
  return function(url, ctx, callback) {

    let multiplexClientPromise = util.promise();

    ctx.multiplexClient = {
      open: url => {
        let pc = new PromisedConnection();
        multiplexClientPromise.then(
          client => {
            pc.resolve(null, client.open(url));
          }
        ).then(
          null,
          err => {
            pc.resolve(err);
          }
        );

        return pc;
      }
    };

    return factory(url, ctx, function(err, conn) {
      if (err) {
        callback(err);
        return;
      }

      let m = /\/([^\/]+)$/.exec(global.location.pathname);
      let relUrl = m ? m[1] : "";

      try {
        let client = new MultiplexClient(conn);
        callback(null, client.open(relUrl));
        multiplexClientPromise(true, [client]);
      } catch(e) {
        multiplexClientPromise(false, [e]);
        callback(e);
      }
    });
  };
};

exports.decorate2 = function(factory, options) {
  return function(url, ctx, callback) {
    url = util.addPathParams(url, {s: 0});
    return factory(url, ctx, callback);
  };
};
