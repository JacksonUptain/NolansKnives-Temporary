// Avoids a circular require between index.js and ai/*.js: index.js calls
// setInternals() once, after its own exports are assigned, right before
// requiring ./ai. Everything in ai/*.js reads through getInternals().
let internals = null;

function setInternals(obj) {
  internals = obj;
}

function getInternals() {
  if (!internals) throw new Error("AI internals not registered yet.");
  return internals;
}

module.exports = { setInternals, getInternals };
