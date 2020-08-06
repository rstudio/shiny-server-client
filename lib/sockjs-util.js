"use strict";

exports.isLegacySockJS = isLegacySockJS;
function isLegacySockJS() {
  const version = global.SockJS.version || "1.0.0";
  return version.split(".")[0] ===  "0";
}