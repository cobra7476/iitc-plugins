// ==UserScript==
// @author         jaiperdu
// @name           IITC plugin: Cache visible portals
// @category       Cache
// @version        0.1.0
// @description    Cache the data of visible portals and use this to populate the map when possible
// @id             cache-portals
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://le-jeu.github.io/iitc-plugins/cache-portals.user.js
// @downloadURL    https://le-jeu.github.io/iitc-plugins/cache-portals.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'lejeu';
plugin_info.dateTimeVersion = '2021-05-06-155434';
plugin_info.pluginId = 'cache-portals';
//END PLUGIN AUTHORS NOTE

// use own namespace for plugin
var cachePortals = {};

cachePortals.MIN_ZOOM = 15;          // zoom min to show data
cachePortals.MAX_AGE = 12 * 60 * 60; // 12 hours max age for cached data

function openDB() {
  var rq = window.indexedDB.open("cache-portals", 1);
  rq.onupgradeneeded = function (event) {
    var db = event.target.result;
    var store = db.createObjectStore("portals", { keyPath: "guid" });
    store.createIndex("latLngE6", ["latE6", "lngE6"], { unique: true });
    store.createIndex("loadtime", "loadtime", { unique: false });
  };
  rq.onsuccess = function (event) {
    var db = event.target.result;
    cachePortals.db = db;
    cleanup();
  };
  return rq;
}

function cleanup() {
  if (!cachePortals.db) return;
  var maxAge = Date.now() - cachePortals.MAX_AGE * 1000;
  var tx = cachePortals.db.transaction("portals", "readwrite");
  tx
    .objectStore("portals")
    .index("loadtime")
    .openKeyCursor(window.IDBKeyRange.upperBound(maxAge)).onsuccess = function (
    event
  ) {
    var cursor = event.target.result;
    if (cursor) {
      tx.objectStore("portals").delete(cursor.primaryKey);
      cursor.continue();
    }
  };
}

function putPortal(portal) {
  if (!cachePortals.db) return;
  var tx = cachePortals.db.transaction("portals", "readwrite");
  tx.objectStore("portals").put(portal);
}

function portalDetailLoaded(data) {
  if (data.success) {
    var portal = {
      guid: data.guid,
      team: data.details.team,
      latE6: data.details.latE6,
      lngE6: data.details.lngE6,
      timestamp: data.details.timestamp,
      loadtime: +Date.now(),
    };
    putPortal(portal);
  }
}

function portalAdded(data) {
  var portal = {
    guid: data.portal.options.guid,
    team: data.portal.options.data.team,
    latE6: data.portal.options.data.latE6,
    lngE6: data.portal.options.data.lngE6,
    timestamp: data.portal.options.timestamp,
    loadtime: +Date.now(),
  };
  putPortal(portal);
}

function entityInject(data) {
  if (!cachePortals.db) return;
  if (window.map.getZoom() < cachePortals.MIN_ZOOM) return;
  var tx = cachePortals.db.transaction("portals", "readonly");
  var index = tx.objectStore("portals").index("latLngE6");

  var bounds = window.map.getBounds();
  var lowerBound = [bounds.getSouth(), bounds.getWest()].map((v) =>
    Math.round(v * 1e6)
  );
  var upperBound = [bounds.getNorth(), bounds.getEast()].map((v) =>
    Math.round(v * 1e6)
  );

  var range = window.IDBKeyRange.bound(lowerBound, upperBound);

  var maxAge = Date.now() - cachePortals.MAX_AGE * 1000;

  var ents = [];
  index.openCursor(range).onsuccess = function (event) {
    var cursor = event.target.result;
    if (cursor) {
      var portal = cursor.value;
      if (portal.lngE6 < lowerBound[1])
        cursor.continue([portal.latE6, lowerBound[1]]);
      else if (portal.lngE6 > upperBound[1])
        cursor.continue([portal.latE6 + 1, lowerBound[1]]);
      else {
        if (portal.loadtime > maxAge) {
          ents.push([
            portal.guid,
            portal.timestamp,
            ["p", portal.team, portal.latE6, portal.lngE6],
          ]);
        }
        if (ents.length > 50) {
          data.callback(ents, "core");
          ents = [];
        }
        cursor.continue();
      }
    } else {
      if (ents.length > 0) data.callback(ents, "core");
    }
  };
}

function setup() {
  if (!window.indexedDB) return;
  window.plugin.cachePortals = cachePortals;

  openDB();

  window.addHook("portalAdded", portalAdded);
  window.addHook("portalDetailLoaded", portalDetailLoaded);
  window.addHook("mapDataEntityInject", entityInject);
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

