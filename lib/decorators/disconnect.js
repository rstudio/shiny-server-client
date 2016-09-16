"use strict";

const BaseConnectionDecorator = require("./base-connection-decorator");

exports.decorate = function(factory, options) {
  return function(url, ctx, callback) {
    factory(url, ctx, function(err, conn) {
      let wrapper = new BaseConnectionDecorator(conn);
      conn.onclose = function(e) {
        ctx.emit("disconnect", e);
        if (wrapper.onclose) {
          wrapper.onclose.apply(wrapper, arguments);
        }
      };
      callback(err, wrapper);
    });
  };
};
