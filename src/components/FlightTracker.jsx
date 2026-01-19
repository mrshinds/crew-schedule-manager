import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { airports } from '../utils/airports';

// Fix for default marker icon in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to auto-zoom to fit the route
function MapUpdater({ start, end }) {
    const map = useMap();
    useMemo(() => {
        if (start && end) {
            const bounds = L.latLngBounds([start.lat, start.lon], [end.lat, end.lon]);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [start, end, map]);
    return null;
}

const FlightTracker = ({ selectedFlight }) => {
    let startAirport = null;
    let endAirport = null;
    let polylinePositions = [];

    if (selectedFlight && selectedFlight.route) {
        const parts = selectedFlight.route.split('-');
        if (parts.length === 2) {
            startAirport = airports[parts[0]];
            endAirport = airports[parts[1]];
        }
    }

    if (startAirport && endAirport) {
        polylinePositions = [
            [startAirport.lat, startAirport.lon],
            [endAirport.lat, endAirport.lon]
        ];
    } else if (selectedFlight && selectedFlight.route) {
        // Debug missing airports
        const parts = selectedFlight.route.split('-');
        if (parts.length === 2) {
            if (!airports[parts[0]]) alert(`Airport Code Not Found in Database: ${parts[0]}`);
            if (!airports[parts[1]]) alert(`Airport Code Not Found in Database: ${parts[1]}`);
        }
        startAirport = airports["ICN"]; // Fallback to avoid crash
    } else {
        // Default to ICN view if nothing selected
        startAirport = airports["ICN"];
    }

    return (
        <div style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', position: 'relative', background: '#e0e0e0' }}>
            {!selectedFlight && (
                <div style={{
                    position: 'absolute', top: 20, left: 60, right: 60, zIndex: 999,
                    background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '4px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                    <strong>Select a flight</strong> to view route on map.
                </div>
            )}

            <MapContainer
                center={[37.5, 127]}
                zoom={3}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {startAirport && (
                    <Marker position={[startAirport.lat, startAirport.lon]}>
                        <Popup>{startAirport.name}</Popup>
                    </Marker>
                )}

                {endAirport && (
                    <Marker position={[endAirport.lat, endAirport.lon]}>
                        <Popup>{endAirport.name}</Popup>
                    </Marker>
                )}

                {polylinePositions.length > 0 && (
                    <>
                        <Polyline positions={polylinePositions} color="blue" weight={4} opacity={0.7} />
                        <MapUpdater start={startAirport} end={endAirport} />
                    </>
                )}
            </MapContainer>
        </div>
    );
};

export default FlightTracker;
