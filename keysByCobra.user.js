// ==UserScript==
// @author         xelio
// @name           IITC plugin: Keys
// @category       Misc
// @version        0.4.0-cobra.20211215.160822
// @description    Allow manual entry of key counts for each portal. Use the 'keys-on-map' plugin to show the numbers on the map, and 'sync' to share between multiple browsers or desktop/mobile.
// @id             keys
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://github.com/cobra7476/iitc-plugins/raw/dist/keysByCobra.user.js
// @downloadURL    https://github.com/cobra7476/iitc-plugins/raw/dist/keysByCobra.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'cobra7476';
plugin_info.dateTimeVersion = '2021-12-15-160822';
plugin_info.pluginId = 'keysByCobra';
//END PLUGIN AUTHORS NOTE

// use own namespace for plugin
window.plugin.keys = function() {};

// delay in ms
window.plugin.keys.SYNC_DELAY = 5000;

window.plugin.keys.LOCAL_STORAGE_KEY = 'plugin-keys-data';

window.plugin.keys.KEY = {key: 'plugin-keys-data', field: 'keys'};
window.plugin.keys.UPDATE_QUEUE = {key: 'plugin-keys-data-queue', field: 'updateQueue'};
window.plugin.keys.UPDATING_QUEUE = {key: 'plugin-keys-data-updating-queue', field: 'updatingQueue'};

window.plugin.keys.keys = {};
window.plugin.keys.updateQueue = {};
window.plugin.keys.updatingQueue = {};

window.plugin.keys.enableSync = false;

window.plugin.keys.disabledMessage = null;
window.plugin.keys.contentHTML = null;

window.plugin.keys.addToSidebar = function() {
	if(typeof(Storage) === "undefined") {
		$('#portaldetails > .imgpreview').after(plugin.keys.disabledMessage);
		return;
	}

	$('#portaldetails > .imgpreview').after(plugin.keys.contentHTML);
	plugin.keys.updateDisplayCount();
}

window.plugin.keys.updateDisplayCount = function() {
	var guid = window.selectedPortal;
	var count = plugin.keys.keys[guid] || 0;
	$('#keys-count').html(count);
}

window.plugin.keys.addKey = function(addCount, guid) {
	if(guid == undefined) guid = window.selectedPortal;

	var oldCount = plugin.keys.keys[guid];
	var newCount = Math.max((oldCount || 0) + addCount, 0);
	if(oldCount !== newCount) {
		if(newCount === 0) {
			delete plugin.keys.keys[guid];
			plugin.keys.updateQueue[guid] = null;
		} else {
		  plugin.keys.keys[guid] = newCount;
		  plugin.keys.updateQueue[guid] = newCount;
		}

		plugin.keys.storeLocal(plugin.keys.KEY);
		plugin.keys.storeLocal(plugin.keys.UPDATE_QUEUE);
		plugin.keys.updateDisplayCount();
		window.runHooks('pluginKeysUpdateKey', {guid: guid, count: newCount});
		plugin.keys.delaySync();
	}
}

// Delay the syncing to group a few updates in a single request
window.plugin.keys.delaySync = function() {
	if(!plugin.keys.enableSync) return;
	clearTimeout(plugin.keys.delaySync.timer);
	plugin.keys.delaySync.timer = setTimeout(function() {
		plugin.keys.delaySync.timer = null;
		window.plugin.keys.syncNow();
	}, plugin.keys.SYNC_DELAY);
}

// Store the updateQueue in updatingQueue and upload
window.plugin.keys.syncNow = function() {
	if(!plugin.keys.enableSync) return;
	$.extend(plugin.keys.updatingQueue, plugin.keys.updateQueue);
	plugin.keys.updateQueue = {};
	plugin.keys.storeLocal(plugin.keys.UPDATING_QUEUE);
	plugin.keys.storeLocal(plugin.keys.UPDATE_QUEUE);

	plugin.sync.updateMap('keys', 'keys', Object.keys(plugin.keys.updatingQueue));
}

// Call after IITC and all plugin loaded
window.plugin.keys.registerFieldForSyncing = function() {
	if(!window.plugin.sync) return;
	window.plugin.sync.registerMapForSync('keys', 'keys', window.plugin.keys.syncCallback, window.plugin.keys.syncInitialed);
}

// Call after local or remote change uploaded
window.plugin.keys.syncCallback = function(pluginName, fieldName, e, fullUpdated) {
	if(fieldName === 'keys') {
		plugin.keys.storeLocal(plugin.keys.KEY);
		// All data is replaced if other client update the data during this client offline, 
		// fire 'pluginKeysRefreshAll' to notify a full update
		if(fullUpdated) {
			plugin.keys.updateDisplayCount();
			window.runHooks('pluginKeysRefreshAll');
			return;
		}

		if(!e) return;
		if(e.isLocal) {
			// Update pushed successfully, remove it from updatingQueue
			delete plugin.keys.updatingQueue[e.property];
		} else {
			// Remote update
			delete plugin.keys.updateQueue[e.property];
			plugin.keys.storeLocal(plugin.keys.UPDATE_QUEUE);
			plugin.keys.updateDisplayCount();
			window.runHooks('pluginKeysUpdateKey', {guid: e.property, count: plugin.keys.keys[e.property]});
		}
	}
}

// syncing of the field is initialed, upload all queued update
window.plugin.keys.syncInitialed = function(pluginName, fieldName) {
	  if(fieldName === 'keys') {
			plugin.keys.enableSync = true;
			if(Object.keys(plugin.keys.updateQueue).length > 0) {
				plugin.keys.delaySync();
			}
	  }
}

window.plugin.keys.storeLocal = function(mapping) {
	  if(typeof(plugin.keys[mapping.field]) !== 'undefined' && plugin.keys[mapping.field] !== null) {
			localStorage[mapping.key] = JSON.stringify(plugin.keys[mapping.field]);
	  } else {
			localStorage.removeItem(mapping.key);
	  }
}

window.plugin.keys.loadLocal = function(mapping) {
	  var objectJSON = localStorage[mapping.key];
	  if(!objectJSON) return;
	  plugin.keys[mapping.field] 	= mapping.convertFunc 
									? mapping.convertFunc(JSON.parse(objectJSON))
									: JSON.parse(objectJSON);
}

// For backward compatibility, will change to use loadLocal after a few version
window.plugin.keys.loadKeys = function() {
	  var keysObjectJSON = localStorage[plugin.keys.KEY.key];
	  if(!keysObjectJSON) return;
	  var keysObject = JSON.parse(keysObjectJSON);
	  // Move keys data up one level, it was {keys: keys_data} in localstorage in previous version
	  plugin.keys.keys = keysObject.keys ? keysObject.keys : keysObject;
	  if(keysObject.keys) plugin.keys.storeLocal(plugin.keys.KEY);
}

window.plugin.keys.setupCSS = function() {
	$("<style>")
		.prop("type", "text/css")
		.html('\
#keys-content-outer {\
  display: table;\
  width: 100%;\
  height: 26px;\
  text-align: center;\
  display: table;\
    width: 100%;\
    height: 26px;\
    margin: 14px;\
    margin-left: 0;\
    margin-right: 0;\
    text-align: center;\
}\
\
#keys-content-outer > div{\
  display: inline-block;\
  vertical-align: middle;\
  margin: 6px 3px 1px 3px;\
}\
\
#keys-label {\
  padding: 0 4px;\
  cursor: help;\
}\
\
#keys-add {\
}\
\
#keys-count {\
  width: 26px;\
  height: 18px !important;\
  border: 1px solid;\
  text-align: center;\
  cursor: help;\
}\
\
#keys-subtract {\
}\
\
.keys-button {\
  position:relative;\
  width: 16px;\
  height: 16px !important;\
}\
\
.keys-button > div {\
  background-color: rgb(32, 168, 177);\
  position: absolute;\
}\
\
.keys-button-minus {\
  width: 100%;\
  height: 4px;\
  top: 6px;\
}\
\
.keys-button-plus-h {\
  width: 100%;\
  height: 4px;\
  top: 6px;\
}\
\
.keys-button-plus-v {\
  width: 4px;\
  height: 100%;\
  left: 6px;\
}\
\
div#keys-button-clear-all {\
    width: 20px;\
    height: 25px;\
    background-color: rgb(32, 168, 177);\
    margin: 0;\
    padding: 0;\
    margin-left: 11px;\
    cursor: pointer;\
    margin-bottom: -4px;\
    border: solid 1px;\
    border-color: rgb(32, 168, 177);\
}\
\
div#keys-button-clear-all div.keys-button-carre {\
    background-color: black;\
    width: 14px;\
    height: 20px;\
    margin: 0;\
    padding : 0;\
    position: relative;\
    left: 3px;\
}\
\
div#keys-button-clear-all div.keys-button-lid {\
  background-color:rgb(32, 168, 177);\
  width: 18px;\
  height: 3px;\
  margin: 0;\
  padding : 0;\
  position: relative;\
  bottom: 25px;\
  left: 1px;\
}\
\
#keys-help {\
  font-weight: 900;\
  margin: 6px 3px 1px 20px !important;\
  cursor: help;\
}\
\
.portal-list-keys button {\
  font-family: monospace;\
  font-size: 0.9em;\
  text-align: center;\
  vertical-align: middle;\
  min-width: 0;\
  padding: 0;\
  width: 1.5em;\
  margin: -6px 0 -3px;\
}\
#portalslist.mobile .portal-list-keys button {\
  width: 3em;\
  height: 1.5em;\
}\
.portal-list-keys .plus {\
  margin-left: 0.3em;\
  margin-right: -1px;\
}\
\
')
		.appendTo("head");
}

window.plugin.keys.setupContent = function() {
	plugin.keys.contentHTML = 	'<div id="keys-content-outer">'
							+ 		'<div id="keys-label" title="Problem? Point to the question mark!">Key(s):</div>'
							+ 		'<div id="keys-add" class="keys-button" '
							+ 				'onclick="window.plugin.keys.addKey(-1);">'
							+ 			'<div class="keys-button-minus"></div>'
							+ 		'</div>'
							+	 	'<div id="keys-count" title="Problem? Point to the question mark!"></div>'
							+ 		'<div id="keys-subtract" class="keys-button" '
							+ 			'onclick="window.plugin.keys.addKey(1);">'
							+			'<div class="keys-button-plus-v"></div>'
							+ 			'<div class="keys-button-plus-h"></div>'
							+ 		'</div>'
							+ 		'<div id="keys-help" title="You MUST manually input your count of keys!\n'
							+ 				'This plugin CANNOT automatically get the keys from Ingress!">'
							+				'?'
							+		'</div>'
							+ 		'<div id="keys-button-clear-all" onclick="window.plugin.keys.clearAllKeys();"'
							+				'title="delete all keys">'
							+    		'<div class="keys-button-carre">x</div>'
							+			'<div class="keys-button-lid"></div>'
							+		'</div>'
							+	'</div>';
  plugin.keys.disabledMessage = '<div id="keys-content-outer" title="Your browser do not support localStorage">Plugin Keys disabled</div>';
}


window.plugin.keys.setupPortalsList = function() {

	window.addHook('pluginKeysUpdateKey', function(data) {
		$('[data-list-keycount="'+data.guid+'"]').text(data.count);
	});

	window.addHook('pluginKeysRefreshAll', function() {
		$('[data-list-keycount]').each(function(i, element) {
			var guid = element.getAttribute("data-list-keycount");
			$(element).text(plugin.keys.keys[guid] || 0);
		});
	});

	window.plugin.portalslist.fields.push({
		title: "Keys",
		value: function(portal) { return portal.options.guid; }, // we store the guid, but implement a custom comparator so the list does sort properly without closing and reopening the dialog
		sort: function(guidA, guidB) {
			var keysA = plugin.keys.keys[guidA] || 0;
			var keysB = plugin.keys.keys[guidB] || 0;
			return keysA - keysB;
		},
		format: function(cell, portal, guid) {
			$(cell)
				.addClass("alignR portal-list-keys ui-dialog-buttonset") // ui-dialog-buttonset for proper button styles
				.append($('<span>')
					.text(plugin.keys.keys[guid] || 0)
					.attr({
						"class": "value",
						"data-list-keycount": guid
				}));
			// for some reason, jQuery removes event listeners when the list is sorted. Therefore we use DOM's addEventListener
			$('<button>')
				.text('+')
				.addClass("plus")
				.appendTo(cell)
					[0].addEventListener("click", function() { window.plugin.keys.addKey(1, guid); }, false);
			$('<button>')
				.text('-')
				.addClass("minus")
				.appendTo(cell)
					[0].addEventListener("click", function() { window.plugin.keys.addKey(-1, guid); }, false);
		},
	});
}
//ajout de la fonction permettant de supprimer toute les clef du stockage local
window.plugin.keys.clearAllKeys = function ()
{
	plugin.keys.keys = {};
	for (const guid of Object.keys(plugin.keys.updateQueue)) {
		plugin.keys.updateQueue[guid] = null;
	}

	plugin.keys.storeLocal(plugin.keys.KEY);
	plugin.keys.storeLocal(plugin.keys.UPDATE_QUEUE);
	plugin.keys.updateDisplayCount();
	window.runHooks('pluginKeysRefreshAll');
	plugin.keys.delaySync();

	console.log('clefs supprimées avec succès');
}

var setup =  function() {
	// HOOKS:
	// - pluginKeysUpdateKey
	// - pluginKeysRefreshAll

	window.plugin.keys.setupCSS();
	window.plugin.keys.setupContent();
	window.plugin.keys.loadLocal(plugin.keys.UPDATE_QUEUE);
	window.plugin.keys.loadKeys();
	window.addHook('portalDetailsUpdated', window.plugin.keys.addToSidebar);
	window.plugin.keys.registerFieldForSyncing();

	if (window.plugin.portalslist) {
		window.plugin.keys.setupPortalsList();
	}
}

setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);

