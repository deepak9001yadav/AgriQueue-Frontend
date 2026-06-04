import { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { RiFocusMode } from "react-icons/ri";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useApp } from '../context/AppContext';
import { t } from '../utils/translations';
import Swal from 'sweetalert2';
import * as turf from '@turf/turf';
import { getAuth } from 'firebase/auth';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Fix for leaflet-draw readableArea error
if (L.GeometryUtil && L.GeometryUtil.readableArea) {
    const originalReadableArea = L.GeometryUtil.readableArea;
    L.GeometryUtil.readableArea = function (area, isMetric, precision) {
        if (typeof precision === 'undefined') {
            precision = 2;
        }
        if (typeof isMetric === 'undefined') {
            isMetric = true;
        }
        return originalReadableArea.call(this, area, isMetric, precision);
    };
}

function MapComponent({ onAOICreated, onLocationSelect, fieldId }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const drawnItemsRef = useRef(null);
    const currentLayerRef = useRef(null);
    const overlayLayersRef = useRef({}); // Store overlay layers by ID
    const currentSearchMarkerRef = useRef(null);
    const polygonDrawerRef = useRef(null);
    const rectangleDrawerRef = useRef(null);
    const editorRef = useRef(null);
    const iotMarkerRef = useRef(null);
    const iotCoordsRef = useRef(null); // Track active IoT station coordinates
    const droneOverlayRef = useRef(null);

    const [activeDrawTool, setActiveDrawTool] = useState(null);
    const { drawnAOI, setDrawnAOI, currentLayer, setCurrentLayer, opacity, isLoading, activeModule, droneLayer, activeMapTab } = useApp();

    // Initialize map
    useEffect(() => {
        if (mapInstanceRef.current) return;

        // Base layers
        const baseMaps = {
            Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 25,
                maxNativeZoom: 18,
                attribution: '&copy; Esri'
            }),
            Street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 23,
                attribution: '&copy; OpenStreetMap contributors'
            }),
            Topographic: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 23,
                attribution: '&copy; OpenTopoMap contributors'
            }),
            Hybrid: L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 23,
                maxNativeZoom: 19,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }),
        };

        // Initialize map
        const map = L.map(mapRef.current, {
            center: [26.51, 80.23],
            minZoom: 1,
            maxZoom: 23,
            maxNativeZoom: 18,
            zoom: 11,
            layers: [baseMaps.Hybrid],
            attributionControl: false,
            zoomControl: false, // Disable default zoom control (+/- buttons)
        });

        mapInstanceRef.current = map;

        // Add layer control
        L.control.layers(baseMaps, {}, { position: 'topright' }).addTo(map);

        // Scale control hidden as requested by user
        /*
        L.control.scale({
            position: 'topleft',
            metric: true,
            imperial: false,
            maxWidth: 150
        }).addTo(map);
        */

        // Initialize drawn items layer
        const drawnItems = new L.FeatureGroup().addTo(map);
        drawnItemsRef.current = drawnItems;

        // Initialize drawing tools with white borders and no fill
        polygonDrawerRef.current = new L.Draw.Polygon(map, {
            shapeOptions: {
                color: '#ffffff',
                weight: 3,
                fillOpacity: 0,
                opacity: 1
            },
            showArea: false,
            metric: true,
        });

        rectangleDrawerRef.current = new L.Draw.Rectangle(map, {
            shapeOptions: {
                color: '#ffffff',
                weight: 3,
                fillOpacity: 0,
                opacity: 1
            },
            showArea: false,
            metric: true,
        });

        editorRef.current = new L.EditToolbar.Edit(map, {
            featureGroup: drawnItems,
            selectedPathOptions: { maintainColor: true }
        });

        // Handle draw created event
        map.on(L.Draw.Event.CREATED, (e) => {
            drawnItems.clearLayers();
            const layer = e.layer;
            drawnItems.addLayer(layer);

            // Convert to GeoJSON format that backend expects
            const geojson = layer.toGeoJSON();
            console.log('Drawn GeoJSON:', geojson);

            setDrawnAOI(geojson);
            if (onAOICreated) {
                onAOICreated(geojson);
            }
            setActiveDrawTool(null);

            // Disable drawing mode after shape is created
            polygonDrawerRef.current?.disable();
            rectangleDrawerRef.current?.disable();
        });

        // Handle draw stop
        map.on('draw:editstop', () => {
            editorRef.current?.disable();
        });

        // Handle tile errors
        map.on('tileerror', (e) => {
            console.warn('Tile loading error:', e);
        });

        // Add ResizeObserver to handle container size changes
        const resizeObserver = new ResizeObserver(() => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
            }
        });

        if (mapRef.current) {
            resizeObserver.observe(mapRef.current);
        }

        return () => {
            resizeObserver.disconnect();
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [setDrawnAOI, onAOICreated]);

    // Handle opacity changes
    useEffect(() => {
        if (currentLayerRef.current) {
            currentLayerRef.current.setOpacity(opacity / 100);
        }
    }, [opacity]);

    // Render/Manage Drone Layer imageOverlay
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // If active tab is drone and a drone layer exists
        if (activeMapTab === 'drone' && droneLayer && droneLayer.imageUrl) {
            // Remove existing overlay if bounds/URL changed
            if (droneOverlayRef.current) {
                map.removeLayer(droneOverlayRef.current);
                droneOverlayRef.current = null;
            }

            // flat bounds [minLat, minLon, maxLat, maxLon] -> Leaflet nested [[minLat, minLon], [maxLat, maxLon]]
            const leafletBounds = [
                [droneLayer.bounds[0], droneLayer.bounds[1]],
                [droneLayer.bounds[2], droneLayer.bounds[3]]
            ];

            const overlay = L.imageOverlay(droneLayer.imageUrl, leafletBounds, {
                opacity: opacity / 100,
                zIndex: 1050,
                crossOrigin: true
            });

            overlay.addTo(map);
            droneOverlayRef.current = overlay;
        } else {
            // Remove drone overlay if activeTab is not 'drone' or droneLayer is cleared
            if (droneOverlayRef.current) {
                map.removeLayer(droneOverlayRef.current);
                droneOverlayRef.current = null;
            }
        }
    }, [activeMapTab, droneLayer, opacity]);

    // Sync drawnAOI from context to map
    useEffect(() => {
        // If the active module is IoT telemetry, do NOT show the AOI outline polygon
        // or focus bounds. Keep the map blank/satellite focused until coordinates are loaded!
        if (activeModule === 'iot') {
            if (drawnItemsRef.current) {
                drawnItemsRef.current.clearLayers();
            }
            if (currentLayerRef.current) {
                mapInstanceRef.current.removeLayer(currentLayerRef.current);
                currentLayerRef.current = null;
                setCurrentLayer(null);
            }
            return;
        }

        if (drawnAOI && mapInstanceRef.current && drawnItemsRef.current) {
            // Check if map is empty (or we want to overwrite), if so, load the AOI
            // Ideally we only load if it's NOT already drawn. 
            // Comparing deep object is hard, but we can check if layer count is 0

            if (drawnItemsRef.current.getLayers().length === 0) {
                try {
                    const layer = L.geoJSON(drawnAOI, {
                        style: {
                            color: '#ffffff',
                            weight: 3,
                            fillOpacity: 0,
                            opacity: 1
                        }
                    }).getLayers()[0];

                    if (layer) {
                        drawnItemsRef.current.addLayer(layer);
                        if (layer.getBounds) {
                            mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [50, 50] });
                        }
                    }
                } catch (e) {
                    console.error("Error rendering AOI:", e);
                }
            }
        }
    }, [drawnAOI, activeModule]);

    // Center map on location
    const centerOnLocation = useCallback((lat, lon, name) => {
        const map = mapInstanceRef.current;
        if (!map) return;

        map.setView([lat, lon], 11);

        // Remove previous marker
        if (currentSearchMarkerRef.current) {
            map.removeLayer(currentSearchMarkerRef.current);
        }

        const customIcon = L.divIcon({
            className: 'custom-gps-marker',
            html: `
                <div class="marker-pin-wrapper">
                    <div class="marker-pulse"></div>
                    <div class="marker-pin">
                        <i class="fas fa-leaf"></i>
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });

        // Add new marker
        currentSearchMarkerRef.current = L.marker([lat, lon], { icon: customIcon })
            .addTo(map)
            .bindPopup(`
        <div style="text-align:center;">
          <strong>${name.split(',')[0]}</strong><br>
          <small>${name}</small>
        </div>
      `)
            .openPopup();
    }, []);

    // Show custom pulsing broadcast tower marker for active IoT Station
    const showIoTMarker = useCallback((lat, lon, stationName, details = {}) => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (!lat || !lon) return;

        // Remove existing IoT marker first
        if (iotMarkerRef.current) {
            map.removeLayer(iotMarkerRef.current);
        }

        const numericLat = parseFloat(lat);
        const numericLon = parseFloat(lon);

        if (isNaN(numericLat) || isNaN(numericLon)) return;

        // Custom premium green pulse broadcast tower icon
        const iotIcon = L.divIcon({
            className: 'custom-iot-marker',
            html: `
                <div class="iot-marker-wrapper">
                    <div class="iot-marker-pulse"></div>
                    <div class="iot-marker-pin">
                        <i class="fa-solid fa-tower-broadcast"></i>
                    </div>
                </div>
            `,
            iconSize: [42, 42],
            iconAnchor: [21, 42],
            popupAnchor: [0, -42]
        });

        // Add to map and bind popup
        iotMarkerRef.current = L.marker([numericLat, numericLon], { icon: iotIcon })
            .addTo(map)
            .bindPopup(`
                <div style="font-family: 'Poppins', sans-serif; padding: 4px; min-width: 180px;">
                    <div style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                        <i class="fa-solid fa-tower-broadcast" style="color: #22c55e;"></i>
                        <strong style="font-size: 12px; color: #1e293b;">${stationName}</strong>
                    </div>
                    <div style="font-size: 11px; color: #64748b; display: flex; flex-direction: column; gap: 4px;">
                        <div><strong>Channel ID:</strong> ${details.channelId || 'N/A'}</div>
                        <div><strong>Coords:</strong> ${numericLat.toFixed(5)}, ${numericLon.toFixed(5)}</div>
                        ${details.soilMoisture !== undefined && details.soilMoisture !== null ? `<div><strong>Soil Moisture:</strong> ${details.soilMoisture}%</div>` : ''}
                        ${details.temp !== undefined && details.temp !== null ? `<div><strong>Temperature:</strong> ${details.temp}°C</div>` : ''}
                        ${details.humidity !== undefined && details.humidity !== null ? `<div><strong>Humidity:</strong> ${details.humidity}%</div>` : ''}
                    </div>
                </div>
            `);

        iotCoordsRef.current = [numericLat, numericLon];

        // Fly to location smoothly
        map.flyTo([numericLat, numericLon], 11, {
            animate: true,
            duration: 1.5
        });

        // Automatically reveal popup
        iotMarkerRef.current.openPopup();
    }, []);

    const hideIoTMarker = useCallback(() => {
        const map = mapInstanceRef.current;
        iotCoordsRef.current = null;
        if (map && iotMarkerRef.current) {
            map.removeLayer(iotMarkerRef.current);
            iotMarkerRef.current = null;
        }
    }, []);

    // Expose center function to parent
    useEffect(() => {
        if (onLocationSelect) {
            onLocationSelect(centerOnLocation);
        }
    }, [centerOnLocation, onLocationSelect]);

    // Draw polygon
    const handleDrawPolygon = () => {
        rectangleDrawerRef.current?.disable();
        editorRef.current?.disable();
        polygonDrawerRef.current?.enable();
        setActiveDrawTool('polygon');
    };

    // Draw rectangle
    const handleDrawRectangle = () => {
        polygonDrawerRef.current?.disable();
        editorRef.current?.disable();
        rectangleDrawerRef.current?.enable();
        setActiveDrawTool('rectangle');
    };

    // Edit shapes
    const handleEditShapes = () => {
        if (drawnItemsRef.current?.getLayers().length === 0) {
            Swal.fire({
                icon: 'info',
                title: t('opt_draw_shape_first'),
                confirmButtonColor: 'var(--krishi-green)',
            });
            return;
        }
        polygonDrawerRef.current?.disable();
        rectangleDrawerRef.current?.disable();
        editorRef.current?.enable();
        setActiveDrawTool('edit');
    };

    // Save edits
    // Save edits
    const handleSaveEdits = async () => {
        editorRef.current?.disable();
        setActiveDrawTool(null);

        const layers = drawnItemsRef.current?.getLayers();
        if (layers && layers.length > 0) {
            const geojson = layers[0].toGeoJSON();

            // --- 1. AREA CALCULATION ---
            // Turf.js se square meters nikalo
            const areaSqMeters = turf.area(geojson);
            // Hectares mein convert karo (1 Hectare = 10,000 sq meters)
            const calculatedAreaHectares = parseFloat((areaSqMeters / 10000).toFixed(2));

            setDrawnAOI(geojson);
            if (onAOICreated) {
                onAOICreated(geojson);
            }

            // If we have a fieldId, persist the edited AOI to storage
            if (fieldId) {
                try {
                    // --- 2. UPDATE LOCALSTORAGE (Dashboard ke liye) ---
                    const storedFields = JSON.parse(localStorage.getItem('fields') || '[]');
                    const fieldIndex = storedFields.findIndex(f => f.id.toString() === fieldId.toString());

                    if (fieldIndex !== -1) {
                        storedFields[fieldIndex].geometry = geojson.geometry;
                        // Dashboard 'areaHectares' expect karta hai (camelCase)
                        storedFields[fieldIndex].areaHectares = calculatedAreaHectares;

                        localStorage.setItem('fields', JSON.stringify(storedFields));
                        console.log('✅ Field AOI & Area updated in localStorage:', fieldId);
                    }

                    // --- 3. UPDATE BACKEND (Database ke liye) ---
                    try {
                        // 1. Get the Token (Most Critical Step)
                        const auth = getAuth(); // Firebase auth import karna padega
                        const user = auth.currentUser;

                        if (!user) {
                            console.error("User not logged in, cannot save to backend");
                            throw new Error("User not authenticated");
                        }

                        const token = await user.getIdToken();

                        // 2. Send Request with Token
                        const response = await fetch(`/api/update_field/${fieldId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}` // <--- YE MISSING THA
                            },
                            body: JSON.stringify({
                                geometry: geojson.geometry,
                                area_hectares: calculatedAreaHectares
                            })
                        });

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        console.log('✅ Field AOI & Area updated in backend:', fieldId);
                    } catch (backendErr) {
                        console.error('Backend update failed:', backendErr);
                        // Hum yahan rukenge nahi, kyunki localStorage update ho chuka hai
                    }

                    Swal.fire({
                        icon: 'success',
                        title: t('opt_changes_saved'),
                        text: `Shape updated. New Area: ${calculatedAreaHectares} Hectares`,
                        confirmButtonColor: 'var(--krishi-green)',
                        timer: 2500,
                        showConfirmButton: false,
                    });
                } catch (err) {
                    console.error('Error saving field AOI:', err);
                    Swal.fire({
                        icon: 'warning',
                        title: t('opt_changes_saved'),
                        text: 'Changes applied to current session. Could not save permanently.',
                        confirmButtonColor: 'var(--krishi-green)',
                        timer: 2500,
                        showConfirmButton: false,
                    });
                }
            } else {
                Swal.fire({
                    icon: 'success',
                    title: t('opt_changes_saved'),
                    confirmButtonColor: 'var(--krishi-green)',
                    timer: 2000,
                    showConfirmButton: false,
                });
            }
        } else {
            Swal.fire({
                icon: 'info',
                title: t('opt_no_shape_to_save'),
                confirmButtonColor: 'var(--krishi-green)',
            });
        }
    };

    // Delete shapes - FIXED to properly remove AOI
    const handleDeleteShapes = async () => {
        polygonDrawerRef.current?.disable();
        rectangleDrawerRef.current?.disable();
        editorRef.current?.disable();
        setActiveDrawTool(null);

        if (drawnItemsRef.current?.getLayers().length > 0) {
            drawnItemsRef.current.clearLayers();
            setDrawnAOI(null);  // This properly removes the AOI from context
            if (onAOICreated) {
                onAOICreated(null);  // Notify parent that AOI was removed
            }
            clearAllLayers(); // Clear all other layers as delete button erases both AOI and layers

            if (fieldId) {
                try {
                    // Update localStorage
                    const storedFields = JSON.parse(localStorage.getItem('fields') || '[]');
                    const fieldIndex = storedFields.findIndex(f => f.id.toString() === fieldId.toString());

                    if (fieldIndex !== -1) {
                        storedFields[fieldIndex].geometry = null;
                        storedFields[fieldIndex].areaHectares = 0;
                        localStorage.setItem('fields', JSON.stringify(storedFields));
                        console.log('✅ Field AOI cleared in localStorage:', fieldId);
                    }

                    // Update backend database
                    try {
                        const auth = getAuth();
                        const user = auth.currentUser;

                        if (user) {
                            const token = await user.getIdToken();
                            const response = await fetch(`/api/update_field/${fieldId}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    geometry: null,
                                    area_hectares: 0
                                })
                            });

                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            console.log('✅ Field AOI cleared in backend:', fieldId);
                        } else {
                            console.error("User not logged in, cannot delete AOI in backend");
                        }
                    } catch (backendErr) {
                        console.error('Backend delete field geometry failed:', backendErr);
                    }

                    Swal.fire({
                        icon: 'success',
                        title: t('opt_shape_deleted'),
                        text: t('opt_shape_removed_map'),
                        confirmButtonColor: 'var(--krishi-green)',
                        timer: 2000,
                        showConfirmButton: false,
                    });
                } catch (err) {
                    console.error('Error clearing field geometry:', err);
                    Swal.fire({
                        icon: 'warning',
                        title: t('opt_shape_deleted'),
                        text: 'Cleared from current session. Could not persist to backend.',
                        confirmButtonColor: 'var(--krishi-green)',
                        timer: 2000,
                        showConfirmButton: false,
                    });
                }
            } else {
                Swal.fire({
                    icon: 'success',
                    title: t('opt_shape_deleted'),
                    text: t('opt_shape_removed_map'),
                    confirmButtonColor: 'var(--krishi-green)',
                    timer: 2000,
                    showConfirmButton: false,
                });
            }
        } else {
            Swal.fire({
                icon: 'info',
                title: t('opt_nothing_to_delete'),
                text: t('opt_draw_shape_to_delete'),
                confirmButtonColor: 'var(--krishi-green)',
                timer: 2000,
                showConfirmButton: false,
            });
        }
    };

    // Add tile layer to map
    const addTileLayer = useCallback((urlFormat, layerOptions = {}) => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Remove existing layer
        if (currentLayerRef.current) {
            map.removeLayer(currentLayerRef.current);
        }

        // Add new layer with higher zIndex to appear above base layers
        const layer = L.tileLayer(urlFormat, {
            minZoom: 3,
            maxZoom: 23,
            opacity: layerOptions.opacity || 1,
            zIndex: 1000,  // Higher than base layers
            ...layerOptions,
        });

        layer.addTo(map);

        // Bring the layer to front to ensure it's visible above base layers
        layer.bringToFront();

        currentLayerRef.current = layer;
        setCurrentLayer(layer);

        console.log('Tile layer added successfully:', urlFormat);

        return layer;
    }, [setCurrentLayer]);

    // Clear all layers
    const clearAllLayers = useCallback(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Remove base tile layer
        if (currentLayerRef.current) {
            map.removeLayer(currentLayerRef.current);
            currentLayerRef.current = null;
            setCurrentLayer(null);
        }

        // Remove all overlay layers
        Object.values(overlayLayersRef.current).forEach(layer => {
            map.removeLayer(layer);
        });
        overlayLayersRef.current = {};

        // Remove search marker
        if (currentSearchMarkerRef.current) {
            map.removeLayer(currentSearchMarkerRef.current);
            currentSearchMarkerRef.current = null;
        }

        // Remove drone overlay
        if (droneOverlayRef.current) {
            map.removeLayer(droneOverlayRef.current);
            droneOverlayRef.current = null;
        }
    }, [setCurrentLayer]);

    // Add Overlay Layer
    const addOverlayLayer = useCallback((id, url, options) => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // If exists, remove first
        if (overlayLayersRef.current[id]) {
            map.removeLayer(overlayLayersRef.current[id]);
        }

        let layer;
        if (options && options.bounds) {
            const leafletBounds = [
                [options.bounds[0], options.bounds[1]],
                [options.bounds[2], options.bounds[3]]
            ];
            layer = L.imageOverlay(url, leafletBounds, {
                opacity: options.opacity !== undefined ? options.opacity : 1,
                zIndex: 1050,
                crossOrigin: true
            });
        } else {
            layer = L.tileLayer(url, {
                tileSize: 256,
                ...options
            });
        }

        layer.addTo(map);
        overlayLayersRef.current[id] = layer;
        return layer;
    }, []);

    // Remove Overlay Layer
    const removeOverlayLayer = useCallback((id) => {
        const map = mapInstanceRef.current;
        if (!map || !overlayLayersRef.current[id]) return;

        map.removeLayer(overlayLayersRef.current[id]);
        delete overlayLayersRef.current[id];
    }, []);

    const handleFitBounds = useCallback(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (activeModule === 'iot' && iotCoordsRef.current) {
            map.flyTo(iotCoordsRef.current, 13, {
                animate: true,
                duration: 1.2
            });
            if (iotMarkerRef.current) {
                iotMarkerRef.current.openPopup();
            }
            return;
        }

        if (!drawnAOI) return;

        try {
            const layer = L.geoJSON(drawnAOI);
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: [50, 50],
                    animate: true,
                    duration: 1
                });
            }
        } catch (e) {
            console.error("Error centering map:", e);
        }
    }, [drawnAOI, activeModule]);

    // Add Focus Control to Map
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !drawnAOI) return;

        const FocusControl = L.Control.extend({
            onAdd: function () {
                const container = L.DomUtil.create('div', 'leaflet-control-layers leaflet-control');

                // Prevent click propagation
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                const btn = L.DomUtil.create('a', '', container);

                // Match standard Leaflet layers toggle size/style
                btn.href = '#';
                btn.title = 'Focus on Field';
                btn.role = 'button';

                // UPDATED: Set to 44px to match standard touch-friendly Leaflet controls
                // This ensures it matches the height/width of the layers control above it
                btn.style.width = '44px';
                btn.style.height = '44px';

                // Center icon
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';

                btn.style.cursor = 'pointer';
                btn.style.textDecoration = 'none';
                btn.style.color = '#464646';

                // Icon - slightly larger
                const root = createRoot(btn);
                root.render(<RiFocusMode size={20} />);
                this.root = root;

                L.DomEvent.on(btn, 'click', (e) => {
                    L.DomEvent.stop(e);
                    handleFitBounds();
                });

                // Hover effect
                L.DomEvent.on(btn, 'mouseenter', () => { btn.style.color = '#000'; });
                L.DomEvent.on(btn, 'mouseleave', () => { btn.style.color = '#464646'; });

                return container;
            },
            onRemove: function (map) {
                if (this.root) {
                    this.root.unmount();
                }
            }
        });

        const focusControl = new FocusControl({ position: 'topright' });
        focusControl.addTo(map);

        return () => {
            focusControl.remove();
        };
    }, [drawnAOI, handleFitBounds]);

    // Expose functions to parent
    useEffect(() => {
        window.mapFunctions = {
            addTileLayer,
            clearAllLayers,
            centerOnLocation,
            getMap: () => mapInstanceRef.current,
            getDrawnItems: () => drawnItemsRef.current,
            startDrawPolygon: handleDrawPolygon,
            startDrawRectangle: handleDrawRectangle,
            startEditShapes: handleEditShapes,
            saveEdits: handleSaveEdits,
            deleteShapes: handleDeleteShapes,
            addOverlayLayer,
            removeOverlayLayer,
            showIoTMarker,
            hideIoTMarker
        };
    }, [addTileLayer, clearAllLayers, centerOnLocation, handleDrawPolygon, handleDrawRectangle, handleEditShapes, handleSaveEdits, handleDeleteShapes, addOverlayLayer, removeOverlayLayer, showIoTMarker, hideIoTMarker]);

    return (
        <div className="map-container">
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {/* --- YAHAN PASTE KAREIN: Button Code --- */}
            {/* Loading Spinner */}
            {isLoading && (
                <div className="spinner-overlay">
                    <div className="spinner"></div>
                </div>
            )}

            {/* Drawing Toolbar -> Moved to Sidebar */}
        </div>
    );
}

export default MapComponent;
