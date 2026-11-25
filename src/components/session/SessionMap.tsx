import { useEffect, useMemo } from 'react';
import { AttributionControl, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SessionView } from '../../lib/types';

function pinIcon(s: SessionView, active: boolean) {
  const full = s.missing <= 0 || s.status !== 'open';
  return L.divIcon({
    className: 'fj-pin-wrap',
    html: `<div class="fj-pin${full ? ' is-full' : ''}${active ? ' is-active' : ''}"><span>${full ? '✓' : s.missing}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
}
const meIcon = L.divIcon({ className: 'fj-pin-wrap', html: '<div class="fj-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function SessionMap({
  sessions,
  selectedId,
  onSelect,
  me,
  interactive = true,
  className,
}: {
  sessions: SessionView[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
  interactive?: boolean;
  className?: string;
}) {
  const points = useMemo<[number, number][]>(() => sessions.map((s) => [s.lat, s.lng]), [sessions]);
  const center: [number, number] = points[0] ?? (me ? [me.lat, me.lng] : [44.7569, 19.2144]);
  return (
    <MapContainer
      center={center}
      zoom={14}
      className={className}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      attributionControl={false}
      maxZoom={16}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap"
        maxZoom={16}
      />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <AttributionControl position="bottomright" prefix={false} />
      <FitBounds points={points} />
      {me && interactive && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}
      {sessions.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={pinIcon(s, s.id === selectedId)}
          title={`${s.venueName}`}
          alt={`${s.venueName}`}
          eventHandlers={onSelect ? { click: () => onSelect(s.id) } : undefined}
          zIndexOffset={s.id === selectedId ? 1000 : 0}
        />
      ))}
    </MapContainer>
  );
}
