import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFields, deleteField, updateField, getUserAreaSummary } from '../utils/api';
import toast, { Toaster } from 'react-hot-toast';
import Swal from 'sweetalert2';
import './Fields.css';

function Fields() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [dbAreaSummary, setDbAreaSummary] = useState(null);

    // Search, Filter, Sort and View Mode States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('All');
    const [selectedVillage, setSelectedVillage] = useState('All');
    const [sortBy, setSortBy] = useState('newest');
    const [viewMode, setViewMode] = useState('grid');

    // Dark mode
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

    // Load fields
    useEffect(() => {
        async function loadFields() {
            try {
                // Try to fetch from backend using centralized API
                const data = await getFields();
                setFields(data);
            } catch (error) {
                console.log('Using localStorage for fields');
                // Fallback to localStorage
                const storedFields = JSON.parse(localStorage.getItem('fields') || '[]');
                setFields(storedFields);
            } finally {
                setLoading(false);
            }
        }

        loadFields();
    }, []);

    // Fetch DB area summary (authoritative total via SQL SUM)
    useEffect(() => {
        async function fetchAreaSummary() {
            try {
                const summary = await getUserAreaSummary();
                if (summary?.success) {
                    setDbAreaSummary(summary);
                }
            } catch (e) {
                // silent fallback - local computation is used
            }
        }
        fetchAreaSummary();
    }, [fields]);

    // Dynamic Filter Categories
    const uniqueDistricts = ['All', ...new Set(fields.map(f => f.district || 'NA').filter(Boolean))];
    const uniqueVillages = ['All', ...new Set(
        fields
            .filter(f => selectedDistrict === 'All' || (f.district || 'NA') === selectedDistrict)
            .map(f => f.village || 'NA')
            .filter(Boolean)
    )];

    // Live filter and sort
    const filteredAndSortedFields = fields
        .filter(field => {
            const nameMatch = field.name.toLowerCase().includes(searchQuery.toLowerCase());
            const villageMatch = (field.village || 'NA').toLowerCase().includes(searchQuery.toLowerCase());
            const districtMatch = (field.district || 'NA').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesSearch = nameMatch || villageMatch || districtMatch;

            const matchesDistrict = selectedDistrict === 'All' || (field.district || 'NA') === selectedDistrict;
            const matchesVillage = selectedVillage === 'All' || (field.village || 'NA') === selectedVillage;

            return matchesSearch && matchesDistrict && matchesVillage;
        })
        .sort((a, b) => {
            const getArea = (f) => {
                if (f.areaAcres != null && f.areaAcres !== '') return parseFloat(f.areaAcres) || 0;
                if (f.areaHectares != null && f.areaHectares !== '') return (parseFloat(f.areaHectares) || 0) * 2.47105;
                return 0;
            };

            if (sortBy === 'newest') {
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            } else if (sortBy === 'oldest') {
                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            } else if (sortBy === 'area-desc') {
                return getArea(b) - getArea(a);
            } else if (sortBy === 'area-asc') {
                return getArea(a) - getArea(b);
            } else if (sortBy === 'name-asc') {
                return a.name.localeCompare(b.name);
            }
            return 0;
        });

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleFieldClick = (field) => {
        navigate(`/app?field_id=${field.id}`);
    };
    const handleEditField = async (e, field) => {
        // CRITICAL: Stop ALL event propagation
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent) {
            e.nativeEvent.stopImmediatePropagation();
        }

        const initialDistrict = (field.district && field.district !== 'NA') ? field.district : '';
        const initialVillage = (field.village && field.village !== 'NA') ? field.village : '';

        const { value: formValues } = await Swal.fire({
            title: 'Edit Field Details <span style="font-size:18px; color:gray; font-weight:normal; display:block;">खेत का विवरण संपादित करें</span>',
            html: `
                <div style="display: flex; flex-direction: column; gap: 14px; text-align: left; padding-top: 5px;">
                    <div>
                        <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                            Field Name * <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ खेत का नाम</span>
                        </label>
                        <input id="swal-name" class="swal2-input" value="${field.name || ''}" placeholder="e.g., North Field" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                District <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ ज़िला</span>
                            </label>
                            <input id="swal-district" class="swal2-input" value="${initialDistrict}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                Village <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ गाँव</span>
                            </label>
                            <input id="swal-village" class="swal2-input" value="${initialVillage}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
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
                            <input type="date" id="swal-sowing-date" class="swal2-input" value="${field.sowingDate || ''}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: block;">
                                Harvesting Date <span style="font-size: 12px; color: gray; font-weight: normal; margin-left: 4px;">/ कटाई की तिथि</span>
                            </label>
                            <input type="date" id="swal-harvesting-date" class="swal2-input" value="${field.harvestingDate || ''}" style="margin: 0; width: 100%; height: 2.5rem; font-size: 14px;">
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
                const customCropInput = document.getElementById('swal-custom-crop-name');

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

                // Pre-fill fields logic
                if (field.cropType) {
                    cropTypeSelect.value = field.cropType;
                    updateCropNames();
                    
                    if (field.cropName) {
                        const isPredefined = cropOptions[field.cropType]?.some(c => c.value === field.cropName);
                        if (isPredefined) {
                            cropNameSelect.value = field.cropName;
                        } else {
                            cropNameSelect.value = 'Other';
                            customCropContainer.style.display = 'block';
                            customCropInput.value = field.cropName;
                        }
                    }
                }
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
            try {
                // Step 1: Backend Update
                await updateField(field.id, {
                    name: formValues.name,
                    district: formValues.district || 'NA',
                    village: formValues.village || 'NA',
                    cropType: formValues.cropType,
                    cropName: formValues.cropName,
                    sowingDate: formValues.sowingDate,
                    harvestingDate: formValues.harvestingDate
                });

                // Step 2: Local State Update
                setFields(prevFields =>
                    prevFields.map(f => f.id === field.id ? { 
                        ...f, 
                        name: formValues.name,
                        district: formValues.district || 'NA',
                        village: formValues.village || 'NA',
                        cropType: formValues.cropType,
                        cropName: formValues.cropName,
                        sowingDate: formValues.sowingDate,
                        harvestingDate: formValues.harvestingDate
                    } : f)
                );

                // Step 3: Update localStorage Fallback
                const storedFields = JSON.parse(localStorage.getItem('fields') || '[]');
                const updatedStoredFields = storedFields.map(f => f.id === field.id ? { 
                    ...f, 
                    name: formValues.name,
                    district: formValues.district || 'NA',
                    village: formValues.village || 'NA',
                    cropType: formValues.cropType,
                    cropName: formValues.cropName,
                    sowingDate: formValues.sowingDate,
                    harvestingDate: formValues.harvestingDate
                } : f);
                localStorage.setItem('fields', JSON.stringify(updatedStoredFields));

                toast.success('Field details updated successfully!');
            } catch (error) {
                console.error('⚠️ Error updating field details:', error);
                toast.error('Failed to update field details.');
            }
        }
    };

    const handleDeleteField = async (e, fieldId) => {
        // CRITICAL: Stop ALL event propagation
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent) {
            e.nativeEvent.stopImmediatePropagation();
        }

        const isConfirmed = window.confirm('Are you sure you want to delete this field? This cannot be undone!');

        if (isConfirmed) {
            // Step 1: Immediately perform local deletion (optimistic or guaranteed local removal)
            // We do this BEFORE the fetch request so that local state is updated immediately
            // upon confirmation, satisfying the user's requirement to see the card disappear.

            const deleteLocally = () => {
                clearFieldData(fieldId);

                setFields(prevFields => {
                    const updatedFields = prevFields.filter(f => f.id !== fieldId);
                    localStorage.setItem('fields', JSON.stringify(updatedFields));
                    return updatedFields;
                });
            };

            try {
                // Attempt backend deletion using centralized API
                await deleteField(fieldId);

                // Backend deletion succeeded, now delete locally
                deleteLocally();
                toast.success('Field deleted successfully!');
                console.log('✅ Field deleted successfully (Backend confirmed):', fieldId);
            } catch (error) {
                // This handles both network errors and backend failures
                // Delete locally and log the error
                deleteLocally();
                console.error('⚠️ Deletion error, but removed locally:', error);
            }

            // IMPORTANT: No alert is shown for the error path, fulfilling the user's request.
        }
    };

    // Helper function to clear all field-related data from localStorage
    const clearFieldData = (fieldId) => {
        // Clear crop health data if it matches this field
        const cropHealthData = localStorage.getItem('lastCropHealthData');
        if (cropHealthData) {
            try {
                const parsed = JSON.parse(cropHealthData);
                // If the data is associated with this field, remove it
                // (You might want to add field_id tracking to crop health data)
                localStorage.removeItem('lastCropHealthData');
            } catch (e) {
                console.error('Error parsing crop health data:', e);
            }
        }

        // Clear any field-specific cache keys
        // Pattern: field_<fieldId>_*
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes(`field_${fieldId}`)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`Cleared localStorage key: ${key}`);
        });

        console.log(`✅ Cleared all data associated with field ${fieldId}`);
    };

    const totalArea = fields.reduce((sum, f) => {
        if (f.areaAcres != null && f.areaAcres !== '') {
            return sum + (parseFloat(f.areaAcres) || 0);
        } else if (f.areaHectares != null && f.areaHectares !== '') {
            return sum + (parseFloat(f.areaHectares) || 0) * 2.47105;
        }
        return sum;
    }, 0);

    return (
        <div className="fields-page">
            <Toaster position="top-center" reverseOrder={false} />


            {/* Header */}
            <header className="fields-header">
                <div className="nav-left">
                    <Link to="/dashboard" className="brand">
                        <img src="/static/Logo.jpg" alt="KrishiZest" style={{ height: 48 }} />
                    </Link>
                    <nav className="nav-links">
                        <Link to="/dashboard" className="nav-link">Dashboard</Link>
                        <Link to="/fields" className="nav-link active">Fields</Link>
                        <Link to="/expenditures" className="nav-link">Expenditures</Link>
                    </nav>
                </div>
                <div className="nav-right">
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
            <div className="fields-container">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">My Fields</h1>
                        <p className="page-subtitle">
                            {(dbAreaSummary ? dbAreaSummary.fieldCount : fields.length)} fields
                            &nbsp;&bull;&nbsp;
                            Total area:&nbsp;
                            <strong>
                                {dbAreaSummary
                                    ? `${dbAreaSummary.totalAcres.toFixed(2)} acres (${dbAreaSummary.totalHectares.toFixed(2)} ha)`
                                    : `${totalArea.toFixed(2)} acres`
                                }
                            </strong>
                            {dbAreaSummary && (
                                <span
                                    title="Sourced directly from database"
                                    style={{
                                        marginLeft: 6,
                                        fontSize: 10,
                                        background: 'rgba(47,122,47,0.12)',
                                        color: 'var(--primary-green)',
                                        borderRadius: 4,
                                        padding: '1px 5px',
                                        fontWeight: 600,
                                        verticalAlign: 'middle'
                                    }}
                                >
                                    {/* <i className="fas fa-database" style={{ fontSize: 8, marginRight: 3 }}></i>DB */}
                                </span>
                            )}
                        </p>
                    </div>
                    <Link to="/create-field" className="btn btn-primary">
                        <i className="fas fa-plus"></i> New Field
                    </Link>
                </div>

                {/* Scalability Control Panel */}
                {fields.length > 0 && (
                    <div className="fields-controls">
                        <div className="controls-left">
                            <div className="search-box">
                                <i className="fas fa-search search-icon"></i>
                                <input
                                    type="text"
                                    placeholder="Search by name, village, or district..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="search-input"
                                />
                                {searchQuery && (
                                    <button className="clear-search" onClick={() => setSearchQuery('')} title="Clear search">
                                        <i className="fas fa-times"></i>
                                    </button>
                                )}
                            </div>
                            <div className="filter-group">
                                <select
                                    value={selectedDistrict}
                                    onChange={(e) => {
                                        setSelectedDistrict(e.target.value);
                                        setSelectedVillage('All'); // Reset village filter when district changes
                                    }}
                                    className="filter-select"
                                >
                                    <option value="All">All Districts</option>
                                    {uniqueDistricts.filter(d => d !== 'All').map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                                <select
                                    value={selectedVillage}
                                    onChange={(e) => setSelectedVillage(e.target.value)}
                                    className="filter-select"
                                >
                                    <option value="All">All Villages</option>
                                    {uniqueVillages.filter(v => v !== 'All').map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="filter-select sort-select"
                                >
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="area-desc">Largest Area</option>
                                    <option value="area-asc">Smallest Area</option>
                                    <option value="name-asc">Alphabetical (A-Z)</option>
                                </select>
                            </div>
                        </div>
                        <div className="controls-right">
                            <div className="view-toggle">
                                <button
                                    className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid View"
                                >
                                    <i className="fas fa-th-large"></i>
                                </button>
                                <button
                                    className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List View"
                                >
                                    <i className="fas fa-list"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="loading-state">
                        <i className="fas fa-circle-notch fa-spin"></i>
                        <p>Loading fields...</p>
                    </div>
                ) : fields.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <i className="fas fa-map-marked-alt"></i>
                        </div>
                        <h2>No Fields Yet</h2>
                        <p>Create your first field to start monitoring your crops with satellite data.</p>
                        <Link to="/create-field" className="btn btn-primary">
                            <i className="fas fa-plus"></i> Create Field
                        </Link>
                    </div>
                ) : filteredAndSortedFields.length === 0 ? (
                    <div className="empty-state search-empty-state">
                        <div className="empty-icon filter-empty-icon">
                            <i className="fas fa-search-minus"></i>
                        </div>
                        <h2>No Matches Found</h2>
                        <p>We couldn't find any fields matching your search queries or selected filters.</p>
                        <button className="btn btn-primary" onClick={() => {
                            setSearchQuery('');
                            setSelectedDistrict('All');
                            setSelectedVillage('All');
                        }}>
                            Clear Filters
                        </button>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="fields-grid">
                        {filteredAndSortedFields.map((field, index) => {
                            const originalIndex = fields.findIndex(f => f.id === field.id);
                            return (
                                <div
                                    key={field.id}
                                    className="field-card"
                                    onClick={() => handleFieldClick(field)}
                                >
                                    <div className="field-card-top">
                                        <span className="field-badge">Field {originalIndex !== -1 ? originalIndex + 1 : index + 1}</span>
                                        <div className="field-actions">
                                            <button
                                                className="field-edit-btn"
                                                onClick={(e) => handleEditField(e, field)}
                                                title="Edit Name"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                className="field-delete-btn"
                                                onClick={(e) => handleDeleteField(e, field.id)}
                                                title="Delete"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="field-card-body">
                                        <h3 className="field-name">{field.name}</h3>
                                        <div className="field-location" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: 'var(--primary-green)' }}></i>
                                            <span>{field.village || 'NA'}, {field.district || 'NA'}</span>
                                        </div>
                                        {(field.cropType || field.cropName) && (
                                            <div className="field-crop-info" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="fas fa-seedling" style={{ color: 'var(--primary-green)' }}></i>
                                                <span>{field.cropName || field.cropType} {field.cropName && field.cropType ? `(${field.cropType})` : ''}</span>
                                            </div>
                                        )}
                                        {field.sowingDate && (
                                            <div className="field-sowing-info" style={{ fontSize: '0.8rem', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="far fa-calendar-alt" style={{ color: 'var(--primary-green)' }}></i>
                                                <span>Sowed: {field.sowingDate} {field.harvestingDate ? `| Harvest: ${field.harvestingDate}` : ''}</span>
                                            </div>
                                        )}
                                        <div className="field-stats">
                                            <div className="field-stat">
                                                <span className="stat-value">{field.areaHectares}</span>
                                                <span className="stat-label">Hectares</span>
                                            </div>
                                            <div className="field-divider"></div>
                                            <div className="field-stat">
                                                <span className="stat-value">{field.areaAcres}</span>
                                                <span className="stat-label">Acres</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="field-card-footer">
                                        <span className="field-footer-text">View Analysis</span>
                                        <i className="fas fa-arrow-right"></i>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="fields-list-view">
                        <table className="fields-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Field Name</th>
                                    <th>Location (Village, District)</th>
                                    <th>Crop</th>
                                    <th>Dates (Sowing / Harvesting)</th>
                                    <th>Area (Hectares)</th>
                                    <th>Area (Acres)</th>
                                    <th className="actions-header">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSortedFields.map((field, index) => {
                                    const originalIndex = fields.findIndex(f => f.id === field.id);
                                    return (
                                        <tr
                                            key={field.id}
                                            className="table-row"
                                            onClick={() => handleFieldClick(field)}
                                        >
                                            <td className="row-badge-col">
                                                <span className="row-badge">Field {originalIndex !== -1 ? originalIndex + 1 : index + 1}</span>
                                            </td>
                                            <td className="row-name-col">
                                                <span className="row-name">{field.name}</span>
                                            </td>
                                            <td className="row-location-col">
                                                <div className="row-location">
                                                    <i className="fas fa-map-marker-alt marker-icon"></i>
                                                    <span>{field.village || 'NA'}, {field.district || 'NA'}</span>
                                                </div>
                                            </td>
                                            <td className="row-crop-col">
                                                {field.cropName || field.cropType ? (
                                                    <div className="row-crop" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#555' }}>
                                                        <i className="fas fa-seedling" style={{ color: 'var(--primary-green)' }}></i>
                                                        <span>{field.cropName || field.cropType}</span>
                                                    </div>
                                                ) : <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Not specified / निर्दिष्ट नहीं</span>}
                                            </td>
                                            <td className="row-dates-col">
                                                {field.sowingDate ? (
                                                    <div style={{ fontSize: '0.85rem', color: '#555' }}>
                                                        <div><strong style={{color: '#888', fontWeight: 500}}>S:</strong> {field.sowingDate}</div>
                                                        {field.harvestingDate && <div><strong style={{color: '#888', fontWeight: 500}}>H:</strong> {field.harvestingDate}</div>}
                                                    </div>
                                                ) : <span style={{ color: '#aaa', fontSize: '0.85rem' }}>N/A</span>}
                                            </td>
                                            <td className="row-stat-col">{field.areaHectares} ha</td>
                                            <td className="row-stat-col">{field.areaAcres} ac</td>
                                            <td className="row-actions-col" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="table-action-btn edit-btn"
                                                    onClick={(e) => handleEditField(e, field)}
                                                    title="Edit Name"
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    className="table-action-btn delete-btn"
                                                    onClick={(e) => handleDeleteField(e, field.id)}
                                                    title="Delete Field"
                                                >
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                                <button
                                                    className="table-action-btn go-btn"
                                                    onClick={() => handleFieldClick(field)}
                                                    title="View Analysis"
                                                >
                                                    <i className="fas fa-chevron-right"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Fields;
