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

        const { value: newName } = await Swal.fire({
            title: 'Edit Field Name',
            input: 'text',
            inputLabel: 'Enter new field name',
            inputValue: field.name,
            showCancelButton: true,
            inputValidator: (value) => {
                if (!value) {
                    return 'Field name cannot be empty!';
                }
            },
            confirmButtonColor: 'var(--krishi-green)',
            cancelButtonColor: '#d33',
            customClass: {
                popup: 'premium-swal-popup',
                title: 'premium-swal-title',
                confirmButton: 'premium-swal-button',
                cancelButton: 'premium-swal-button-secondary'
            }
        });

        if (newName && newName !== field.name) {
            try {
                // Step 1: Backend Update
                await updateField(field.id, { name: newName });

                // Step 2: Local State Update
                setFields(prevFields =>
                    prevFields.map(f => f.id === field.id ? { ...f, name: newName } : f)
                );

                // Step 3: Update localStorage Fallback
                const storedFields = JSON.parse(localStorage.getItem('fields') || '[]');
                const updatedStoredFields = storedFields.map(f => f.id === field.id ? { ...f, name: newName } : f);
                localStorage.setItem('fields', JSON.stringify(updatedStoredFields));

                toast.success('Field name updated successfully!');
            } catch (error) {
                console.error('⚠️ Error updating field name:', error);
                toast.error('Failed to update field name.');
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
                                            <div className="field-crop-info" style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="fas fa-seedling" style={{ color: 'var(--primary-green)' }}></i>
                                                <span>{field.cropName || field.cropType} {field.cropName && field.cropType ? `(${field.cropType})` : ''}</span>
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
                                                ) : <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Not specified</span>}
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
