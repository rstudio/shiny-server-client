"use strict";

let whitelist = [];

Object.defineProperty(exports, "whitelist", {
  get: function() {
    return whitelist;
  }
});

exports.init = function(shinyServer, disableProtocols) {

  let $ = global.jQuery;

  function supports_html5_storage() {
    // window.localStorage is allowed to throw a SecurityError, so we must catch
    try {
      return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
      return false;
    }
  }

  let availableOptions = ["websocket","xdr-streaming","xhr-streaming","eventsource","iframe-eventsource","htmlfile","iframe-htmlfile","xdr-polling","xhr-polling","iframe-xhr-polling","jsonp-polling"];
  // `slice` with no args is a shallow clone. since `availableOptions` is all strings, it's de facto deep cloned.
  let defaultPermitted = availableOptions.slice();
  // MS Edge works very poorly with xhr-streaming (repro'd with shinyapps.io and RSC on Edge 17.17134)
  if (/\bEdge\//.test(window.navigator.userAgent)) {
      defaultPermitted.splice($.inArray("xhr-streaming", defaultPermitted), 1);
  }

  let store = null;

  // If a whitelist exists in localstorage, load that instead of the default whitelist
  if (supports_html5_storage()){
    store = window.localStorage;
    let whitelistStr = store["shiny.whitelist"];
    if (!whitelistStr || whitelistStr === ""){
      // use our user-agent defaults if not specified
      whitelist = defaultPermitted;
    } else {
      whitelist = JSON.parse(whitelistStr);
      // Regardless of what the user set, disable any protocols that aren't offered by the server.
      $.each(whitelist, function(i, p){
        if ($.inArray(p, availableOptions) === -1){
          // Then it's not a valid option
          whitelist.splice($.inArray(p, whitelist), 1);
        }
      });
    }
  } else {
    whitelist = defaultPermitted;
  }

  let networkSelectorVisible = false;
  let networkSelector = undefined;
  let networkOptions = undefined;

  // Build the SockJS network protocol selector.
  //
  // Has the side-effect of defining values for both "networkSelector"
  // and "networkOptions".
  function buildNetworkSelector() {
    networkSelector = $('<div style="top: 50%; left: 50%; position: absolute; z-index: 99999;">' +
                     '<div style="position: relative; width: 300px; margin-left: -150px; padding: .5em 1em 0 1em; height: 400px; margin-top: -190px; background-color: #FAFAFA; border: 1px solid #CCC; font.size: 1.2em;">'+
                     '<h3>Select Network Methods</h3>' +
                     '<div id="ss-net-opts"></div>' +
                     '<div id="ss-net-prot-warning" style="color: #44B">'+(supports_html5_storage()?'':"These network settings can only be configured in browsers that support HTML5 Storage. Please update your browser or unblock storage for this domain.")+'</div>' +
                     '<div style="float: right;">' +
                     '<input type="button" value="Reset" onclick="ShinyServer.enableAll()"></input>' +
                     '<input type="button" value="OK" onclick="ShinyServer.toggleNetworkSelector();" style="margin-left: 1em;" id="netOptOK"></input>' +
                     '</div>' +
                     '</div></div>');

    networkOptions = $('#ss-net-opts', networkSelector);
    $.each(availableOptions, function(index, val){
      let label = $(document.createElement("label"))
        .css({
          color: $.inArray(val, disableProtocols) >= 0 ? "silver" : "",
          display: "block"
        });

      let checkbox = $(document.createElement("input"))
        .attr("type", "checkbox")
        .attr("id", "ss-net-opt-" + val)
        .attr("name", "shiny-server-proto-checkbox")
        .attr("value", index + "")
        .attr("checked", ($.inArray(val, whitelist) >= 0) ? "checked" : null)
        .attr("disabled", supports_html5_storage() ? null : "disabled");

      label.append(checkbox);
      label.append(val + " ");
      networkOptions.append(label);

      checkbox.on("change", function(evt){
        shinyServer.setOption(val, $(evt.target).prop('checked'));
      });
    });
  }

  $(document).keydown(function(event){
    if (event.shiftKey && event.ctrlKey && event.altKey && event.keyCode == 65){
      toggleNetworkSelector();
    }
  });

  shinyServer.toggleNetworkSelector = toggleNetworkSelector;
  function toggleNetworkSelector(){
    if (networkSelectorVisible) {
      networkSelectorVisible = false;
      networkSelector.hide();
    } else {
      // Lazily build the DOM for the selector the first time it is toggled.
      if (networkSelector === undefined) {
        buildNetworkSelector();
        $('body').append(networkSelector);
      }

      networkSelectorVisible = true;
      networkSelector.show();
    }
  }

  shinyServer.enableAll = enableAll;
  function enableAll(){
    $('input', networkOptions).each(function(index, val){
      $(val).prop('checked', true);
    });
    // Enable each protocol internally
    $.each(availableOptions, function(index, val){
      setOption(val, true);
    });
  }

  /**
   * Doesn't update the DOM, just updates our internal model.
   */
  shinyServer.setOption = setOption;
  function setOption(option, enabled){
    $("#ss-net-prot-warning").html("Updated settings will be applied when you refresh your browser or load a new Shiny application.");
    if (enabled && $.inArray(option, whitelist) === -1){
      whitelist.push(option);
    }
    if (!enabled && $.inArray(option, whitelist >= 0)){
      // Don't remove if it's the last one, and recheck
      if (whitelist.length === 1){
        $("#ss-net-prot-warning").html("You must leave at least one method selected.");
        $("#ss-net-opt-" + option).prop('checked', true);
      } else{
        whitelist.splice($.inArray(option, whitelist), 1);
      }
    }
    store["shiny.whitelist"] = JSON.stringify(whitelist);
  }
};
