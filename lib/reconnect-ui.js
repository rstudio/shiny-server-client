"use strict";

const EventEmitter = require("events").EventEmitter;
const inherits = require("inherits");

let $ = global.jQuery;

// Relevant events:
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

function DelegatedUI() {
  EventEmitter.call(this);

  $(document).on("click", '#ss-reconnect-link', e => {
    e.preventDefault();
    this.emit("do-reconnect");
  });
  $(document).on("click", "#ss-reload-link", e => {
    e.preventDefault();
    window.location.reload();
  });

  this.updateInterval = null;
}

inherits(DelegatedUI, EventEmitter);


DelegatedUI.prototype.showCountdown = function(delay) {
  clearInterval(this.updateInterval);
  if (delay < 200)
    return;
  let attemptTime = Date.now() + delay;
  global.Shiny.notifications.show({
    id: "reconnect",
    html: 'Reconnect failed. Retrying in <span id="ss-dialog-countdown"></span> seconds...',
    action: '<a id="ss-reconnect-link" href="#">Try now</a>',
    closeButton: false,
    type: "warning"
  });
  // $('#ss-overlay').show();

  function updateCountdown(seconds /* optional */) {
    if (typeof(seconds) === "undefined") {
      seconds = Math.max(0, Math.floor((attemptTime - Date.now()) / 1000)) + "";
    }
    $("#ss-dialog-countdown").html(seconds);
  }
  updateCountdown(Math.round(delay / 1000));
  if (delay > 15000) {
    this.updateInterval = setInterval(() => {
      if (Date.now() > attemptTime) {
        clearInterval(this.updateInterval);
      } else {
        updateCountdown();
      }
    }, 15000);
  }
};

DelegatedUI.prototype.showAttempting = function() {
  clearInterval(this.updateInterval);
  global.Shiny.notifications.show({
    id: "reconnect",
    html: "Attempting to reconnect...",
    closeButton: false,
    type: "warning"
  });
};

DelegatedUI.prototype.hide = function() {
  clearInterval(this.updateInterval);
  global.Shiny.notifications.remove("reconnect");
};

DelegatedUI.prototype.showDisconnected = function() {
  clearInterval(this.updateInterval);
  global.Shiny.notifications.show({
    id: "reconnect",
    html: "Disconnected from the server.",
    action: '<a id="ss-reload-link" href="#">Reload</a>',
    closeButton: false,
    type: "warning"
  });
};

exports.createReconnectUI = function() {
  return new DelegatedUI();
};
