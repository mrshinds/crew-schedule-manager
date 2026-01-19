import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { airports } from '../utils/airports';

const EARTH_RADIUS = 2;

function Sphere({ position, textureUrl, size }) {
    const texture = useMemo(() => new THREE.TextureLoader().load('./earth.jpg'), []);
    return (
        <mesh position={position}>
            <sphereGeometry args={[size, 64, 64]} />
            <meshStandardMaterial map={texture} roughness={0.5} metalness={0.1} />
        </mesh>
    );
}

function RouteCurve({ start, end }) {
    const points = useMemo(() => {
        // Basic Great Circle approximation logic
        // Convert Lat/Lon to Vector3
        const toVector = (lat, lon, r) => {
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 180) * (Math.PI / 180);
            const x = -(r * Math.sin(phi) * Math.cos(theta));
            const z = (r * Math.sin(phi) * Math.sin(theta));
            const y = (r * Math.cos(phi));
            return new THREE.Vector3(x, y, z);
        };

        const vStart = toVector(start.lat, start.lon, EARTH_RADIUS);
        const vEnd = toVector(end.lat, end.lon, EARTH_RADIUS);

        // Create a curve properly
        // Simple line for now, maybe quadratic curve later for "arc" effect (altitude)
        // To make it wrap around sphere: Slerp

        const curvePoints = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const v = new THREE.Vector3().copy(vStart).lerp(vEnd, t).normalize().multiplyScalar(EARTH_RADIUS + 0.02);

            // Better Slerp needed for proper great circle but lerp+normalize+multiply is decent approximation for visual
            // Actually Vector3.slerp exists? No, only Quaternion. 
            // We can just interpolate angles? 
            // Check THREE's own interpolation/slerp.
            // Actually for simplicity in V1: Just Draw Line through earth? No.
            // Let's use simple arc (QuadraticBezier with a middle control point raised high)

            // Midpoint
            const mid = new THREE.Vector3().addVectors(vStart, vEnd).normalize().multiplyScalar(EARTH_RADIUS * 1.2);
            // This fails if they are varying distances.

            // Let's just use the lerp+normalize trick, it creates a Great Circle arc on the surface.
            // vStart.angleTo(vEnd)

            curvePoints.push(v);
        }

        return [
            new THREE.Vector3().copy(vStart),
            ...curvePoints.map(p => new THREE.Vector3(p.x, p.y, p.z)),
            new THREE.Vector3().copy(vEnd)
        ];

    }, [start, end]);

    return (
        <line>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={points.length}
                    array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
                    itemSize={3}
                />
            </bufferGeometry>
            <lineBasicMaterial color="orange" linewidth={2} />
        </line>
    );
}

function AirportMarker({ lat, lon, name }) {
    const pos = useMemo(() => {
        const r = EARTH_RADIUS;
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        const x = -(r * Math.sin(phi) * Math.cos(theta));
        const z = (r * Math.sin(phi) * Math.sin(theta));
        const y = (r * Math.cos(phi));
        return [x, y, z];
    }, [lat, lon]);

    return (
        <mesh position={pos}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color="red" />
        </mesh>
    );
}

const FlightTracker = ({ selectedFlight }) => {
    // Extract Start/End from route (ICN-JFK)
    let startAirport = null;
    let endAirport = null;

    if (selectedFlight && selectedFlight.route) {
        const parts = selectedFlight.route.split('-');
        if (parts.length === 2) {
            startAirport = airports[parts[0]];
            endAirport = airports[parts[1]];
        }
    }

    // Fallback default view (ICN) if nothing selected
    if (!startAirport) startAirport = airports["ICN"];

    return (
        <div style={{ width: '100%', height: '100%', background: 'black', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
            {!selectedFlight && <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', zIndex: 10 }}>Select a flight to view route</div>}
            {selectedFlight && <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '4px' }}>
                <h3>{selectedFlight.flightNumber}</h3>
                <div>{selectedFlight.route}</div>
                <div>{selectedFlight.time}</div>
            </div>}

            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <ambientLight intensity={1} />
                <pointLight position={[10, 10, 10]} intensity={2} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                <Sphere position={[0, 0, 0]} textureUrl="/earth.jpg" size={EARTH_RADIUS} />

                {startAirport && <AirportMarker {...startAirport} />}
                {endAirport && <AirportMarker {...endAirport} />}
                {startAirport && endAirport && <RouteCurve start={startAirport} end={endAirport} />}

                <OrbitControls enablePan={false} minDistance={2.5} maxDistance={10} autoRotate autoRotateSpeed={0.5} />
            </Canvas>
        </div>
    );
};

export default FlightTracker;
