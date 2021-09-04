// ==UserScript==
// @author         jaiperdu
// @name           IITC plugin: Dev: Portal extends CircleMarker
// @category       Tweak
// @version        0.1.0
// @description    Portal extends CircleMarker
// @id             portal-extends-circlemarker
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://le-jeu.github.io/iitc-plugins/portal-extends-circlemarker.user.js
// @downloadURL    https://le-jeu.github.io/iitc-plugins/portal-extends-circlemarker.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'lejeu';
plugin_info.dateTimeVersion = '2021-09-04-113641';
plugin_info.pluginId = 'portal-extends-circlemarker';
//END PLUGIN AUTHORS NOTE

/* map_data_render.js */

window.Render.prototype.clearPortalsOutsideBounds = function(bounds) {
	var count = 0;
	for (var guid in window.portals) {
		var p = portals[guid];
		if (!bounds.contains(p.getLatLng()) && guid !== selectedPortal && !artifact.isInterestingPortal(guid)) {
			p.remove();
			count++;
		}
	}
}

window.Render.prototype.endRenderPass = function() {
	var countp = 0, countl = 0, countf = 0;
	for (var guid in window.portals) {
		if (!(guid in this.seenPortalsGuid) && guid !== selectedPortal) {
			this.deletePortalEntity(guid);
			countp++;
		}
	}
	for (var guid in window.links) {
		if (!(guid in this.seenLinksGuid)) {
			this.deleteLinkEntity(guid);
			countl++;
		}
	}
	for (var guid in window.fields) {
		if (!(guid in this.seenFieldsGuid)) {
			this.deleteFieldEntity(guid);
			countf++;
		}
	}
	this.bringPortalsToFront();

	this.isRendering = false;
}

window.Render.prototype.createPlaceholderPortalEntity = function(guid, latE6, lngE6, team, timestamp) {
	timestamp = timestamp || 0;

	var ent = [
		guid,       //ent[0] = guid
		timestamp,  //ent[1] = timestamp
		['p',      //0 - a portal
			team,     //1 - team
			latE6,    //2 - lat
			lngE6     //3 - lng
		]
	];

	this.createPortalEntity(ent, 'core'); // placeholder
}

window.Render.prototype.createPortalEntity = function(ent, details) { // details expected in decodeArray.portal
	this.seenPortalsGuid[ent[0]] = true;  // flag we've seen it

	var previousData = undefined;

	var data = decodeArray.portal(ent[2], details);
	var guid = ent[0];
	data.guid = guid;
	if (!data.timestamp)
		data.timestamp = ent[1];
	data.ent = ent;
	var oldPortal = guid in window.portals;

	if (oldPortal) {
		var p = window.portals[guid];

		if (!p.willUpdate(data)) {
			this.addPortalToMapLayer(p);
			return p;
		}
		previousData = $.extend(true, {}, p.getDetails());
	}

	var latlng = L.latLng(data.latE6 / 1E6, data.lngE6 / 1E6);

	window.pushPortalGuidPositionCache(data.guid, data.latE6, data.lngE6);
	if (urlPortalLL && urlPortalLL[0] == latlng.lat && urlPortalLL[1] == latlng.lng) {

		urlPortal = data.guid;
		urlPortalLL = undefined;  // clear the URL parameter so it's not matched again
	}
	if (urlPortal == data.guid) {
		selectedPortal = data.guid;
		urlPortal = undefined;  // clear the URL parameter so it's not matched again
	}

	var marker = undefined;
	if (oldPortal) {
		marker = window.portals[data.guid];

		marker.updateDetails(data);

		window.runHooks('portalAdded', { portal: marker, previousData: previousData });
	} else {
		marker = createMarker(latlng, data);
		if (portalDetail.isFresh(guid)) {
			var oldDetails = portalDetail.get(guid);
			if (data.timestamp > oldDetails.timestamp) {
				portalDetail.remove(guid);
			} else if (marker.willUpdate(oldDetails))
				marker.updateDetails(oldDetails);
		}

		window.runHooks('portalAdded', { portal: marker });

		window.portals[data.guid] = marker;

		if (selectedPortal === data.guid)
			marker.renderDetails();
	}

	window.ornaments.addPortal(marker);
	this.addPortalToMapLayer(marker);

	return marker;
}

/* map_data_request.js */

window.MapDataRequest.prototype.constructor = function() {
	this.cache = new DataCache();
	this.render = new Render();
	this.debugTiles = new RenderDebugTiles();

	this.activeRequestCount = 0;
	this.requestedTiles = {};

	this.renderQueue = [];
	this.renderQueueTimer = undefined;
	this.renderQueuePaused = false;

	this.idle = false;
	this.MAX_REQUESTS = 5;
	this.NUM_TILES_PER_REQUEST = 25;
	this.MAX_TILE_RETRIES = 5;
	this.MOVE_REFRESH = 3; //time, after a map move (pan/zoom) before starting the refresh processing
	this.STARTUP_REFRESH = 3; //refresh time used on first load of IITC
	this.IDLE_RESUME_REFRESH = 5; //refresh time used after resuming from idle
	this.DOWNLOAD_DELAY = 1;  //delay after preparing the data download before tile requests are sent
	this.RUN_QUEUE_DELAY = 0;
	this.BAD_REQUEST_RUN_QUEUE_DELAY = 5; // longer delay before doing anything after errors (other than TIMEOUT)
	this.EMPTY_RESPONSE_RUN_QUEUE_DELAY = 5; // also long delay - empty responses are likely due to some server issues
	this.TIMEOUT_REQUEST_RUN_QUEUE_DELAY = 0;
	this.RENDER_BATCH_SIZE = window.map.options.preferCanvas ? 1E9 : 1500;
	this.RENDER_PAUSE = (typeof android === 'undefined') ? 0.1 : 0.2; //100ms desktop, 200ms mobile


	this.REFRESH_CLOSE = 300;  // refresh time to use for close views z>12 when not idle and not moving
	this.REFRESH_FAR = 900;  // refresh time for far views z <= 12
	this.FETCH_TO_REFRESH_FACTOR = 2;  //minimum refresh time is based on the time to complete a data fetch, times this value
	this.setStatus('startup', undefined, -1);
}

/*  portal_detail.js */

var cache;
var requestQueue = {};

window.portalDetail = function() { };

window.portalDetail.setup = function() {
	cache = new DataCache();

	cache.startExpireInterval(20);
}

window.portalDetail.get = function(guid) {
	return cache.get(guid);
}

window.portalDetail.isFresh = function(guid) {
	return cache.isFresh(guid);
}

window.portalDetail.remove = function(guid) {
	return cache.remove(guid);
}

var handleResponse = function(deferred, guid, data, success) {
	if (!data || data.error || !data.result) {
		success = false;
	}

	if (success) {
		var ent = [guid, data.result[13], data.result];
		var portal = window.mapDataRequest.render.createPortalEntity(ent, 'detailed');

		cache.store(guid, portal.options.data);

		deferred.resolve(portal.options.data);
		window.runHooks('portalDetailLoaded', { guid: guid, success: success, details: portal.options.data, ent: ent });

	} else {
		if (data && data.error == "RETRY") {
			doRequest(deferred, guid);
		} else {
			deferred.reject();
			window.runHooks('portalDetailLoaded', { guid: guid, success: success });
		}
	}

}

var doRequest = function(deferred, guid) {
	window.postAjax('getPortalDetails', { guid: guid },
		function(data, textStatus, jqXHR) { handleResponse(deferred, guid, data, true); },
		function() { handleResponse(deferred, guid, undefined, false); }
	);
}

window.portalDetail.request = function(guid) {
	if (!requestQueue[guid]) {
		var deferred = $.Deferred();
		requestQueue[guid] = deferred.promise();
		deferred.always(function() { delete requestQueue[guid]; });

		doRequest(deferred, guid);
	}

	return requestQueue[guid];
}

/* portal_detail_display.js */

window.renderPortalDetails = function(guid, forceSelect) {
	if (forceSelect || selectedPortal !== guid)
		selectPortal(window.portals[guid] ? guid : null, 'renderPortalDetails');
	if ($('#sidebar').is(':visible')) {
		window.resetScrollOnNewPortal();
		window.renderPortalDetails.lastVisible = guid;
	}

	if (guid && !portalDetail.isFresh(guid)) {
		portalDetail.request(guid);
	}

	if (!window.portals[guid]) {
		urlPortal = guid;
		$('#portaldetails').html('');
		if (isSmartphone()) {
			$('.fullimg').remove();
			$('#mobileinfo').html('<div style="text-align: center"><b>tap here for info screen</b></div>');
		}
		return;
	}

	var portal = window.portals[guid];
	var details = portal.getDetails();
	var hasFullDetails = portal.hasFullDetails();
	var historyDetails = getPortalHistoryDetails(details);

	var modDetails = hasFullDetails ? '<div class="mods">' + getModDetails(details) + '</div>' : '';
	var miscDetails = hasFullDetails ? getPortalMiscDetails(guid, details) : '';
	var resoDetails = hasFullDetails ? getResonatorDetails(details) : '';
	var statusDetails = hasFullDetails ? '' : '<div id="portalStatus">Loading details...</div>';

	var img = fixPortalImageUrl(details.image);
	var title = details.title || 'null';

	var lat = details.latE6 / 1E6;
	var lng = details.lngE6 / 1E6;

	var imgTitle = title + '\n\nClick to show full image.';
	var levelInt = portal.options.level;
	var levelDetails = levelInt;
	if (hasFullDetails) {
		levelDetails = getPortalLevel(details);
		if (levelDetails != 8) {
			if (levelDetails == Math.ceil(levelDetails))
				levelDetails += "\n8";
			else
				levelDetails += "\n" + (Math.ceil(levelDetails) - levelDetails) * 8;
			levelDetails += " resonator level(s) needed for next portal level";
		} else {
			levelDetails += "\nfully upgraded";
		}
	}
	levelDetails = "Level " + levelDetails;


	var linkDetails = $('<div>', { class: 'linkdetails' });

	var posOnClick = window.showPortalPosLinks.bind(this, lat, lng, title);

	if (typeof android !== 'undefined' && android && android.intentPosLink) {

		var shareLink = $('<a>').text('Share portal').click(posOnClick);
		linkDetails.append($('<aside>').append($('<div>').append(shareLink)));

	} else {
		var permaHtml = $('<a>').attr({
			href: window.makePermalink([lat, lng]),
			title: 'Create a URL link to this portal'
		}
		).text('Portal link');
		linkDetails.append($('<aside>').append($('<div>').append(permaHtml)));
		var mapHtml = $('<a>').attr({
			title: 'Link to alternative maps (Google, etc)'
		}).text('Map links').click(posOnClick);
		linkDetails.append($('<aside>').append($('<div>').append(mapHtml)));
	}

	$('#portaldetails')
		.html('') //to ensure it's clear
		.attr('class', TEAM_TO_CSS[teamStringToId(details.team)])
		.append(
			$('<h3>', { class: 'title' })
				.text(title)
				.prepend(
					$('<svg><use xlink:href="#ic_place_24px"/><title>Click to move to portal</title></svg>')
						.attr({
							class: 'material-icons icon-button',
							style: 'float: left'
						})
						.click(function() {
							zoomToAndShowPortal(guid, [details.latE6 / 1E6, details.lngE6 / 1E6]);
							if (isSmartphone()) { show('map') };
						})),

			$('<span>').attr({
				class: 'close',
				title: 'Close [w]',
				accesskey: 'w'
			}).text('X')
				.click(function() {
					renderPortalDetails(null);
					if (isSmartphone()) { show('map') };
				}),
			$('<div>')
				.attr({
					class: 'imgpreview',
					title: imgTitle,
					style: 'background-image: url("' + img + '")'
				})
				.append(
					$('<span>', { id: 'level', title: levelDetails })
						.text(levelInt),
					$('<img>', { class: 'hide', src: img })
				),

			modDetails,
			miscDetails,
			resoDetails,
			statusDetails,
			linkDetails,
			historyDetails
		);
	var data = hasFullDetails ? getPortalSummaryData(details) : details;
	if (hasFullDetails) {
		runHooks('portalDetailsUpdated', { guid: guid, portal: portal, portalDetails: details, portalData: data });
	}
}

window.selectPortal = function(guid, event) {
	var update = selectedPortal === guid;
	var oldPortalGuid = selectedPortal;
	selectedPortal = guid;

	var oldPortal = portals[oldPortalGuid];
	var newPortal = portals[guid];
	if (!update && oldPortal) oldPortal.setSelected(false);
	if (newPortal) newPortal.setSelected(true);

	setPortalIndicators(newPortal);

	runHooks('portalSelected', { selectedPortalGuid: guid, unselectedPortalGuid: oldPortalGuid, event: event });
	return update;
}

/* portal_highlighter.js */


window.highlightPortal = function(p) {
	if (_highlighters !== null && _highlighters[_current_highlighter] !== undefined) {
		return _highlighters[_current_highlighter].highlight({ portal: p });
	}
}

/* portal_info.js */

window.getPortalHealth = function(d) {
	var max = getTotalPortalEnergy(d);
	var cur = getCurrentPortalEnergy(d);

	return max > 0 ? Math.floor(cur / max * 100) : 0;
}

/* portal_marker.js */

var portalBaseStyle = {
	stroke: true,
	opacity: 1,
	fill: true,
	fillOpacity: 0.5,
	interactive: true
};

function handler_portal_click(e) {
	window.selectPortal(e.target.options.guid, e.type);
	window.renderPortalDetails(e.target.options.guid)
}
function handler_portal_dblclick(e) {
	window.selectPortal(e.target.options.guid, e.type);
	window.renderPortalDetails(e.target.options.guid)
	window.map.setView(e.target.getLatLng(), DEFAULT_ZOOM);
}
function handler_portal_contextmenu(e) {
	window.selectPortal(e.target.options.guid, e.type);
	window.renderPortalDetails(e.target.options.guid)
	if (window.isSmartphone()) {
		window.show('info');
	} else if (!$('#scrollwrapper').is(':visible')) {
		$('#sidebartoggle').click();
	}
}

L.PortalMarker = L.CircleMarker.extend({
	options: {},

	initialize: function(latlng, data) {
		L.CircleMarker.prototype.initialize.call(this, latlng);
		this._selected = data.guid === selectedPortal;
		this.updateDetails(data);

		this.on('click', handler_portal_click);
		this.on('dblclick', handler_portal_dblclick);
		this.on('contextmenu', handler_portal_contextmenu);
	},
	willUpdate: function(details) {
		if (this._details.latE6 !== details.latE6 || this._details.lngE6 !== details.lngE6)
			return true;
		if (details.level === undefined) {
			if (this._details.timestamp < details.timestamp && this._details.team !== details.team)
				return true;
			return false;
		}
		if (this._details.timestamp < details.timestamp)
			return true;
		if (this.isPlaceholder() && this._details.team === details.team)
			return true;
		if (this._details.timestamp > details.timestamp)
			return false;
		if (details.history) {
			if (!this._details.history)
				return true;
			if (this._details.history._raw !== details.history._raw)
				return true;
		}
		if (!this._details.mods && details.mods)
			return true;

		return false;
	},
	updateDetails: function(details) {
		if (this._details) {
			if (this._details.latE6 !== details.latE6 || this._details.lngE6 !== details.lngE6)
				this.setLatLng(L.latLng(details.latE6 / 1E6, details.lngE6 / 1E6));
			if (details.level === undefined) {
				if (this._details.timestamp < details.timestamp && this._details.team !== details.team) {
					details.title = this._details.title;
					details.image = this._details.image;
					details.history = this._details.history;
					this._details = details;
				}
			} else if (this._details.timestamp == details.timestamp) {
				var localThis = this;
				["level", "health", "resCount", "image", "title", "ornaments", "mission", "mission50plus", "artifactBrief", "mods", "resonators", "owner", "artifactDetail"].forEach(function(prop) {
					if (details[prop]) localThis._details[prop] = details[prop];
				});
				if (details.history) {
					if (!this._details.history) this._details.history = details.history;
					else {
						if (this._details.history._raw & details.history._raw != this._details.history._raw)
							log.warn("new portal data has lost some history");
						this._details.history._raw |= details.history._raw;
						['visited', 'captured', 'scoutControlled'].forEach(function(prop) {
							localThis._details.history[prop] ||= details.history[prop];
						});
					}
				}
				this._details.ent = details.ent;
			} else {
				if (!details.history) details.history = this._details.history;

				this._details = details;
			}
		} else this._details = details;

		this._level = parseInt(this._details.level) || 0;
		this._team = teamStringToId(this._details.team);
		if (this._team == TEAM_NONE) this._level = 0;
		var dataOptions = {
			guid: this._details.guid,
			level: this._level,
			team: this._team,
			ent: this._details.ent,  // LEGACY - TO BE REMOVED AT SOME POINT! use .guid, .timestamp and .data instead
			timestamp: this._details.timestamp,
			data: this._details
		};
		L.setOptions(this, dataOptions);

		if (this._selected) {
			this.renderDetails();
		}

		this.setSelected();
	},
	renderDetails() {
		if (!this._rendering) {
			this._rendering = true;
			renderPortalDetails(this._details.guid);
			this._rendering = false;
		}
	},
	getDetails: function() {
		return this._details;
	},
	isPlaceholder: function() {
		return this._details.level === undefined;
	},
	hasFullDetails: function() {
		return !!this._details.mods
	},
	setStyle: function(style) { // stub for highlighters
		L.Util.setOptions(this, style);
		return this;
	},
	setMarkerStyle: function(style) {
		var styleOptions = L.Util.extend(this._style(), style);
		L.Util.setOptions(this, styleOptions);

		L.Util.setOptions(this, highlightPortal(this));

		var selected = L.extend(
			{ radius: this.options.radius },
			this._selected && { color: COLOR_SELECTED_PORTAL }
		);
		return L.CircleMarker.prototype.setStyle.call(this, selected);
	},
	setSelected: function(selected) {
		if (selected === false)
			this._selected = false;
		else
			this._selected = this._selected || selected;

		this.setMarkerStyle();

		if (this._selected && window.map.hasLayer(this))
			this.bringToFront();
	},
	_style: function() {
		var dashArray = null;
		if (this._team != TEAM_NONE && this._level == 0) dashArray = '1,2';

		return L.extend(this._scale(), portalBaseStyle, {
			color: COLORS[this._team],
			fillColor: COLORS[this._team],
			dashArray: dashArray
		});
	},
	_scale: function() {
		var scale = window.portalMarkerScale();
		var LEVEL_TO_WEIGHT = [2, 2, 2, 2, 2, 3, 3, 4, 4];
		var LEVEL_TO_RADIUS = [7, 7, 7, 7, 8, 8, 9, 10, 11];

		var level = Math.floor(this._level || 0);

		var lvlWeight = LEVEL_TO_WEIGHT[level] * Math.sqrt(scale);
		var lvlRadius = LEVEL_TO_RADIUS[level] * scale;
		if (this._team != TEAM_NONE && level == 0) {
			lvlWeight = 1;
		}

		return {
			radius: lvlRadius,
			weight: lvlWeight,
		};
	},
});

window.createMarker = function(latlng, data) {
	return new L.PortalMarker(latlng, data);
}

window.setMarkerStyle = function(marker, selected) {
	marker.setSelected(selected);
}

function setup() {}

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

