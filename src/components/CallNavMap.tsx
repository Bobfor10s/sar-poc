"use client";

import { useEffect, useRef, useState } from "react";

type NavEvent = {
  id: string;
  title: string | null;
  incident_lat: number | null;
  incident_lng: number | null;
  incident_radius_m: number | null;
};

interface CallNavMapProps {
  ev: NavEvent;
  onClose: () => void;
  onImHere: () => void;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CallNavMap({ ev, onClose, onImHere }: CallNavMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const memberMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const [distMi, setDistMi] = useState<number | null>(null);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!mapDivRef.current || mapRef.current) return;

      // Fix default marker icons broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapDivRef.current!, { zoomControl: true }).setView(
        [ev.incident_lat!, ev.incident_lng!],
        14
      );
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
        maxZoom: 19,
      }).addTo(map);

      // Red scene pin
      const sceneIcon = L.divIcon({
        html: '<div style="width:18px;height:18px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        className: "",
      });
      L.marker([ev.incident_lat!, ev.incident_lng!], { icon: sceneIcon })
        .addTo(map)
        .bindPopup(`<strong>${ev.title ?? "Scene"}</strong>`);

      // Amber geofence circle
      if (ev.incident_radius_m) {
        L.circle([ev.incident_lat!, ev.incident_lng!], {
          radius: ev.incident_radius_m,
          color: "#f59e0b",
          fillColor: "#fef9c3",
          fillOpacity: 0.25,
          dashArray: "6 4",
          weight: 2,
        }).addTo(map);
      }

      // Blue member dot icon
      const memberIcon = L.divIcon({
        html: '<div style="width:14px;height:14px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: "",
      });

      // GPS watch — update blue dot and distance
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;

            if (!memberMarkerRef.current) {
              memberMarkerRef.current = L.marker([lat, lng], { icon: memberIcon }).addTo(map);
              // Fit map to show both member and scene
              map.fitBounds(
                L.latLngBounds([[lat, lng], [ev.incident_lat!, ev.incident_lng!]]),
                { padding: [40, 40] }
              );
            } else {
              memberMarkerRef.current.setLatLng([lat, lng]);
            }

            // Update distance display
            const dist = haversineMeters(lat, lng, ev.incident_lat!, ev.incident_lng!);
            setDistMi(dist / 1609.34);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
        watchIdRef.current = watchId;
      }
    });

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        memberMarkerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appleMapsUrl = `maps://?daddr=${ev.incident_lat},${ev.incident_lng}`;
  const googleMapsUrl = `comgooglemaps://?daddr=${ev.incident_lat},${ev.incident_lng}&directionsmode=driving`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "#fff" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#1e3a8a", color: "#fff", flexShrink: 0 }}>
        <div>
          <strong style={{ fontSize: 15 }}>{ev.title ?? "Scene"}</strong>
          {distMi !== null && (
            <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.85 }}>
              {distMi < 0.1
                ? `${Math.round(distMi * 5280)} ft away`
                : `${distMi.toFixed(1)} mi away`}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
        >
          ✕
        </button>
      </div>

      {/* Map */}
      <div ref={mapDivRef} style={{ flex: 1 }} />

      {/* Bottom bar */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "#fff", borderTop: "1px solid #e5e5e5", flexShrink: 0 }}>
        <a
          href={appleMapsUrl}
          style={{ flex: 1, padding: "11px 10px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d", fontWeight: 600, fontSize: 12, textAlign: "center", textDecoration: "none" }}
        >
          Apple Maps
        </a>
        <a
          href={googleMapsUrl}
          style={{ flex: 1, padding: "11px 10px", borderRadius: 8, background: "#eff6ff", border: "1px solid #3b82f6", color: "#1e40af", fontWeight: 600, fontSize: 12, textAlign: "center", textDecoration: "none" }}
        >
          Google Maps
        </a>
        <button
          onClick={onImHere}
          style={{ flex: 1, padding: "11px 10px", borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac", color: "#15803d", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
        >
          I'm Here
        </button>
      </div>
    </div>
  );
}
