// No ES6 allowed in this directory!

module.exports = MessageBuffer;
function MessageBuffer() {
  this._messages = [];
  this._startIndex = 0;
  this._messageId = 0;
}

MessageBuffer.formatId = formatId
function formatId(id) {
  return id.toString(16).toUpperCase();
};

MessageBuffer.prototype.write = function(msg) {
  msg = formatId(this._messageId++) + "#" + msg;
  this._messages.push(msg);
  return msg;
};

// Returns the number of messages that were actually
// discarded.
//
// Can throw an error, if nextId is outside of the valid range.
MessageBuffer.prototype.discard = function(nextId) {
  var keepIdx = nextId - this._startIndex;
  if (keepIdx < 0) {
    throw new Error("Discard position id too small");
  }
  if (keepIdx > this._messages.length) {
    throw new Error("Discard position id too big");
  }
  this._messages = this._messages.slice(keepIdx);
  this._startIndex = nextId;
  return keepIdx;  // equal to the number of messages we dropped
};

MessageBuffer.prototype.nextId = function() {
  return this._messageId;
};

// Can throw an error, if startId is outside of the valid range.
MessageBuffer.prototype.getMessagesFrom = function(startId) {
  var from = startId - this._startIndex;
  if (from < 0) {
    throw new Error("Message buffer underrun detected")
  }
  if (from > this._messages.length) {
    throw new Error("Message id larger than expected")
  }

  return this._messages.slice(from);
};
