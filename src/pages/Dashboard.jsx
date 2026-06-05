import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Chart } from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { getFields, saveField, getLastIrrigationCalendar, getUserAreaSummary, getIoTData, getLocationDetails } from '../utils/api';
import { kml } from '@mapbox/togeojson';
import './Dashboard.css';

function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [fields, setFields] = useState([]);
    const [irrigationData, setIrrigationData] = useState(null);
    const [cropHealthData, setCropHealthData] = useState(null);
    const [activeIoTData, setActiveIoTData] = useState(null);
    const [loading, setLoading] = useState({ fields: true, irrigation: true, cropHealth: true, iot: true });
    // DB-sourced area summary (authoritative total from database SUM query)
    const [dbAreaSummary, setDbAreaSummary] = useState(null);

    // New state for file upload naming step
    const [pendingFieldData, setPendingFieldData] = useState(null);
    const [fieldNameInput, setFieldNameInput] = useState('');

    // Modal states for fullscreen cards
    const [irrigationModalOpen, setIrrigationModalOpen] = useState(false);
    const [cropHealthModalOpen, setCropHealthModalOpen] = useState(false);

    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const fieldsLayerRef = useRef(null);
    const diseaseChartRef = useRef(null);
    const cropHealthChartRef = useRef(null);
    const vegCoverChartRef = useRef(null);

    const cleanAdvice = (text) => String(text || '').replace(/■/g, '').trim();

    // Dark mode toggle
    useEffect(() => {
        const savedMode = localStorage.getItem('darkMode') === 'true';
        setIsDarkMode(savedMode);
        if (savedMode) {
            document.body.classList.add('dark-mode');
        }
    }, []);

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        document.body.classList.toggle('dark-mode', newMode);
        localStorage.setItem('darkMode', newMode);
    };

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false
        }).setView([20.5937, 78.9629], 3);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        }).addTo(map);

        mapInstanceRef.current = map;
        fieldsLayerRef.current = new L.FeatureGroup().addTo(map);

        const timer = setTimeout(() => {
            if (map && map.getContainer()) {
                map.invalidateSize();
            }
        }, 100);

        return () => {
            clearTimeout(timer);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Load fields (Data Fetching)
    useEffect(() => {
        async function loadFields() {
            // STEP A: Pehle purana data dikhao (Instant Load)
            const localFields = localStorage.getItem('fields');
            if (localFields) {
                try {
                    setFields(JSON.parse(localFields));
                    setLoading(prev => ({ ...prev, fields: false })); // Spinner turant band karo
                } catch (e) {
                    console.error('Cache parse error', e);
                }
            }

            // STEP B: Chupke se naya data laao (Background Fetch)
            try {
                const data = await getFields();
                if (data && data.length > 0) {
                    setFields(data); // Screen update karo naye data se
                    localStorage.setItem('fields', JSON.stringify(data)); // Naya data save karo next time ke liye
                    
                    // Fetch IoT telemetry data for the active/first field
                    try {
                        const firstFieldId = data[0].id;
                        const iotResponse = await getIoTData(firstFieldId, false);
                        if (iotResponse?.data && iotResponse.data.length > 0) {
                            setActiveIoTData({
                                fieldName: data[0].name,
                                fieldId: firstFieldId,
                                metrics: iotResponse.data[iotResponse.data.length - 1],
                                allFeeds: iotResponse.data,
                                channelMetadata: iotResponse.channel_metadata
                            });
                            console.log('✅ Loaded fresh IoT data for Dashboard:', iotResponse.channel_metadata?.name);
                        }
                    } catch (iotErr) {
                        console.log('Failed to fetch IoT data for dashboard:', iotErr);
                    }
                }
            } catch (error) {
                console.log('Backend fail hua, purana data hi dikhega');
            } finally {
                setLoading(prev => ({ ...prev, fields: false, iot: false })); // Ensure spinner is off
            }
        }
        
        // Also load from cache first if exists
        const cachedIoT = localStorage.getItem('lastDashboardIoT');
        if (cachedIoT) {
            try {
                setActiveIoTData(JSON.parse(cachedIoT));
            } catch(e) {}
        }
        
        loadFields();
    }, []);

    // Fetch DB-level area summary — authoritative total via SQL SUM
    useEffect(() => {
        async function fetchAreaSummary() {
            try {
                const summary = await getUserAreaSummary();
                if (summary?.success) {
                    setDbAreaSummary(summary);
                    console.log('✅ DB area summary:', summary);
                }
            } catch (e) {
                console.log('DB area summary unavailable, will use local calculation.');
            }
        }
        fetchAreaSummary();
    }, []); // re-fetch whenever fields list changes (add/delete)

    // Render Fields on Map (Visualization)
    useEffect(() => {
        if (!mapInstanceRef.current || !fieldsLayerRef.current) return;

        const layerGroup = fieldsLayerRef.current;
        layerGroup.clearLayers();

        // 1. Render usage fields
        fields.forEach((field, index) => {
            const fieldNumber = index + 1;
            let layer;

            // Draw shape
            if (field.type === 'circle') {
                layer = L.circle(field.geometry.center, {
                    radius: field.geometry.radius,
                    color: 'white',
                    weight: 2,
                    fillOpacity: 0
                });
            } else if (field.geometry) {
                layer = L.geoJSON(field.geometry, {
                    style: { color: 'white', weight: 2, fillOpacity: 0 }
                });
            }

            if (layer) {
                layerGroup.addLayer(layer);

                // Click to navigate
                layer.on('click', () => {
                    navigate(`/app?field_id=${field.id}&tab=satellite`);
                });

                // Draw Label Marker
                let center;
                if (field.type === 'circle') {
                    center = field.geometry.center;
                } else {
                    // For GeoJSON layer, getBounds might be on the internal layer
                    center = layer.getBounds().getCenter();
                }

                const marker = L.marker(center, {
                    icon: L.divIcon({
                        className: 'field-number-label',
                        html: `<div class="field-marker">${fieldNumber}</div>`,
                        iconSize: [40, 40]
                    })
                });

                marker.on('click', () => {
                    navigate(`/app?field_id=${field.id}&tab=satellite`);
                });

                layerGroup.addLayer(marker);
            }
        });

        // 2. Render Pending Field (Uploaded but not saved)
        if (pendingFieldData && pendingFieldData.geometry) {
            const pendingLayer = L.geoJSON(pendingFieldData.geometry, {
                style: {
                    color: '#00e676', // Bright Green
                    weight: 3,
                    dashArray: '10, 10',
                    fillOpacity: 0.2
                }
            });
            layerGroup.addLayer(pendingLayer);
        }

        // 3. Fit Bounds
        if (layerGroup.getLayers().length > 0) {
            mapInstanceRef.current.fitBounds(layerGroup.getBounds(), { padding: [50, 50] });
        }

    }, [fields, pendingFieldData, navigate]);

    // Load irrigation calendar from backend or localStorage (unchanged)
    useEffect(() => {
        const fetchIrrigation = async () => {
            // STEP A: Pehle purana data dikhao
            const stored = localStorage.getItem('lastIrrigationCalendar');
            if (stored) {
                try {
                    setIrrigationData(JSON.parse(stored));
                    setLoading(prev => ({ ...prev, irrigation: false })); // Spinner band
                } catch (e) {
                    console.error('Error parsing stored irrigation data:', e);
                }
            }

            // STEP B: Background mein nayi API call
            try {
                const data = await getLastIrrigationCalendar();
                if (data && data.calendar && data.calendar.length > 0) {
                    setIrrigationData(data); // Update UI
                    localStorage.setItem('lastIrrigationCalendar', JSON.stringify(data));
                    console.log('✅ Loaded fresh irrigation data');
                }
            } catch (e) {
                console.log('Fetching irrigation from backend failed:', e);
            } finally {
                setLoading(prev => ({ ...prev, irrigation: false }));
            }
        };

        fetchIrrigation();
    }, []);

    // Load crop health data from localStorage (unchanged)
    useEffect(() => {
        const stored = localStorage.getItem('lastCropHealthData');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                setCropHealthData(data);
            } catch (e) {
                console.error('Error parsing crop health data:', e);
            }
        }
        setLoading(prev => ({ ...prev, cropHealth: false }));
    }, []);

    // Initialize disease chart (unchanged)
    useEffect(() => {
        if (!diseaseChartRef.current) return;

        const ctx = diseaseChartRef.current.getContext('2d');
        if (diseaseChartRef.current.chartInstance) {
            diseaseChartRef.current.chartInstance.destroy();
        }

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No advice', 'Other'],
                datasets: [{
                    data: [fields.length || 0, 0],
                    backgroundColor: ['#e0e0e0', '#ffffff'],
                    borderWidth: 0,
                    cutout: '80%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });

        diseaseChartRef.current.chartInstance = chart;
        return () => chart.destroy();
    }, [fields.length]);

    // Render crop health mini chart (unchanged)
    useEffect(() => {
        if (!cropHealthData?.data || !cropHealthChartRef.current) return;

        const ctx = cropHealthChartRef.current.getContext('2d');
        if (cropHealthChartRef.current.chartInstance) {
            cropHealthChartRef.current.chartInstance.destroy();
        }

        const chartData = cropHealthData.data.slice(-30);
        const labels = chartData.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const ndviData = chartData.map(d => d.ndvi);

        const gradient = ctx.createLinearGradient(0, 0, 0, 100);
        gradient.addColorStop(0, 'rgba(156, 39, 176, 0.3)');
        gradient.addColorStop(1, 'rgba(156, 39, 176, 0.05)');

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Crop Health Trend',
                    data: ndviData,
                    borderColor: 'rgb(156, 39, 176)',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: {
                        display: true,
                        grid: { display: true, color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { size: 9 }, color: '#999', maxTicksLimit: 4 }
                    }
                }
            }
        });

        cropHealthChartRef.current.chartInstance = chart;
        return () => chart.destroy();
    }, [cropHealthData]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // New: Function to handle map resize after fullscreen toggle
    const handleMapResize = () => {
        const mapElement = mapRef.current;
        const isFullscreen = document.fullscreenElement === mapElement ||
            document.mozFullScreenElement === mapElement ||
            document.webkitFullscreenElement === mapElement ||
            document.msFullscreenElement === mapElement;

        // Leaflet needs to re-calculate size after the browser finishes the transition
        setTimeout(() => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
            }
        }, 350);

        // Optional: You might want to toggle a class on the map-card element if necessary
        // mapElement.classList.toggle('is-fullscreen', isFullscreen); 
    };

    // New: Function to handle fullscreen button click
    const handleFullscreen = () => {
        const mapElement = mapRef.current;
        if (!mapElement) return;

        if (document.fullscreenElement) {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        } else {
            // Enter fullscreen
            if (mapElement.requestFullscreen) {
                mapElement.requestFullscreen();
            } else if (mapElement.mozRequestFullScreen) { /* Firefox */
                mapElement.mozRequestFullScreen();
            } else if (mapElement.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
                mapElement.webkitRequestFullscreen();
            } else if (mapElement.msRequestFullscreen) { /* IE/Edge */
                mapElement.msRequestFullscreen();
            }
        }
    };

    // Attach event listeners for map resize on fullscreen change
    useEffect(() => {
        document.addEventListener('fullscreenchange', handleMapResize);
        document.addEventListener('webkitfullscreenchange', handleMapResize);
        document.addEventListener('mozfullscreenchange', handleMapResize);
        document.addEventListener('msfullscreenchange', handleMapResize);

        // Cleanup listeners on component unmount
        return () => {
            document.removeEventListener('fullscreenchange', handleMapResize);
            document.removeEventListener('webkitfullscreenchange', handleMapResize);
            document.removeEventListener('mozfullscreenchange', handleMapResize);
            document.removeEventListener('msfullscreenchange', handleMapResize);
        };
    }, []);

    // Upload + store AOI with name input step
    // Upload + store AOI with name input step
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = null;

        const isKml = file.name.toLowerCase().endsWith('.kml');
        const isGeoJson = file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json');

        if (!isKml && !isGeoJson) {
            Swal.fire({
                icon: 'error',
                title: 'Invalid File',
                text: 'Please upload a GeoJSON (.json, .geojson) or KML (.kml) file.',
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                let parsedData = null;

                // 1. Parse the file based on type
                if (isKml) {
                    const parser = new DOMParser();
                    const kmlDom = parser.parseFromString(content, 'text/xml');
                    parsedData = kml(kmlDom);
                } else {
                    parsedData = JSON.parse(content);
                }

                let geometry = null;
                if (parsedData.type === 'FeatureCollection' && parsedData.features.length > 0) {
                    geometry = parsedData.features[0].geometry;
                } else if (parsedData.type === 'Feature') {
                    geometry = parsedData.geometry;
                } else if (parsedData.type === 'Polygon' || parsedData.type === 'MultiPolygon') {
                    geometry = parsedData;
                }

                if (!geometry) {
                    throw new Error("No valid geometry found in file.");
                }

                // Show boundary loaded success toast first
                await Swal.fire({
                    icon: 'success',
                    title: 'File Uploaded',
                    text: 'Field boundary loaded! Let\'s enter your field details.',
                    timer: 1800,
                    showConfirmButton: false
                });

                // Calculate center and area
                let area = 0;
                let type = 'polygon';
                let center = null;

                const tempLayer = L.geoJSON(geometry).getLayers()[0];
                if (tempLayer) {
                    if (tempLayer instanceof L.Circle) {
                        type = 'circle';
                        const radius = tempLayer.getRadius();
                        area = Math.PI * radius * radius;
                        center = tempLayer.getLatLng();
                    } else {
                        type = 'polygon';
                        const latLngs = tempLayer.getLatLngs()[0];
                        center = tempLayer.getBounds().getCenter();
                        const pointsCount = latLngs.length;
                        const d2r = Math.PI / 180;
                        if (pointsCount > 2) {
                            for (let i = 0; i < pointsCount; i++) {
                                const p1 = latLngs[i];
                                const p2 = latLngs[(i + 1) % pointsCount];
                                area += ((p2.lng - p1.lng) * d2r) *
                                    (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
                            }
                            area = Math.abs(area * 6378137.0 * 6378137.0 / 2.0);
                        }
                    }
                }

                // Show loading state for geocoding
                Swal.fire({
                    title: 'Gathering Information...',
                    text: 'Fetching location details based on boundary...',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                let fetchedDistrict = '';
                let fetchedVillage = '';
                if (center) {
                    try {
                        const locationDetails = await getLocationDetails(center.lat, center.lng);
                        fetchedDistrict = (locationDetails.district && locationDetails.district !== 'NA') ? locationDetails.district : '';
                        fetchedVillage = (locationDetails.village && locationDetails.village !== 'NA') ? locationDetails.village : '';
                    } catch (e) {
                        console.error("Error fetching location", e);
                    }
                }

                Swal.close();

                const defaultName = file.name.replace(/\.[^/.]+$/, "");

                const { value: formValues } = await Swal.fire({
                    title: 'Field Details <span style="font-size:18px; color:gray; font-weight:normal; display:block;">खेत का विवरण</span>',
                    html: `
                        <div style="display: flex; flex-direction: column; gap: 14px; text-align: left; padding-top: 5px;">
                            <div>
                                <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                    Field Name * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ खेत का नाम</span>
                                </label>
                                <input id="swal-name" class="swal2-input" value="${defaultName}" placeholder="e.g., North Field" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                            </div>
                            
                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        District <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ ज़िला</span>
                                    </label>
                                    <input id="swal-district" class="swal2-input" value="${fetchedDistrict}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        Village * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ गाँव</span>
                                    </label>
                                    <input id="swal-village" class="swal2-input" value="${fetchedVillage}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        Crop Type * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ फसल का प्रकार</span>
                                    </label>
                                    <select id="swal-crop-type" class="swal2-select" style="margin: 0; width: 100%; height: 2.5rem; padding: 0 10px; font-size: 14px;">
                                        <option value="">Select / चुनें</option>
                                        <option value="Cereal">Cereal / अनाज</option>
                                        <option value="Legume">Legume / दालें</option>
                                        <option value="Vegetable">Vegetable / सब्जियां</option>
                                        <option value="Fruit">Fruit / फल</option>
                                        <option value="Cash Crop">Cash Crop / नकदी फसल</option>
                                        <option value="Other">Other / अन्य</option>
                                    </select>
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        Crop Name * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ फसल का नाम</span>
                                    </label>
                                    <select id="swal-crop-name" class="swal2-select" disabled style="margin: 0; width: 100%; height: 2.5rem; padding: 0 10px; font-size: 14px;">
                                        <option value="">Select Type First / पहले प्रकार चुनें</option>
                                    </select>
                                </div>
                            </div>
        
                            <div id="swal-custom-crop-container" style="display: none; margin-top: 4px;">
                                <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                    Specify Crop Name * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ फसल का नाम दर्ज करें</span>
                                </label>
                                <input id="swal-custom-crop-name" class="swal2-input" placeholder="e.g., Mustard / सरसों" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                            </div>
        
                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        Sowing Date * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ बुवाई की तिथि</span>
                                    </label>
                                    <input type="date" id="swal-sowing-date" class="swal2-input" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                        Harvesting Date <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ कटाई की तिथि</span>
                                    </label>
                                    <input type="date" id="swal-harvesting-date" class="swal2-input" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                                </div>
                            </div>
                        </div>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonColor: '#2f7a2f',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Save / सहेजें',
                    cancelButtonText: 'Cancel / रद्द करें',
                    width: '450px',
                    didOpen: () => {
                        const cropTypeSelect = document.getElementById('swal-crop-type');
                        const cropNameSelect = document.getElementById('swal-crop-name');
                        const customCropContainer = document.getElementById('swal-custom-crop-container');
        
                        const cropOptions = {
                            Cereal: [
                                { value: 'Wheat', label: 'Wheat / गेहूँ' },
                                { value: 'Paddy', label: 'Paddy (Rice) / धान (चावल)' },
                                { value: 'Maize', label: 'Maize / मक्का' },
                                { value: 'Barley', label: 'Barley / जौ' },
                                { value: 'Bajra', label: 'Bajra / बाजरा' }
                            ],
                            Legume: [
                                { value: 'Gram', label: 'Gram / चना' },
                                { value: 'Peas', label: 'Peas / मटर' },
                                { value: 'Lentils', label: 'Lentils (Masoor) / मसूर' },
                                { value: 'PigeonPea', label: 'Pigeon Pea (Arhar) / अरहर' }
                            ],
                            Vegetable: [
                                { value: 'Potato', label: 'Potato / आलू' },
                                { value: 'Tomato', label: 'Tomato / टमाटर' },
                                { value: 'Onion', label: 'Onion / प्याज' },
                                { value: 'Cauliflower', label: 'Cauliflower / फूलगोभी' }
                            ],
                            Fruit: [
                                { value: 'Mango', label: 'Mango / आम' },
                                { value: 'Guava', label: 'Guava / अमरूद' },
                                { value: 'Banana', label: 'Banana / केला' }
                            ],
                            'Cash Crop': [
                                { value: 'Sugarcane', label: 'Sugarcane / गन्ना' },
                                { value: 'Mustard', label: 'Mustard / सरसों' },
                                { value: 'Cotton', label: 'Cotton / कपास' }
                            ]
                        };
        
                        const updateCropNames = () => {
                            const selectedType = cropTypeSelect.value;
                            cropNameSelect.innerHTML = '<option value="">Select / चुनें</option>';
                            
                            if (!selectedType) {
                                cropNameSelect.disabled = true;
                                customCropContainer.style.display = 'none';
                                return;
                            }
        
                            cropNameSelect.disabled = false;
        
                            if (selectedType === 'Other') {
                                cropNameSelect.innerHTML = '<option value="Other">Other / अन्य</option>';
                                cropNameSelect.value = 'Other';
                                customCropContainer.style.display = 'block';
                                return;
                            }
        
                            const crops = cropOptions[selectedType] || [];
                            crops.forEach(crop => {
                                const opt = document.createElement('option');
                                opt.value = crop.value;
                                opt.textContent = crop.label;
                                cropNameSelect.appendChild(opt);
                            });
        
                            const otherOpt = document.createElement('option');
                            otherOpt.value = 'Other';
                            otherOpt.textContent = 'Other / अन्य';
                            cropNameSelect.appendChild(otherOpt);
        
                            checkCustomCrop();
                        };
        
                        const checkCustomCrop = () => {
                            if (cropNameSelect.value === 'Other') {
                                customCropContainer.style.display = 'block';
                            } else {
                                customCropContainer.style.display = 'none';
                            }
                        };
        
                        cropTypeSelect.addEventListener('change', updateCropNames);
                        cropNameSelect.addEventListener('change', checkCustomCrop);
                    },
                    preConfirm: () => {
                        const name = document.getElementById('swal-name').value;
                        const district = document.getElementById('swal-district').value;
                        const village = document.getElementById('swal-village').value;
                        const cropType = document.getElementById('swal-crop-type').value;
                        const cropNameVal = document.getElementById('swal-crop-name').value;
                        const customCropName = document.getElementById('swal-custom-crop-name').value;
                        const sowingDate = document.getElementById('swal-sowing-date').value;
                        const harvestingDate = document.getElementById('swal-harvesting-date').value;
                        
                        if (!name) {
                            Swal.showValidationMessage('Please enter a Field Name / कृपया खेत का नाम दर्ज करें');
                            return false;
                        }
                        if (!village) {
                            Swal.showValidationMessage('Please enter a Village / कृपया गाँव का नाम दर्ज करें');
                            return false;
                        }
                        if (!cropType) {
                            Swal.showValidationMessage('Please select a Crop Type / कृपया फसल का प्रकार चुनें');
                            return false;
                        }
                        if (!cropNameVal) {
                            Swal.showValidationMessage('Please select a Crop Name / कृपया फसल का नाम चुनें');
                            return false;
                        }
                        if (!sowingDate) {
                            Swal.showValidationMessage('Please select a Sowing Date / कृपया बुवाई की तिथि चुनें');
                            return false;
                        }
        
                        let cropName = cropNameVal;
                        if (cropNameVal === 'Other' || cropType === 'Other') {
                            const finalCustomName = customCropName.trim();
                            if (!finalCustomName) {
                                Swal.showValidationMessage('Please specify the Crop Name / कृपया फसल का नाम दर्ज करें');
                                return false;
                            }
                            cropName = finalCustomName;
                        }
        
                        return { name, district, village, cropType, cropName, sowingDate, harvestingDate };
                    }
                });

                if (formValues) {
                    Swal.fire({
                        title: 'Saving Field...',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    const payload = {
                        name: formValues.name,
                        type,
                        geometry,
                        areaHectares: (area / 10000).toFixed(2),
                        areaAcres: (area / 4046.86).toFixed(2),
                        district: formValues.district || 'NA',
                        village: formValues.village || 'NA',
                        cropType: formValues.cropType,
                        cropName: formValues.cropName,
                        sowingDate: formValues.sowingDate,
                        harvestingDate: formValues.harvestingDate,
                        latitude: center ? center.lat : null,
                        longitude: center ? center.lng : null
                    };

                    let backendSaved = false;
                    let backendId = null;

                    try {
                        const result = await saveField(payload);
                        if (result.success) {
                            backendSaved = true;
                            backendId = result.id;
                        }
                    } catch (error) {
                        console.log('Backend save failed, saving locally');
                    }

                    const newField = {
                        id: backendId || Date.now().toString(),
                        ...payload
                    };

                    const fieldsLS = JSON.parse(localStorage.getItem('fields') || '[]');
                    const updatedFields = [...fieldsLS, newField];
                    localStorage.setItem('fields', JSON.stringify(updatedFields));

                    setFields(prev => [...prev, newField]);

                    await Swal.fire({
                        icon: 'success',
                        title: backendSaved ? 'Field Saved!' : 'Field Saved Locally',
                        text: backendSaved
                            ? `"${payload.name}" has been saved successfully.`
                            : `"${payload.name}" has been saved locally.`,
                        confirmButtonColor: '#2f7a2f',
                        timer: 2000
                    });

                    navigate(`/app?field_id=${newField.id}&tab=satellite`);
                }

            } catch (err) {
                console.error("File parsing error:", err);
                Swal.fire({
                    icon: 'error',
                    title: 'Parsing Error',
                    text: 'Could not read geometry from this file. Please ensure it is valid KML or GeoJSON.',
                });
            }
        };

        // Read the file as text
        reader.readAsText(file);
    };

    const handleSaveField = () => {};
    const handleCancelUpload = () => {};

    const totalArea = fields.reduce((sum, f) => {
        if (f.areaAcres != null && f.areaAcres !== '') {
            return sum + (parseFloat(f.areaAcres) || 0);
        } else if (f.areaHectares != null && f.areaHectares !== '') {
            // Fallback: compute acres from hectares (1 ha = 2.47105 acres)
            return sum + (parseFloat(f.areaHectares) || 0) * 2.47105;
        }
        return sum;
    }, 0);

    return (
        <div className="dashboard-page">
            {/* Header (unchanged) */}
            <header className="dashboard-header">
                <div className="nav-left">
                    <Link to="/dashboard" className="brand">
                        <img src="/static/Logo.jpg" alt="KrishiZest" style={{ height: 48 }} />
                    </Link>
                    <nav className="nav-links">
                        <Link to="/dashboard" className="nav-link active">Dashboard</Link>
                        <Link to="/fields" className="nav-link">Fields</Link>
                        <Link to="/expenditures" className="nav-link">Expenditures</Link>
                    </nav>
                </div>
                <div className="nav-right">
                    {/* NEW: User Name Display */}

                    <button className="theme-toggle" onClick={toggleDarkMode}>
                        <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
                    </button>
                    <div className={`profile-dropdown ${showProfileMenu ? 'active' : ''}`}>
                        <button className="profile-btn" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="Profile" className="avatar-image" />
                            ) : (
                                <div className="avatar">
                                    {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                        </button>
                        <div className="profile-menu">
                            <div className="user-info">
                                <div className="user-name">{user?.name || 'User'}</div>
                                <div className="user-email">{user?.email}</div>
                            </div>
                            <button className="dropdown-item" onClick={handleLogout}>
                                <i className="fas fa-sign-out-alt"></i> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="dashboard-container">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">
                            {/* MODIFIED: RENDER THE FULL NAME AND "DASHBOARD" */}
                            {user?.name ? (
                                <span>
                                    {user.name}
                                    &nbsp;Dashboard
                                </span>
                            ) : (
                                'Dashboard' // Fallback if no user name exists
                            )}
                        </h1>
                    </div>
                    <div className="header-actions"></div>
                </div>

                <div className="dashboard-grid">
                    {/* Create Field Card - Centered Design */}
                    <Link to="/create-field" className="card create-field-card">
                        <div className="create-field-content">
                            <div className="create-field-icon">
                                <i className="fas fa-plus"></i>
                            </div>
                            <div className="create-field-text">
                                Draw a new AOI
                                <i className="fas fa-arrow-right" style={{ marginLeft: '8px', fontSize: '14px' }}></i>
                            </div>
                        </div>
                    </Link>

                    {/* NEW 2: "Upload Field" Card (with name input) */}
                    <div className="card upload-field-card">
                        <div className="card-header">
                            <i className="fas fa-upload card-icon"></i>
                            <span className="card-title">Upload Field (Geo/KML)</span>
                        </div>
                        <div className="card-body upload-field-body">
                            <div className="card-body upload-field-body">
                                {pendingFieldData ? (
                                    <div style={{ width: '100%', padding: '0 16px' }}>
                                        <h4 style={{ marginBottom: 12, fontSize: 14 }}>Enter Field Name</h4>
                                        <input
                                            type="text"
                                            value={fieldNameInput}
                                            onChange={(e) => setFieldNameInput(e.target.value)}
                                            placeholder="Field Name"
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                marginBottom: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-light)',
                                                color: 'var(--text-main)',
                                                outline: 'none'
                                            }}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn btn-save"
                                                onClick={handleSaveField}
                                            >
                                                Save
                                            </button>
                                            <button
                                                className="btn btn-cancel"
                                                onClick={handleCancelUpload}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="file"
                                            id="file-upload"
                                            style={{ display: 'none' }}
                                            accept=".geojson,.json,.kml"
                                            onChange={handleFileUpload}
                                        />
                                        <label htmlFor="file-upload" className="upload-label">
                                            <i className="fas fa-file-upload upload-icon"></i>
                                            <div className="upload-title">Upload from File</div>
                                            <div className="upload-subtitle">Click to select GeoJSON or KML file</div>
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Map Card (Add onClick for Fullscreen) */}
                    <div className="card map-card">
                        <div ref={mapRef} className="fields-map"></div>
                        <button
                            className="map-overlay-btn"
                            title="Fullscreen"
                            onClick={handleFullscreen}   /* <--- NEW: Fullscreen handler added */
                        >
                            <i className="fas fa-expand"></i>
                        </button>
                    </div>

                    {/* Irrigation Calendar Card */}
                    <div className="card">
                        <div className="card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                                <span className="card-title">Irrigation Calendar</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className={`badge ${irrigationData?.calendar?.length > 0 ? 'badge-success' : 'badge-default'}`}>
                                    {loading.irrigation ? 'Loading...' : irrigationData?.calendar?.length > 0 ? 'Recent Activity' : 'No Data'}
                                </span>
                                <button
                                    className="card-fullscreen-btn"
                                    onClick={() => setIrrigationModalOpen(true)}
                                    title="View Fullscreen"
                                >
                                    <i className="fas fa-expand"></i>
                                </button>
                            </div>
                        </div>
                        <div className="card-body irrigation-card-body">
                            {loading.irrigation ? (
                                <div className="loading-state">
                                    <i className="fas fa-circle-notch fa-spin"></i>
                                    <p>Fetching Recent Data...</p>
                                </div>
                            ) : irrigationData?.calendar?.length > 0 ? (
                                <div className="irrigation-card-content">
                                    {/* Quick Stats Row */}
                                    <div className="irrigation-quick-stats">
                                        <div className="quick-stat">
                                            <span className="quick-stat-value">{irrigationData.summary?.irrigation_events || 0}</span>
                                            <span className="quick-stat-label">Events</span>
                                        </div>
                                        <div className="quick-stat">
                                            <span className="quick-stat-value">{irrigationData.summary?.total_water_mm?.toFixed(0) || 0}</span>
                                            <span className="quick-stat-label">mm Total</span>
                                        </div>
                                        <div className="quick-stat">
                                            <span className="quick-stat-value">
                                                {(() => {
                                                    const saved = irrigationData.summary?.water_saved_mm || 0;
                                                    const total = irrigationData.summary?.total_water_mm || 0;
                                                    const original = total + saved;
                                                    return original > 0 ? ((saved / original) * 100).toFixed(0) : 0;
                                                })()}%
                                            </span>
                                            <span className="quick-stat-label">Saved</span>
                                        </div>
                                    </div>

                                    {/* Events List */}
                                    <div className="irrigation-events-list">
                                        {irrigationData.calendar
                                            .filter(event => event.should_irrigate)
                                            .reverse()
                                            .slice(0, 4)
                                            .map((event, idx) => {
                                                const priorityColors = {
                                                    'URGENT': '#d32f2f',
                                                    'HIGH': '#f57c00',
                                                    'MEDIUM': '#fbc02d',
                                                    'LOW': '#388e3c'
                                                };
                                                const color = priorityColors[event.priority] || '#999';

                                                return (
                                                    <div key={idx} className="irrigation-event-item" style={{ borderLeftColor: color }}>
                                                        <div className="event-date">
                                                            {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </div>
                                                        <div className="event-amount">{event.final_irrigation_mm?.toFixed(1)} mm</div>
                                                        <span className="event-priority" style={{ background: color }}>
                                                            {event.priority}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <i className="fas fa-tint"></i>
                                    <div className="empty-title">No Irrigation Data</div>
                                    <div className="empty-text">Generate calendar in Field Analysis</div>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Crop Health Card */}
                    <div className="card">
                        <div className="card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <i className="fas fa-chart-line card-icon"></i>
                                <span className="card-title">Crop Health</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className={`badge ${cropHealthData?.data?.length ? 'badge-success' : 'badge-default'}`}>
                                    {loading.cropHealth ? 'Loading...' : cropHealthData?.data?.length ? 'Recent Activity' : 'No Data'}
                                </span>
                                <button
                                    className="card-fullscreen-btn"
                                    onClick={() => setCropHealthModalOpen(true)}
                                    title="View Fullscreen"
                                >
                                    <i className="fas fa-expand"></i>
                                </button>
                            </div>
                        </div>
                        <div className="card-body">
                            {loading.cropHealth ? (
                                <div className="loading-state">
                                    <i className="fas fa-circle-notch fa-spin"></i>
                                    <p>Loading Crop Health...</p>
                                </div>
                            ) : cropHealthData?.data?.length > 0 ? (
                                <div className="crop-health-content">
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Crop Health Trend</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#9c27b0' }}>
                                                {(() => {
                                                    const validNdviPoints = cropHealthData.data.filter(d => d.ndvi !== null && d.ndvi !== undefined);
                                                    return validNdviPoints.length > 0 
                                                        ? (validNdviPoints.reduce((sum, d) => sum + d.ndvi, 0) / validNdviPoints.length).toFixed(3)
                                                        : '—';
                                                })()}
                                            </span>
                                        </div>
                                        <div style={{ height: 100 }}>
                                            <canvas ref={cropHealthChartRef}></canvas>
                                        </div>
                                    </div>
                                    <div className="crop-stats">
                                        <div>
                                            <div className="stat-value">{cropHealthData.data.length}</div>
                                            <div className="stat-label">Data Points</div>
                                        </div>
                                        <div>
                                            <div className="stat-value">
                                                {new Date(cropHealthData.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                            <div className="stat-label">Start Date</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <i className="fas fa-leaf"></i>
                                    <div className="empty-title">No Crop Data</div>
                                    <div className="empty-text">Generate crop health analysis in Fields.</div>
                                </div>
                            )}
                        </div>
                    </div>



                    {/* Crops Card — DB-sourced area */}
                    <div className="card">
                        <div className="card-header">
                            <i className="fas fa-seedling card-icon"></i>
                            <span className="card-title">Crops</span>
                            <span
                                className="crop-header-right"
                                title={dbAreaSummary ? 'Sourced from database' : 'Computed from loaded fields'}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 600
                                }}
                            >
                                {dbAreaSummary ? (
                                    <>
                                        <i className="fas fa-database" style={{ fontSize: 9, color: 'var(--primary-green)', opacity: 0.8 }}></i>
                                        {dbAreaSummary.totalAcres.toFixed(2)} ac
                                    </>
                                ) : (
                                    `${totalArea.toFixed(2)} ac`
                                )}
                            </span>
                        </div>
                        <div className="card-body" style={{ paddingBottom: 8 }}>
                            {/* Field count */}
                            <div className="crop-data-value">
                                {dbAreaSummary ? dbAreaSummary.fieldCount : fields.length}
                            </div>
                            <div className="crop-data-label">
                                {(dbAreaSummary ? dbAreaSummary.fieldCount : fields.length) === 0 ? 'No Fields' : 'Fields'}
                            </div>

                            {/* DB area breakdown */}
                            {dbAreaSummary && (
                                <div style={{
                                    marginTop: 10,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: 'rgba(47,122,47,0.08)',
                                    border: '1px solid rgba(47,122,47,0.18)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 6
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-green)' }}>
                                            {dbAreaSummary.totalAcres.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500 }}>Acres</div>
                                    </div>
                                    <div style={{ width: 1, height: 28, background: 'var(--border-color)' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-green)' }}>
                                            {dbAreaSummary.totalHectares.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500 }}>Hectares</div>
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 3 }}>
                                        {/* <i className="fas fa-database"></i> DB */}
                                    </div>
                                </div>
                            )}
                        </div>
                        <Link to="/fields" className="view-all-link">View All Fields</Link>
                    </div>

                    {/* Recommendations Card */}
                    <div className="card" onClick={() => activeIoTData && navigate(`/app?field_id=${activeIoTData.fieldId}&tab=iot`)} style={{ cursor: activeIoTData ? 'pointer' : 'default' }}>
                        <div className="card-header">
                            <i className="fas fa-user-check card-icon"></i>
                            <span className="card-title">Recommendations</span>
                        </div>
                        <div className="card-body">
                            {activeIoTData && activeIoTData.metrics ? (
                                <div style={{ padding: '8px 4px' }}>
                                    <div style={{ fontWeight: 700, color: '#00c853', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                        <i className="fa-solid fa-brain"></i> AI Advisory ({activeIoTData.fieldName})
                                    </div>
                                    <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5', margin: 0 }}>
                                        {activeIoTData.metrics.soil_moisture < 40 ? (
                                            <strong>⚠️ Mild Hydration Deficit detected:</strong>
                                        ) : (
                                            <strong>🟢 Climate optimal range:</strong>
                                        )}
                                        {activeIoTData.metrics.soil_moisture < 20 ? (
                                            " Mitti me nami extremely critical low hai. Please run your drip irrigation system immediately!"
                                        ) : activeIoTData.metrics.soil_moisture < 40 ? (
                                            " Soil moisture limits are low. Watering recommended within 12 hours."
                                        ) : (
                                            " Soil moisture is healthy. Temperature is comfortable for optimal crop growth!"
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <i className="far fa-clipboard"></i>
                                    <div className="empty-title">No Recommendations</div>
                                    <div className="empty-text">Here you will see recommendations from your dealer</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Soil Moisture Card */}
                    <div className="card" onClick={() => activeIoTData && navigate(`/app?field_id=${activeIoTData.fieldId}&tab=iot`)} style={{ cursor: activeIoTData ? 'pointer' : 'default' }}>
                        <div className="card-header">
                            <i className="fas fa-tint card-icon"></i>
                            <span className="card-title">Soil Moisture Status</span>
                        </div>
                        <div className="card-body">
                            {activeIoTData && activeIoTData.metrics ? (
                                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                                    <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--krishi-dark, #1b3b2f)' }}>
                                        {activeIoTData.metrics.soil_moisture.toFixed(1)}%
                                    </div>
                                    <div style={{
                                        display: 'inline-block',
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        marginTop: '8px',
                                        background: activeIoTData.metrics.soil_moisture < 20 ? '#ea580c' : activeIoTData.metrics.soil_moisture < 40 ? '#eab308' : '#22c55e',
                                        color: 'white'
                                    }}>
                                        {activeIoTData.metrics.soil_moisture < 20 ? 'Extremely Dry' : activeIoTData.metrics.soil_moisture < 40 ? 'Dry (Water Soon)' : 'Optimal Level'}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '12px' }}>
                                        Sensor Location: {activeIoTData.channelMetadata?.name || 'IoT Station'}
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <i className="fas fa-layer-group"></i>
                                    <div className="empty-title">Install a Sensor</div>
                                    <div className="empty-text">Need to install/register a sensor?</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sensors Card */}
                    <div 
                        className="card" 
                        onClick={() => activeIoTData && navigate(`/app?field_id=${activeIoTData.fieldId}&tab=iot`)}
                        style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            padding: activeIoTData ? 0 : '24px', 
                            position: 'relative', 
                            overflow: 'hidden',
                            cursor: activeIoTData ? 'pointer' : 'default',
                            minHeight: '260px'
                        }}
                    >
                        {activeIoTData ? (
                            <>
                                {/* Floating Header Banner */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    zIndex: 10,
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    backdropFilter: 'blur(8px)',
                                    borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                                    padding: '10px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-wifi" style={{ color: 'var(--krishi-green, #22c55e)', fontSize: '13px' }}></i>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Sensors</span>
                                    </div>
                                    <span className="live-dot-pulsing" style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', display: 'inline-block' }}></span>
                                </div>

                                {/* Full-Size Leaflet Mini Map Container */}
                                <div 
                                    id="dashboard-mini-map" 
                                    style={{ 
                                        height: '100%', 
                                        width: '100%', 
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        zIndex: 1,
                                        borderRadius: '12px'
                                    }}
                                >
                                    {/* Dynamic Leaflet Mini Map Initializer hook */}
                                    {(() => {
                                        setTimeout(() => {
                                            const container = document.getElementById('dashboard-mini-map');
                                            if (!container || container._leaflet_id) return;
                                            
                                            const lat = parseFloat(activeIoTData.channelMetadata?.latitude) || -7.73055;
                                            const lon = parseFloat(activeIoTData.channelMetadata?.longitude) || 109.54030;
                                            
                                            const miniMap = L.map('dashboard-mini-map', {
                                                center: [lat, lon],
                                                zoom: 13,
                                                zoomControl: false,
                                                attributionControl: false,
                                                scrollWheelZoom: false,
                                                dragging: false
                                            });
                                            
                                            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                                                maxZoom: 19
                                            }).addTo(miniMap);
                                            
                                            // Premium green pulsing Leaflet divIcon marker
                                            const pulsingIcon = L.divIcon({
                                                className: 'mini-gps-marker',
                                                html: `
                                                    <div class="iot-marker-wrapper" style="transform: scale(0.65); transform-origin: center bottom;">
                                                        <div class="iot-marker-pulse"></div>
                                                        <div class="iot-marker-pin" style="background: #22c55e;">
                                                            <i class="fa-solid fa-tower-broadcast" style="color: white; transform: rotate(45deg);"></i>
                                                        </div>
                                                    </div>
                                                `,
                                                iconSize: [30, 30],
                                                iconAnchor: [15, 30]
                                            });
                                            
                                            L.marker([lat, lon], { icon: pulsingIcon }).addTo(miniMap);
                                            
                                            // Invalidate size helper
                                            setTimeout(() => { miniMap.invalidateSize(); }, 250);
                                            
                                            container._leaflet_id = miniMap;
                                        }, 200);
                                        return null;
                                    })()}
                                </div>

                                {/* Floating Footer Banner */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    zIndex: 10,
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    backdropFilter: 'blur(10px)',
                                    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                                    padding: '12px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={activeIoTData.channelMetadata?.name}>
                                        {activeIoTData.channelMetadata?.name || 'Active Station'}
                                    </div>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>
                                        ID: {activeIoTData.channelMetadata?.id || '1733232'} | Lat: {parseFloat(activeIoTData.channelMetadata?.latitude).toFixed(4)}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: '#334155', borderTop: '1px solid rgba(241, 245, 249, 0.8)', paddingTop: '6px', fontWeight: 600 }}>
                                        <div>🌡️ Temp: {activeIoTData.metrics?.temperature.toFixed(1)}°C</div>
                                        <div>💧 Humid: {activeIoTData.metrics?.humidity.toFixed(1)}%</div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="card-header">
                                    <i className="fas fa-wifi card-icon"></i>
                                    <span className="card-title">Sensors</span>
                                </div>
                                <div className="card-body">
                                    <div className="empty-state">
                                        <i className="far fa-calendar-alt"></i>
                                        <div className="empty-title">No Active Sensors</div>
                                        <div className="empty-text">Need to install/register a sensor? Please use the KrishiZest mobile app</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {/* Disease Advice Card (unchanged) */}
                    <div className="card">
                        <div className="card-header">
                            <i className="fas fa-virus card-icon"></i>
                            <span className="card-title">Disease Advice</span>
                        </div>
                        <div className="card-body disease-layout">
                            <div className="chart-container">
                                <canvas ref={diseaseChartRef}></canvas>
                            </div>
                            <div className="disease-list">
                                <div className="disease-item">
                                    <span><span className="status-dot dot-red"></span>Spray now</span>
                                    <span>0 &gt;</span>
                                </div>
                                <div className="disease-item">
                                    <span><span className="status-dot dot-orange"></span>Consider action</span>
                                    <span>0 &gt;</span>
                                </div>
                                <div className="disease-item">
                                    <span><span className="status-dot dot-green"></span>All clear</span>
                                    <span>0 &gt;</span>
                                </div>
                                <div className="disease-item">
                                    <span><span className="status-dot dot-grey"></span>No advice</span>
                                    <span>{fields.length} &gt;</span>
                                </div>
                            </div>
                        </div>
                        <a href="#" className="view-all-link">View all</a>
                    </div>
                </div>
            </div>

            {/* Irrigation Modal Popup */}
            {irrigationModalOpen && (
                <div className="db-modal-overlay" onClick={() => setIrrigationModalOpen(false)}>
                    <div className="db-modal-content db-modal-large" onClick={e => e.stopPropagation()}>
                        <div className="db-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                                <h2>Irrigation Calendar</h2>
                            </div>
                            <button className="db-modal-close-btn" onClick={() => setIrrigationModalOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="db-modal-body">
                            {irrigationData?.calendar?.length > 0 ? (
                                <div>
                                    {/* Summary Stats */}
                                    <div className="db-modal-stats-grid">
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-calendar-day"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">{irrigationData.summary?.irrigation_events || 0}</div>
                                                <div className="db-modal-stat-label">Total Events</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-tint"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">{irrigationData.summary?.total_water_mm?.toFixed(1) || 0} mm</div>
                                                <div className="db-modal-stat-label">Total Water</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-percentage"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">
                                                    {(() => {
                                                        const saved = irrigationData.summary?.water_saved_mm || 0;
                                                        const total = irrigationData.summary?.total_water_mm || 0;
                                                        const original = total + saved;
                                                        return original > 0 ? ((saved / original) * 100).toFixed(1) : 0;
                                                    })()}%
                                                </div>
                                                <div className="db-modal-stat-label">Water Saved</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-bell"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">{irrigationData.summary?.urgent_count || 0}</div>
                                                <div className="db-modal-stat-label">Total Urgent</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Events Table */}
                                    <h3 style={{ marginTop: 24, marginBottom: 16 }}>Irrigation Events</h3>
                                    <div className="db-modal-table-container">
                                        <table className="db-modal-table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Priority</th>
                                                    <th>Amount (mm)</th>
                                                    <th>Advice</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {irrigationData.calendar
                                                    .filter(event => event.should_irrigate)
                                                    .map((event, idx) => {
                                                        const priorityColors = {
                                                            'URGENT': '#d32f2f',
                                                            'HIGH': '#f57c00',
                                                            'MEDIUM': '#fbc02d',
                                                            'LOW': '#388e3c'
                                                        };
                                                        return (
                                                            <tr key={idx}>
                                                                <td>{new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                                                                <td>
                                                                    <span className="priority-badge" style={{ background: priorityColors[event.priority] || '#999' }}>
                                                                        {event.priority}
                                                                    </span>
                                                                </td>
                                                                <td>{event.final_irrigation_mm?.toFixed(1)}</td>
                                                                <td>{cleanAdvice(event.advice)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state" style={{ padding: 40 }}>
                                    <i className="fas fa-cloud-rain" style={{ fontSize: 48 }}></i>
                                    <div className="empty-title">No Irrigation Data</div>
                                    <div className="empty-text">Generate irrigation calendar in Field Analysis page.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Crop Health Modal Popup */}
            {cropHealthModalOpen && (
                <div className="db-modal-overlay" onClick={() => setCropHealthModalOpen(false)}>
                    <div className="db-modal-content db-modal-large" onClick={e => e.stopPropagation()}>
                        <div className="db-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                                <h2>Crop Health Analysis</h2>
                            </div>
                            <button className="db-modal-close-btn" onClick={() => setCropHealthModalOpen(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="db-modal-body">
                            {cropHealthData?.data?.length > 0 ? (
                                <div>
                                    {/* Summary Stats */}
                                    <div className="db-modal-stats-grid">
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-leaf"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">
                                                    {(() => {
                                                        const validNdviPoints = cropHealthData.data.filter(d => d.ndvi !== null && d.ndvi !== undefined);
                                                        return validNdviPoints.length > 0 
                                                            ? (validNdviPoints.reduce((sum, d) => sum + d.ndvi, 0) / validNdviPoints.length).toFixed(3)
                                                            : '—';
                                                    })()}
                                                </div>
                                                <div className="db-modal-stat-label">Avg Crop Health</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-chart-bar"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">{cropHealthData.data.length}</div>
                                                <div className="db-modal-stat-label">Data Points</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-calendar"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">
                                                    {new Date(cropHealthData.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </div>
                                                <div className="db-modal-stat-label">Start Date</div>
                                            </div>
                                        </div>
                                        <div className="db-modal-stat-card">
                                            <div className="db-modal-stat-icon">
                                                <i className="fas fa-calendar-check"></i>
                                            </div>
                                            <div className="db-modal-stat-info">
                                                <div className="db-modal-stat-value">
                                                    {new Date(cropHealthData.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </div>
                                                <div className="db-modal-stat-label">End Date</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Data Table - NDVI Only */}
                                    <h3 style={{ marginTop: 24, marginBottom: 16 }}>Crop Health Values</h3>
                                    <div className="db-modal-table-container">
                                        <table className="db-modal-table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Health value</th>
                                                    <th>Health Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cropHealthData.data.slice(0, 50).map((item, idx) => {
                                                    const ndvi = item.ndvi;
                                                    let status = 'Poor';
                                                    let statusColor = '#d32f2f';
                                                    if (ndvi === null || ndvi === undefined) {
                                                        status = 'Cloud Cover';
                                                        statusColor = '#9e9e9e';
                                                    } else if (ndvi > 0.6) {
                                                        status = 'Excellent';
                                                        statusColor = 'var(--primary-green)';
                                                    } else if (ndvi > 0.4) {
                                                        status = 'Good';
                                                        statusColor = '#4caf50';
                                                    } else if (ndvi > 0.2) {
                                                        status = 'Moderate';
                                                        statusColor = '#ff9800';
                                                    }

                                                    return (
                                                        <tr key={idx}>
                                                            <td>{new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                                                            <td style={{ fontWeight: 600, color: statusColor }}>
                                                                {item.ndvi?.toFixed(3) || '—'}
                                                            </td>
                                                            <td>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '4px 12px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600,
                                                                    color: 'white',
                                                                    background: statusColor
                                                                }}>
                                                                    {status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state" style={{ padding: 40 }}>
                                    <i className="fas fa-leaf" style={{ fontSize: 48 }}></i>
                                    <div className="empty-title">No Crop Health Data</div>
                                    <div className="empty-text">Fetch data in Field Analysis page first.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;