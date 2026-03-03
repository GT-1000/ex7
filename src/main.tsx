import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";

import "ol/ol.css";
import { Map, View } from "ol";
import { useGeographic } from "ol/proj.js";

import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import { OSM } from "ol/source.js";
import VectorSource from "ol/source/Vector.js";
import GeoJSON from "ol/format/GeoJSON.js";

import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";

import Style from "ol/style/Style.js";
import Stroke from "ol/style/Stroke.js";
import Fill from "ol/style/Fill.js";
import CircleStyle from "ol/style/Circle.js";

useGeographic(); // View i grader (lon/lat)

// Definer EPSG:25833 (UTM33) for skolene fra PostGIS
proj4.defs(
  "EPSG:25833",
  "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
);
register(proj4);

// GeoJSON-laget ditt (kan være kommuner eller world – spiller ingen rolle)
const grenseLayer = new VectorLayer({
  source: new VectorSource({
    url: "/geojson/kommuner.geojson",
    format: new GeoJSON(),
  }),
  style: new Style({
    stroke: new Stroke({ color: "rgba(120, 60, 160, 0.9)", width: 1 }),
    fill: new Fill({ color: "rgba(120, 60, 160, 0.03)" }),
  }),
});

// Skolepunkter fra API (dataProjection = EPSG:25833)
const skoleSource = new VectorSource({
  url: "/api/grunnskoler",
  format: new GeoJSON({ dataProjection: "EPSG:25833" }),
});

const grunnskoleLayer = new VectorLayer({
  source: skoleSource,
  style: new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: "rgba(0,0,0,0.65)" }),
      stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: 1 }),
    }),
  }),
});

const map = new Map({
  layers: [new TileLayer({ source: new OSM() }), grenseLayer, grunnskoleLayer],
  view: new View({
    center: [10.75, 59.91], // Oslo
    zoom: 6,
  }),
});

function Application() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    map.setTarget(mapRef.current);

    // Zoom til skolene når de er lastet
    const onChange = () => {
      if (skoleSource.getState() === "ready") {
        map.getView().fit(skoleSource.getExtent(), { padding: [30, 30, 30, 30] });
        skoleSource.un("change", onChange);
      }
    };
    skoleSource.on("change", onChange);

    return () => map.setTarget(undefined);
  }, []);

  return <div ref={mapRef} style={{ width: "100vw", height: "100vh" }} />;
}

createRoot(document.getElementById("app")!).render(<Application />);