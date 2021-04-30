// ==UserScript==
// @author         jaiperdu
// @name           IITC plugin: Highlighters selection
// @category       Highlighter
// @version        0.1.0
// @description    Allow multiple highlighter to work concurrently
// @id             highlighters
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://le-jeu.github.io/iitc-plugins/highlighters.user.js
// @downloadURL    https://le-jeu.github.io/iitc-plugins/highlighters.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'lejeu';
plugin_info.dateTimeVersion = '2021-04-30-110556';
plugin_info.pluginId = 'highlighters';
//END PLUGIN AUTHORS NOTE

/* global L */
/* eslint-env es6 */

// use own namespace for plugin
const highlighters = {};

highlighters.settings = {
  highlighters_enabled: [],
};
highlighters.SETTINGS_KEY = 'plugin-highlighters-settings';

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage[highlighters.SETTINGS_KEY]);
    Object.assign(highlighters.settings, settings);
  } finally {
    // nothing to do
  }
}

function storeSettings() {
  localStorage[highlighters.SETTINGS_KEY] = JSON.stringify(highlighters.settings);
}

function displayDialog() {
  const html = L.DomUtil.create('div', 'container');

  const enabledList = L.DomUtil.create('ol', 'enabled highlighters-list', html);
  for (const hl of highlighters.settings.highlighters_enabled) {
    if (!window._highlighters[hl]) continue;
    const li = L.DomUtil.create('li', null, enabledList);
    li.dataset['name'] = hl;
    li.textContent = hl;
  }

  const disabledList = L.DomUtil.create('ul', 'disabled highlighters-list', html);
  for (const hl in window._highlighters) {
    if (highlighters.settings.highlighters_enabled.includes(hl)) continue;
    const li = L.DomUtil.create('li', null, disabledList);
    li.dataset['name'] = hl;
    li.textContent = hl;
  }

  $([enabledList, disabledList]).sortable({
    connectWith: '.highlighters-list',
    placeholder: 'sortable-placeholder',
    forcePlaceholderSize:true,
    update: function () {
      const list = [];
      highlighters.settings.highlighters_enabled = [];
      for (const li of enabledList.children) {
        list.push(li.dataset['name']);
      }
      highlighters.settings.highlighters_enabled = list;
      storeSettings();
      window.resetHighlightedPortals();
    }
  }).disableSelection();

  window.dialog({
    html: html,
    id: 'plugin-highlighters',
    title: 'Highlighters',
  });
}

const PortalStyler = L.Class.extend({
  initialize: function (portal) {
    L.setOptions(this, portal.options);
  },
  setStyle: function (style) {
    L.setOptions(this, style);
  },
  setRadius: function (radius) {
    L.setOptions(this, {radius: radius});
  },
  getRadius: function () {
    return this.options.radius;
  },
  getOptions: function () {
    return this.options;
  }
});

function highlightPortal(p) {
  const styler = new PortalStyler(p);
  for (const hl of highlighters.settings.highlighters_enabled) {
    const highlighter = window._highlighters[hl];
    if (highlighter !== undefined) {
      highlighter.highlight({portal: styler});
    }
  }
  const style = styler.getOptions();
  p.setStyle(style);
  if (style.radius === 0) p.setRadius(style.radius);
}

window.plugin.highlighters = highlighters;

/* eslint-disable-next-line no-unused-vars */
const setup = function () {
  $('<style>').prop('type', 'text/css').html('\
.highlighters-list {\
  border: 1px solid #eee;\
  min-height: 20px;\
  padding-left: 0\
}\
\
ul.highlighters-list {\
  list-style-type: none\
}\
\
.highlighters-list li {\
  padding: 6px;\
  list-style-position: inside;\
  border-bottom: 1px solid grey;\
}\
').appendTo('head');

  window.highlightPortal = highlightPortal;
  if (window._highlighters === null) window._highlighters = {};

  const a = L.DomUtil.create('a', null, document.querySelector('#toolbox'));
  a.textContent = 'Highlighters';
  L.DomEvent.on(a, 'click', displayDialog);

  loadSettings();
};

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

