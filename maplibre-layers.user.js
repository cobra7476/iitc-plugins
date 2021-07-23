// ==UserScript==
// @author         jaiperdu
// @name           IITC plugin: MapLibre GL Layers
// @category       Map Tiles
// @version        0.1.0
// @description    GL layers
// @id             maplibre-layers
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://le-jeu.github.io/iitc-plugins/maplibre-layers.user.js
// @downloadURL    https://le-jeu.github.io/iitc-plugins/maplibre-layers.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'lejeu';
plugin_info.dateTimeVersion = '2021-07-23-162843';
plugin_info.pluginId = 'maplibre-layers';
//END PLUGIN AUTHORS NOTE

function addExternalScript(url) {
  var script = document.createElement("script");
  script.src = url;
  script.async = false;
  return document.head.appendChild(script);
}
function addExternalCSS(url) {
  var script = document.createElement("link");
  script.href = url;
  script.rel = "stylesheet";
  return document.head.appendChild(script);
}

var ingressStyle = {
  version: 8,
  name: "GL layers",
  sources: {
    "fields": {
      type: "geojson",
      data: { "type": "FeatureCollection", "features": [] },
    },
    "links": {
      type: "geojson",
      data: { "type": "FeatureCollection", "features": [] },
    },
    "portals": {
      type: "geojson",
      data: { "type": "FeatureCollection", "features": [] },
    },
  },
  layers: [
    {
      id: "fields",
      source: "fields",
      type: "fill",
      paint: {
        "fill-color": [
          'match',
          ['get', 'team'],
          'R', COLORS[1],
          'E', COLORS[2],
          COLORS[0]
        ],
        "fill-opacity": .4,
        "fill-antialias": false,
      }
    },
    {
      id: "links",
      source: "links",
      type: "line",
      paint: {
        "line-width": 2,
        "line-color": [
          'match',
          ['get', 'team'],
          'R', COLORS[1],
          'E', COLORS[2],
          COLORS[0]
        ],
      }
    },
    {
      id: "portals",
      source: "portals",
      type: "circle",
      paint: {
        "circle-color": [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          COLOR_SELECTED_PORTAL,
          ['match',
            ['get', 'team'],
            'R', COLORS[1],
            'E', COLORS[2],
            COLORS[0]
          ]
        ],
        "circle-stroke-color":  [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          COLOR_SELECTED_PORTAL,
          ['match',
            ['get', 'team'],
            'R', COLORS[1],
            'E', COLORS[2],
            COLORS[0]
          ]
        ],
        'circle-stroke-width': [
          'interpolate' , ["linear"], ["get", "level"],
          0, 2,
          8, 3,
        ],
        "circle-opacity": .5,
        'circle-radius': [
          'let', 'radius', [
            'interpolate' , ["linear"], ["get", "level"],
            0, 5,
            8, 8,
          ],
          ['interpolate',
            ["linear"], ["zoom"],
            7, ['*', .5, ['var', 'radius']],
            16, ['*', 1, ['var', 'radius']],
          ]
        ],
      }
    },
  ]
};

function guidToID(guid) {
  return parseInt(guid.slice(0,8),16);
}

function mapInit() {
  try {
    // *** included: external/leaflet-maplibre-gl.js ***
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['leaflet', 'maplibre-gl'], factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory(require('leaflet'), require('maplibre-gl'));
    } else {
        // Browser globals (root is window)
        root.returnExports = factory(window.L, window.maplibregl);
    }
}(this, function (L, maplibregl) {
    L.MaplibreGL = L.Layer.extend({
            options: {
            updateInterval: 32,
            // How much to extend the overlay view (relative to map size)
            // e.g. 0.1 would be 10% of map view in each direction
            padding: 0.1,
            // whether or not to register the mouse and keyboard
            // events on the maplibre overlay
            interactive: false,
            // set the tilepane as the default pane to draw gl tiles
            pane: 'tilePane'
        },

        initialize: function (options) {
            L.setOptions(this, options);

            // setup throttling the update event when panning
            this._throttledUpdate = L.Util.throttle(this._update, this.options.updateInterval, this);
        },

        onAdd: function (map) {
            if (!this._container) {
                this._initContainer();
            }

            var paneName = this.getPaneName();
            map.getPane(paneName).appendChild(this._container);
            
            this._initGL();

            this._offset = this._map.containerPointToLayerPoint([0, 0]);

            // work around https://github.com/mapbox/mapbox-gl-leaflet/issues/47
            if (map.options.zoomAnimation) {
                L.DomEvent.on(map._proxy, L.DomUtil.TRANSITION_END, this._transitionEnd, this);
            }
        },

        onRemove: function (map) {
            if (this._map._proxy && this._map.options.zoomAnimation) {
                L.DomEvent.off(this._map._proxy, L.DomUtil.TRANSITION_END, this._transitionEnd, this);
            }
            var paneName = this.getPaneName();
            map.getPane(paneName).removeChild(this._container);
            
            this._glMap.remove();
            this._glMap = null;
        },

        getEvents: function () {
            return {
                move: this._throttledUpdate, // sensibly throttle updating while panning
                zoomanim: this._animateZoom, // applys the zoom animation to the <canvas>
                zoom: this._pinchZoom, // animate every zoom event for smoother pinch-zooming
                zoomstart: this._zoomStart, // flag starting a zoom to disable panning
                zoomend: this._zoomEnd,
                resize: this._resize
            };
        },

        getMaplibreMap: function () {
            return this._glMap;
        },

        getCanvas: function () {
            return this._glMap.getCanvas();
        },

        getSize: function () {
            return this._map.getSize().multiplyBy(1 + this.options.padding * 2);
        },

        getBounds: function () {
            var halfSize = this.getSize().multiplyBy(0.5);
            var center = this._map.latLngToContainerPoint(this._map.getCenter());
            return L.latLngBounds(
                this._map.containerPointToLatLng(center.subtract(halfSize)),
                this._map.containerPointToLatLng(center.add(halfSize))
            );
        },

        getContainer: function () {
            return this._container;
        },
        
        // returns the pane name set in options if it is a valid pane, defaults to tilePane
        getPaneName: function () {
            return this._map.getPane(this.options.pane) ? this.options.pane : 'tilePane'; 
        },
        
        _initContainer: function () {
            var container = this._container = L.DomUtil.create('div', 'leaflet-gl-layer');

            var size = this.getSize();
            var offset = this._map.getSize().multiplyBy(this.options.padding);
            container.style.width  = size.x + 'px';
            container.style.height = size.y + 'px';

            var topLeft = this._map.containerPointToLayerPoint([0, 0]).subtract(offset);

            L.DomUtil.setPosition(container, topLeft);
        },

        _initGL: function () {
            var center = this._map.getCenter();

            var options = L.extend({}, this.options, {
                container: this._container,
                center: [center.lng, center.lat],
                zoom: this._map.getZoom() - 1,
                attributionControl: false
            });

            this._glMap = new maplibregl.Map(options);

            // allow GL base map to pan beyond min/max latitudes
            this._glMap.transform.latRange = null;
            this._transformGL(this._glMap);

            if (this._glMap._canvas.canvas) {
                // older versions of mapbox-gl surfaced the canvas differently
                this._glMap._actualCanvas = this._glMap._canvas.canvas;
            } else {
                this._glMap._actualCanvas = this._glMap._canvas;
            }

            // treat child <canvas> element like L.ImageOverlay
            var canvas = this._glMap._actualCanvas;
            L.DomUtil.addClass(canvas, 'leaflet-image-layer');
            L.DomUtil.addClass(canvas, 'leaflet-zoom-animated');
            if (this.options.interactive) {
                L.DomUtil.addClass(canvas, 'leaflet-interactive');
            }
            if (this.options.className) {
                L.DomUtil.addClass(canvas, this.options.className);
            }
        },

        _update: function (e) {
            // update the offset so we can correct for it later when we zoom
            this._offset = this._map.containerPointToLayerPoint([0, 0]);

            if (this._zooming) {
                return;
            }

            var size = this.getSize(),
                container = this._container,
                gl = this._glMap,
                offset = this._map.getSize().multiplyBy(this.options.padding),
                topLeft = this._map.containerPointToLayerPoint([0, 0]).subtract(offset);

            L.DomUtil.setPosition(container, topLeft);

            this._transformGL(gl);

            if (gl.transform.width !== size.x || gl.transform.height !== size.y) {
                container.style.width  = size.x + 'px';
                container.style.height = size.y + 'px';
                if (gl._resize !== null && gl._resize !== undefined){
                    gl._resize();
                } else {
                    gl.resize();
                }
            } else {
                // older versions of mapbox-gl surfaced update publicly
                if (gl._update !== null && gl._update !== undefined){
                    gl._update();
                } else {
                    gl.update();
                }
            }
        },

        _transformGL: function (gl) {
            var center = this._map.getCenter();

            // gl.setView([center.lat, center.lng], this._map.getZoom() - 1, 0);
            // calling setView directly causes sync issues because it uses requestAnimFrame

            var tr = gl.transform;
            tr.center = maplibregl.LngLat.convert([center.lng, center.lat]);
            tr.zoom = this._map.getZoom() - 1;
        },

        // update the map constantly during a pinch zoom
        _pinchZoom: function (e) {
            this._glMap.jumpTo({
                zoom: this._map.getZoom() - 1,
                center: this._map.getCenter()
            });
        },

        // borrowed from L.ImageOverlay
        // https://github.com/Leaflet/Leaflet/blob/master/src/layer/ImageOverlay.js#L139-L144
        _animateZoom: function (e) {
            var scale = this._map.getZoomScale(e.zoom);
            var padding = this._map.getSize().multiplyBy(this.options.padding * scale);
            var viewHalf = this.getSize()._divideBy(2);
            // corrections for padding (scaled), adapted from
            // https://github.com/Leaflet/Leaflet/blob/master/src/map/Map.js#L1490-L1508
            var topLeft = this._map.project(e.center, e.zoom)
                ._subtract(viewHalf)
                ._add(this._map._getMapPanePos()
                .add(padding))._round();
            var offset = this._map.project(this._map.getBounds().getNorthWest(), e.zoom)
                ._subtract(topLeft);

            L.DomUtil.setTransform(
                this._glMap._actualCanvas,
                offset.subtract(this._offset),
                scale
            );
        },

        _zoomStart: function (e) {
            this._zooming = true;
        },

        _zoomEnd: function () {
            var scale = this._map.getZoomScale(this._map.getZoom());

            L.DomUtil.setTransform(
                this._glMap._actualCanvas,
                // https://github.com/mapbox/mapbox-gl-leaflet/pull/130
                null,
                scale
            );

            this._zooming = false;

            this._update();
        },

        _transitionEnd: function (e) {
            L.Util.requestAnimFrame(function () {
                var zoom = this._map.getZoom();
                var center = this._map.getCenter();
                var offset = this._map.latLngToContainerPoint(
                    this._map.getBounds().getNorthWest()
                );

                // reset the scale and offset
                L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1);

                // enable panning once the gl map is ready again
                this._glMap.once('moveend', L.Util.bind(function () {
                    this._zoomEnd();
                }, this));

                // update the map position
                this._glMap.jumpTo({
                    center: center,
                    zoom: zoom - 1
                });
            }, this);
        },

        _resize: function (e) {
            this._transitionEnd(e);
        }
    });

    L.maplibreGL = function (options) {
        return new L.MaplibreGL(options);
    };

}));

;
  } catch (e) {
    console.error(e);
    return;
  }


  $('<style>').prop('type', 'text/css').html('.leaflet-overlay-pane .leaflet-gl-layer { z-index: 101; }').appendTo('head');

  var sources = {
    fields: new Map(),
    links: new Map(),
    portals: new Map(),
  };

  var layer = L.maplibreGL({
    pane: 'overlayPane',
    interactive: true,
    style: ingressStyle
  });

  function onMapDataRefreshEnd() {
    for (var name of ['fields', 'links', 'portals']) {
      refreshSource(name);
    }
  }

  function refreshSource(name) {
    if (!layer.getMaplibreMap()) return;
    var source = layer.getMaplibreMap().getSource(name);
    if (!source) return;
    sources[name] = new Map();
    for (var guid in window[name]) {
      var entity = window[name][guid];
      var geojson = entity.toGeoJSON();
      geojson.id = guidToID(guid);
      geojson.properties.type = name;
      geojson.properties.guid = guid;
      geojson.properties.team = entity.options.data.team;
      geojson.properties.level = entity.options.data.level;
      sources[name].set(guid, geojson);
    }
    source.setData({ "type": "FeatureCollection", "features": Array.from(sources[name].values()) });
  }

  function onPortalSelected(d) {
    var prev = d.unselectedPortalGuid;
    var next = d.selectedPortalGuid;
    var map = layer.getMaplibreMap();
    if (!map) return;
    if (prev) map.setFeatureState({ id: guidToID(prev), source: 'portals' }, { selected: false });
    if (next) map.setFeatureState({ id: guidToID(next), source: 'portals' }, { selected: true });
  }

  function onPortalClick (e) {
    console.log('click');
    var portal = e.features[0];
    window.renderPortalDetails(portal.properties.guid);
  }

  var step = 0;
  let dashArraySeq = [
      [0, 4, 3],
      [1, 4, 2],
      [2, 4, 1],
      [3, 4, 0],
      [0, 1, 3, 3],
      [0, 2, 3, 2],
      [0, 3, 3, 1]
  ];
  var animation;
  function lineAnimate() {
    step = (step + 1) % dashArraySeq.length;
    if (!layer.getMaplibreMap()) return;
    layer.getMaplibreMap().setPaintProperty("links", 'line-dasharray', dashArraySeq[step]);
    setTimeout(() => {
      animation = requestAnimationFrame(lineAnimate);
    }, 50);
  }

  function onLayerInit(e) {
    if (e.layer === layer) {
      window.map.off('layeradd', onLayerInit);
      console.log('on portal click');
      var map = layer.getMaplibreMap();
      map.on('click', 'portals', onPortalClick);
      layer.getCanvas().style.cursor = "default";
      map.on('mouseenter', 'portals', () => {
        layer.getCanvas().style.cursor = "pointer";
      });
      map.on('mouseleave', 'portals', () => {
        layer.getCanvas().style.cursor = "default";
      });
      map.scrollZoom.disable();
    }
  }

  function onLayerAdd(e) {
    if (e.layer !== layer) return;
    onMapDataRefreshEnd();
    requestAnimationFrame(lineAnimate);
  }
  function onLayerRemove(e) {
    if (e.layer !== layer) return;
    cancelAnimationFrame(animation);
  }

  var oldprocessGameEntities = window.Render.prototype.processGameEntities;
  window.Render.prototype.processGameEntities = function(entities, details) {
    oldprocessGameEntities.call(this, entities, details);
    for (var name of ['fields', 'links', 'portals']) {
      var data = [];
      for (var ent of entities) {
        var guid = ent[0];
        if (!(guid in window[name])) continue;
        var entity = window[name][guid];
        var geojson = entity.toGeoJSON();
        geojson.id = guidToID(guid);
        geojson.properties.type = name;
        geojson.properties.guid = guid;
        geojson.properties.team = entity.options.data.team;
        geojson.properties.level = entity.options.data.level;
        sources[name].set(guid, geojson);
      }
      if (!layer.getMaplibreMap()) continue;
      var source = layer.getMaplibreMap().getSource(name);
      source.setData({ "type": "FeatureCollection", "features": Array.from(sources[name].values()) });
    }
  }
  window.map.on('layeradd', onLayerInit);
  window.map.on('layeradd', onLayerAdd);
  window.map.on('layerremove', onLayerRemove);

  //window.overlayStatus['GL Layers'] = false;
  window.addLayerGroup('GL Layers', layer, false);
  window.addHook('mapDataRefreshEnd', onMapDataRefreshEnd);
  window.addHook('portalDetailsUpdated', () => refreshSource('portals'));
  window.addHook('portalSelected', onPortalSelected);

  window.mapLibreLayers.layer = layer;
}

function setup() {
  addExternalCSS("https://unpkg.com/maplibre-gl@1.14.0-rc.1/dist/maplibre-gl.css");
  addExternalScript("https://unpkg.com/maplibre-gl@1.14.0-rc.1/dist/maplibre-gl.js").onload = mapInit;

  window.mapLibreLayers = {};
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

