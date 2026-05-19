import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import Swal from 'sweetalert2';
import { saveField, searchLocation as apiSearchLocation, getLocationDetails } from '../utils/api';
import { kml } from '@mapbox/togeojson';
import './CreateField.css';

// Fix for leaflet-draw geodesicArea
if (L.GeometryUtil && !L.GeometryUtil.geodesicArea) {
    L.GeometryUtil.geodesicArea = function (latLngs) {
        const pointsCount = latLngs.length;
        let area = 0.0;
        const d2r = Math.PI / 180;

        if (pointsCount > 2) {
            for (let i = 0; i < pointsCount; i++) {
                const p1 = latLngs[i];
                const p2 = latLngs[(i + 1) % pointsCount];
                area += ((p2.lng - p1.lng) * d2r) *
                    (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
            }
            area = area * 6378137.0 * 6378137.0 / 2.0;
        }
        return Math.abs(area);
    };
}

// Fix for leaflet-draw readableArea error (type is not defined)
if (L.GeometryUtil) {
    L.GeometryUtil.readableArea = function (area, isMetric, precision) {
        if (typeof precision === 'undefined') precision = 2;
        if (typeof isMetric === 'undefined') isMetric = true;

        var areaStr;
        if (isMetric) {
            if (area >= 10000) {
                areaStr = (area / 10000).toFixed(precision) + ' ha';
            } else {
                areaStr = area.toFixed(precision) + ' m²';
            }
        } else {
            area /= 0.836127; // sq yards
            if (area >= 3097600) { // sq miles
                areaStr = (area / 3097600).toFixed(precision) + ' mi²';
            } else if (area >= 4840) { // acres
                areaStr = (area / 4840).toFixed(precision) + ' acres';
            } else {
                areaStr = Math.ceil(area) + ' yd²';
            }
        }
        return areaStr;
    };
}

function CreateField() {
    const navigate = useNavigate();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const drawnItemsRef = useRef(null);
    const currentLayerRef = useRef(null);
    const drawHandlerRef = useRef(null);
    const editHandlerRef = useRef(null);

    const [showOverlay, setShowOverlay] = useState(false);
    const [showToolbar, setShowToolbar] = useState(true);
    const [showFieldInfo, setShowFieldInfo] = useState(false);
    const [fieldInfo, setFieldInfo] = useState({ area: '-', type: '-', perimeter: '-' });
    const [activeTool, setActiveTool] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [toolbarPos, setToolbarPos] = useState({ x: null, y: null });
    const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const toolbarRef = useRef(null);
    const searchMarkerRef = useRef(null); // Ref for search marker

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        const hybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            attribution: '&copy; Google Maps',
            maxZoom: 23,
            maxNativeZoom: 19,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 23,
            maxNativeZoom: 19
        });

        const map = L.map(mapRef.current, {
            zoomControl: false,
            center: [20.5937, 78.9629],
            zoom: 5,
            minZoom: 1,
            maxZoom: 23,
            layers: [hybridLayer]
        });

        mapInstanceRef.current = map;

        // ADD THIS SECTION
        L.control.scale({
            metric: true,
            imperial: false,
            position: 'topleft'
        }).addTo(map);


        // Layer control
        L.control.layers({ "Hybrid Map": hybridLayer, "Street Map": streetLayer },
            null, { position: 'topright' }).addTo(map);

        // Initialize drawn items layer
        const drawnItems = new L.FeatureGroup().addTo(map);
        drawnItemsRef.current = drawnItems;

        // Try to get user's location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Safely check if map is still valid using the ref
                    if (mapInstanceRef.current && mapInstanceRef.current.getContainer()) {
                        mapInstanceRef.current.setView([position.coords.latitude, position.coords.longitude], 13);
                    }
                },
                () => console.log('Location access denied')
            );
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Get layer type
    const getLayerType = (layer) => {
        if (layer instanceof L.Circle) return 'circle';
        if (layer instanceof L.Rectangle) return 'rectangle';
        if (layer instanceof L.Polygon) return 'polygon';
        return 'unknown';
    };

    // Update field information
    const updateFieldInfo = useCallback((layer, type) => {
        let area = 0;
        let perimeter = 0;

        if (type === 'circle') {
            const radius = layer.getRadius();
            area = Math.PI * radius * radius;
            perimeter = 2 * Math.PI * radius;
        } else if (type === 'rectangle' || type === 'polygon') {
            area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
            const latlngs = layer.getLatLngs()[0];
            for (let i = 0; i < latlngs.length; i++) {
                const p1 = latlngs[i];
                const p2 = latlngs[(i + 1) % latlngs.length];
                perimeter += p1.distanceTo(p2);
            }
        }

        const hectares = (area / 10000).toFixed(2);
        const acres = (area / 4046.86).toFixed(2);

        setFieldInfo({
            area: `${hectares} ha (${acres} acres)`,
            type: type.charAt(0).toUpperCase() + type.slice(1),
            perimeter: `${(perimeter / 1000).toFixed(2)} km`
        });
    }, []);

    // Enable drawing mode
    const enableDrawing = () => {
        setShowOverlay(false);
        setShowToolbar(true);
    };

    // Start drawing
    const startDraw = (type) => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (currentLayerRef.current) {
            Swal.fire({
                text: 'Please delete the existing field before drawing a new one.',
                icon: 'warning',
                timer: 2000,
                showConfirmButton: false
            });
            return;
        }

        if (drawHandlerRef.current) {
            drawHandlerRef.current.disable();
        }

        setActiveTool(type);

        const shapeOptions = { color: '#ffffff', weight: 3, fillOpacity: 0 };

        if (type === 'polygon') {
            drawHandlerRef.current = new L.Draw.Polygon(map, {
                shapeOptions,
                allowIntersection: false,
                showArea: true
            });
        } else if (type === 'rectangle') {
            drawHandlerRef.current = new L.Draw.Rectangle(map, { shapeOptions });
        }

        drawHandlerRef.current.enable();
    };

    // Setup draw events
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        const handleCreated = (event) => {
            const layer = event.layer;
            const type = event.layerType;

            drawnItemsRef.current.addLayer(layer);
            currentLayerRef.current = layer;

            setActiveTool(null);
            updateFieldInfo(layer, type);
            setShowFieldInfo(true);
        };

        const handleEdited = (event) => {
            const layers = event.layers;
            layers.eachLayer((layer) => {
                updateFieldInfo(layer, getLayerType(layer));
            });
        };

        map.on(L.Draw.Event.CREATED, handleCreated);
        map.on(L.Draw.Event.EDITED, handleEdited);

        return () => {
            map.off(L.Draw.Event.CREATED, handleCreated);
            map.off(L.Draw.Event.EDITED, handleEdited);
        };
    }, [updateFieldInfo]);

    // Toggle edit mode
    const toggleEdit = () => {
        const map = mapInstanceRef.current;
        if (!map || !currentLayerRef.current) return;

        if (!editHandlerRef.current) {
            editHandlerRef.current = new L.EditToolbar.Edit(map, {
                featureGroup: drawnItemsRef.current,
                selectedPathOptions: { maintainColor: true }
            });
        }

        if (activeTool === 'edit') {
            editHandlerRef.current.disable();
            editHandlerRef.current.save();
            setActiveTool(null);
        } else {
            editHandlerRef.current.enable();
            setActiveTool('edit');
        }
    };

    // Delete layer
    const deleteLayer = () => {
        if (!currentLayerRef.current) return;

        Swal.fire({
            title: 'Delete Field?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                drawnItemsRef.current.clearLayers();
                currentLayerRef.current = null;
                setShowFieldInfo(false);
                if (editHandlerRef.current) editHandlerRef.current.disable();
                setActiveTool(null);
            }
        });
    };

    // Save field
    const handleSave = async () => {
        if (!currentLayerRef.current) {
            Swal.fire({
                icon: 'warning',
                title: 'No Field Drawn',
                text: 'Please draw a field before saving.',
                confirmButtonColor: '#2f7a2f'
            });
            return;
        }

        const layer = currentLayerRef.current;
        const type = getLayerType(layer);
        let geometry;
        let area = 0;
        let center = null;

        if (type === 'circle') {
            const centerPt = layer.getLatLng();
            const radius = layer.getRadius();
            geometry = { type: 'Circle', center: [centerPt.lat, centerPt.lng], radius };
            area = Math.PI * radius * radius;
            center = centerPt;
        } else {
            geometry = layer.toGeoJSON().geometry;
            area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
            center = layer.getBounds().getCenter();
        }

        // Show loading state while fetching location details
        Swal.fire({
            title: 'Gathering Information...',
            text: 'Fetching location details based on drawn area...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Fetch district and village based on center
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

        // Close loading modal before showing the input form
        Swal.close();

        const { value: formValues } = await Swal.fire({
            title: 'Field Details <span style="font-size:18px; color:gray; font-weight:normal; display:block;">खेत का विवरण</span>',
            html: `
                <div style="display: flex; flex-direction: column; gap: 14px; text-align: left; padding-top: 5px;">
                    <div>
                        <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                            Field Name * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ खेत का नाम</span>
                        </label>
                        <input id="swal-name" class="swal2-input" placeholder="e.g., North Field" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
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
                                Village <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ गाँव</span>
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

                    // Add Other option
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
                title: 'Saving...',
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
                harvestingDate: formValues.harvestingDate
            };

            let backendId = null;
            let backendSaved = false;

            try {
                const result = await saveField(payload);
                if (result.success) {
                    backendId = result.id;
                    backendSaved = true;
                }
            } catch (error) {
                // Check if it's a duplicate name error (409)
                if (error.message && error.message.includes('Field name already exists')) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Duplicate Name',
                        text: 'This field name is already taken. Please choose another.',
                        confirmButtonColor: '#d33'
                    });
                    return; // Stop saving process
                }
                console.log('Backend save failed, using local storage');
            }

            // Local storage fallback
            const newField = {
                id: backendId || Date.now().toString(),
                ...payload
            };

            const fieldsLS = JSON.parse(localStorage.getItem('fields') || '[]');
            const updatedFields = [...fieldsLS, newField];
            localStorage.setItem('fields', JSON.stringify(updatedFields));

            await Swal.fire({
                icon: 'success',
                title: backendSaved ? 'Field Saved!' : 'Field Saved Locally',
                text: backendSaved
                    ? `"${formValues.name}" has been saved successfully.`
                    : `"${formValues.name}" has been saved to your browser (Backend unavailable).`,
                timer: 2000,
                confirmButtonColor: '#2f7a2f'
            });
            navigate(`/app?field_id=${newField.id}`);
        }
    };

    // Cancel field creation
    const cancelCreation = () => {
        if (currentLayerRef.current) {
            Swal.fire({
                title: 'Discard Changes?',
                text: 'Your drawn field will be lost.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#999',
                confirmButtonText: 'Yes, discard',
                cancelButtonText: 'Continue editing'
            }).then((result) => {
                if (result.isConfirmed) {
                    navigate('/dashboard');
                }
            });
        } else {
            navigate('/dashboard');
        }
    };

    // Initialize toolbar position
    useEffect(() => {
        if (toolbarPos.x === null && toolbarPos.y === null) {
            const defaultX = window.innerWidth / 2 - 160;
            const defaultY = window.innerHeight - 90;
            setToolbarPos({ x: defaultX, y: defaultY });
        }
    }, [toolbarPos]);

    // Toolbar drag handlers
    const handleToolbarMouseDown = (e) => {
        if (!toolbarRef.current) return;
        // Skip dragging when clicking on buttons
        if (e.target.closest('button')) return;
        setIsDraggingToolbar(true);
        const rect = toolbarRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDraggingToolbar) return;
            setToolbarPos({
                x: e.clientX - dragOffsetRef.current.x,
                y: e.clientY - dragOffsetRef.current.y,
            });
        };

        const handleMouseUp = () => setIsDraggingToolbar(false);

        if (isDraggingToolbar) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingToolbar]);

    const customIcon = L.icon({
        iconUrl: '/static/marker.png', // Apni nayi image ka path yahan dalein
        iconSize: [38, 38],              // Image ki size (width, height)
        iconAnchor: [19, 38],            // Wo point jahan marker map ko touch karega (bottom center)
        popupAnchor: [0, -38]            // Popup image ke kitna upar khulega
    });


    // Search location
    const searchMapLocation = async () => {
        if (!searchQuery) return;
        setIsSearching(true);

        try {
            const data = await apiSearchLocation(searchQuery);

            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                const latLng = [parseFloat(lat), parseFloat(lon)];

                // Clear existing marker
                if (searchMarkerRef.current) {
                    mapInstanceRef.current.removeLayer(searchMarkerRef.current);
                }

                // Add new marker
                const marker = L.marker(latLng, { icon: customIcon }).addTo(mapInstanceRef.current);
                marker.bindPopup(display_name).openPopup();
                searchMarkerRef.current = marker;

                mapInstanceRef.current?.flyTo(latLng, 16);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Location not found',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                });
            }
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Handle file upload
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let geojson;
                const content = e.target.result;

                if (file.name.toLowerCase().endsWith('.kml')) {
                    const parser = new DOMParser();
                    const kmlDom = parser.parseFromString(content, 'text/xml');
                    geojson = kml(kmlDom);
                } else {
                    geojson = JSON.parse(content);
                }

                if (geojson) {
                    // Start fresh
                    drawnItemsRef.current.clearLayers();
                    currentLayerRef.current = null;

                    let feature;

                    // Handle different GeoJSON structures
                    if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length > 0) {
                        feature = geojson.features[0];
                    } else if (geojson.type === 'Feature') {
                        feature = geojson;
                    } else if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
                        feature = { type: 'Feature', geometry: geojson };
                    }

                    if (feature) {
                        const layer = L.geoJSON(feature, {
                            style: { color: '#ffffff', weight: 3, fillOpacity: 0 }
                        }).getLayers()[0];

                        if (layer) {
                            drawnItemsRef.current.addLayer(layer);
                            currentLayerRef.current = layer;

                            const type = getLayerType(layer);
                            updateFieldInfo(layer, type);

                            if (layer.getBounds) {
                                mapInstanceRef.current?.fitBounds(layer.getBounds());
                            }

                            setShowOverlay(false);
                            setShowToolbar(true);
                            setShowFieldInfo(true);

                            Swal.fire({
                                icon: 'success',
                                title: 'File Uploaded',
                                text: 'Field boundary loaded successfully!',
                                timer: 1500,
                                showConfirmButton: false
                            });
                        } else {
                            throw new Error('Could not create layer from feature');
                        }
                    } else {
                        throw new Error('No valid feature found in file');
                    }
                }
            } catch (error) {
                console.error('File parse error:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Invalid File',
                    text: 'Could not parse the file. Please ensure it is valid GeoJSON or KML.'
                });
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="create-field-page">
            {/* Header */}
            <header className="create-field-header">
                <div className="header-left">
                    <Link to="/dashboard" className="brand">
                        <img src="/static/Logo.jpg" alt="KrishiZest" style={{ height: 48 }} />
                    </Link>
                </div>

                <div className="search-container">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search location..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchMapLocation()}
                    />
                    <button className="search-btn" onClick={searchMapLocation}>
                        <i className={`fas ${isSearching ? 'fa-spinner fa-spin' : 'fa-search'}`}></i>
                    </button>
                </div>

                <div className="header-actions">
                    <input
                        type="file"
                        id="fileInput"
                        accept=".kml,.geojson,.json"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <button className="btn btn-secondary" onClick={() => document.getElementById('fileInput').click()}>
                        <i className="fas fa-upload"></i>
                        Upload
                    </button>
                    <button className="btn btn-secondary" onClick={cancelCreation}>
                        <i className="fas fa-times"></i>
                        Exit
                    </button>
                </div>
            </header>

            {/* Map */}
            <div ref={mapRef} className="create-field-map"></div>

            {/* Start Overlay */}


            {/* Floating Toolbar */}
            {showToolbar && toolbarPos.x !== null && toolbarPos.y !== null && (
                <div
                    ref={toolbarRef}
                    className={`floating-toolbar ${isDraggingToolbar ? 'dragging' : ''}`}
                    style={{ left: toolbarPos.x, top: toolbarPos.y }}
                    onMouseDown={handleToolbarMouseDown}
                >
                    <div className="toolbar-drag-handle" title="Drag toolbar">
                        <i className="fas fa-arrows-alt"></i>
                    </div>
                    <button
                        className={`tool-btn ${activeTool === 'polygon' ? 'active' : ''}`}
                        onClick={() => startDraw('polygon')}
                        title="Draw Polygon"
                    >
                        <i className="fas fa-draw-polygon"></i>
                    </button>
                    <button
                        className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
                        onClick={() => startDraw('rectangle')}
                        title="Draw Rectangle"
                    >
                        <i className="far fa-square"></i>
                    </button>
                    <div className="divider"></div>
                    <button
                        className={`tool-btn ${activeTool === 'edit' ? 'active' : ''}`}
                        onClick={toggleEdit}
                        title="Edit Shape"
                    >
                        <i className="fas fa-pen"></i>
                    </button>
                    <button className="tool-btn save-btn" onClick={handleSave} title="Save Field">
                        <i className="fas fa-check"></i>
                    </button>
                    <button className="tool-btn delete-btn" onClick={deleteLayer} title="Delete Shape">
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            )}

            {/* Field Info Panel */}
            {showFieldInfo && (
                <div className="field-info">
                    <div className="area">{fieldInfo.area}</div>
                    <div className="meta">
                        <span>{fieldInfo.type}</span> • <span>{fieldInfo.perimeter}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CreateField;
