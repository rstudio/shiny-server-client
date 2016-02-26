module.exports = MessageReceiver;
function MessageReceiver() {
  this._pendingMsgId = 0;
}

MessageReceiver.prototype.receive = function(msg) {
  var match = /^([\dA-F]+)#/.exec(msg);
  if (!match) {
    throw new Error("Invalid robust-message, no msg-id found");
  }

  this._pendingMsgId = parseInt(match[1], 16) + 1;

  return msg.replace(/^([\dA-F]+)#/, "");
};

MessageReceiver.prototype.nextId = function() {
  return this._pendingMsgId;
};

MessageReceiver.prototype.ACK = function() {
  return "ACK " + this._pendingMsgId.toString(16).toUpperCase();
};

MessageReceiver.prototype.CONTINUE = function() {
  return "CONTINUE " + this._pendingMsgId.toString(16).toUpperCase();
};
