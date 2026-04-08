import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { t } from '../utils/translations';
import './MapControls.css';

import img_rgb from '../assets/img_rgb.png';
import img_ndvi from '../assets/img_ndvi.png';
import img_cwsi from '../assets/img_cwsi.png';
import img_lst from '../assets/img_lst.png';
import img_soil from '../assets/img_soil.png';
import img_irrigation from '../assets/img_irrigation.png';
import img_kc from '../assets/img_kc.png';
import img_etc from '../assets/img_etc.png';
import img_weather from '../assets/img_weather.png';
import { getLayerDisplayName } from '../utils/layerConstants';

function Sidebar({ onFetchData, onLayerChange, onClearMap, onVectorUpload, onGenerateCalendar, onViewCalendar, onGenerateReport, onQueryCurrentLayer, onCompare }) {
    const {
        isSidebarOpen,
        toggleSidebar,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        selectedLayer,
        setSelectedLayer,
        opacity,
        setOpacity,
        isLoading,
        irrigationCalendar,
        setActiveChartParam,
        isFetchingData,
        isFetchingLayer,
        isGeneratingCalendar,
        isGeneratingReport
    } = useApp();

    const [uploadedLayers, setUploadedLayers] = useState([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    // Active sidebar tab
    const [activeTab, setActiveTab] = useState('layers');
    const [managedLayers, setManagedLayers] = useState([]);

    // Sub-tab inside Layers panel (Analysis / Zonal)
    const [layerSubTab, setLayerSubTab] = useState('analysis');

    const addToManagedLayers = () => {
        const currentLayerInfo = onQueryCurrentLayer ? onQueryCurrentLayer() : null;
        if (!currentLayerInfo) { alert("Please load a layer on the map first!"); return; }
        const newLayer = { id: Date.now(), ...currentLayerInfo, visible: false };
        setManagedLayers([...managedLayers, newLayer]);
    };

    const toggleManagedLayer = (id) => {
        const layer = managedLayers.find(l => l.id === id);
        if (!layer) return;
        if (layer.visible) {
            window.mapFunctions?.removeOverlayLayer(id);
            setManagedLayers(managedLayers.map(l => l.id === id ? { ...l, visible: false } : l));
        } else {
            if (window.mapFunctions?.addOverlayLayer) {
                window.mapFunctions.addOverlayLayer(id, layer.url, { opacity: layer.opacity / 100 });
                setManagedLayers(managedLayers.map(l => l.id === id ? { ...l, visible: true } : l));
            }
        }
    };

    const removeManagedLayer = (id) => {
        window.mapFunctions?.removeOverlayLayer(id);
        setManagedLayers(managedLayers.filter(l => l.id !== id));
    };

    const handleCompare = () => {
        const selectedLayers = managedLayers.filter(l => l.visible);
        if (selectedLayers.length < 2) { alert("Please select at least 2 layers to compare!"); return; }
        if (onCompare) onCompare(selectedLayers);
    };

    const handleStartDateChange = (e) => setStartDate(e.target.value);
    const handleEndDateChange = (e) => setEndDate(e.target.value);

    const getChartParamForLayer = (layerId) => {
        if (layerId.startsWith('vra_')) return layerId.replace('vra_', '');
        const map = { ndvi: 'ndvi', savi: 'savi', cwsi: 'cwsi', lst: 'lst', lai: 'lai', kc: 'kc', etc: 'etc', irrigation_need: 'irrigation_need', soilmoisture: 'soilmoisture_mm', rgb: null };
        return map[layerId] || null;
    };

    const handleLayerSelectChange = (e) => {
        const value = e.target.value;
        setSelectedLayer(value);
        const chartParam = getChartParamForLayer(value);
        if (chartParam) setActiveChartParam(chartParam);
        if (value && onLayerChange) onLayerChange(value);
    };

    const handleOpacityChange = (e) => setOpacity(parseInt(e.target.value));

    const handleFileSelect = (file) => {
        if (!file) return;
        const validExtensions = ['.geojson', '.json', '.kml'];
        if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) { alert('Please select a valid .geojson, .json, or .kml file.'); return; }
        if (onVectorUpload) onVectorUpload(file, (layerInfo) => setUploadedLayers(prev => [...prev, layerInfo]));
    };

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    };

    const today = new Date().toISOString().split('T')[0];

    const allLayers = [
        { id: 'rgb', icon: 'fa-layer-group', label: 'FCC', color: '#3f51b5', img: img_rgb },
        { id: 'pca', icon: 'fa-wand-magic-sparkles', label: 'Crop Health', color: '#9c27b0', img: img_ndvi },
        { id: 'ndvi', icon: 'fa-leaf', label: 'NDVI', color: '#4caf50', img: img_ndvi },
        { id: 'cwsi', icon: 'fa-droplet', label: 'Water Stress', color: '#03a9f4', img: img_cwsi },
        { id: 'lst', icon: 'fa-temperature-high', label: 'Land Temp', color: '#ff5722', img: img_lst },
        { id: 'kc', icon: 'fa-chart-line', label: 'Crop Coeff.', color: '#9c27b0', img: img_kc },
        { id: 'etc', icon: 'fa-cloud-rain', label: 'Evap (ETc)', color: '#607d8b', img: img_etc },
        { id: 'irrigation_need', icon: 'fa-faucet-drip', label: 'Irrigation', color: '#2196f3', img: img_irrigation },
        { id: 'soilmoisture', icon: 'fa-droplet-slash', label: 'Soil Moisture', color: '#795548', img: img_soil },
        { id: 'weather', icon: 'fa-cloud-sun', label: 'Weather', color: '#607d8b', img: img_weather },
    ];

    const zonalLayers = [
        { id: 'vra_pca', icon: 'fa-wand-magic-sparkles', label: 'Crop Health', color: '#9c27b0', img: img_ndvi },
        { id: 'vra_ndvi', icon: 'fa-leaf', label: 'NDVI', color: '#4caf50', img: img_ndvi },
        { id: 'vra_cwsi', icon: 'fa-droplet', label: 'CWSI', color: '#03a9f4', img: img_cwsi },
        { id: 'vra_kc', icon: 'fa-chart-line', label: 'Kc', color: '#9c27b0', img: img_kc },
        { id: 'vra_lst', icon: 'fa-temperature-high', label: 'LST', color: '#ff5722', img: img_lst },
        { id: 'vra_etc', icon: 'fa-cloud-rain', label: 'ETc', color: '#9c27b0', img: img_etc },
        { id: 'vra_irrigation_need', icon: 'fa-faucet-drip', label: 'Irrigation', color: '#2196f3', img: img_irrigation },
        { id: 'vra_soilmoisture', icon: 'fa-droplet-slash', label: 'Soil Moisture', color: '#795548', img: img_soil },
    ];

    const activeLayers = layerSubTab === 'analysis' ? allLayers : zonalLayers;
    const activeLayerInfo = activeLayers.find(l => l.id === selectedLayer);

    const tabs = [
        { id: 'layers', icon: 'fa-layer-group', label: 'Layers' },
        { id: 'draw', icon: 'fa-pen-to-square', label: 'Draw' },
        { id: 'compare', icon: 'fa-code-compare', label: 'Compare' },
        { id: 'clear', icon: 'fa-rotate-left', label: 'Clear' },
    ];

    return (
        <aside className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
            <button className="close-sidebar-btn" onClick={toggleSidebar} title="Close Controls">&times;</button>

            {/* ── HEADER: Date Range ── */}
            <div className="sidebar-header">
                <div className="panel compact-panel">
                    <h3 className="sb2-header-title">
                        <i className="fa-solid fa-calendar-days"></i>
                        <span>{t('select_date_range')}</span>
                    </h3>
                    <div className="date-inputs-row">
                        <div className="date-field">
                            <label htmlFor="start">Start</label>
                            <input id="start" type="date" max={today} value={startDate} onChange={handleStartDateChange} />
                        </div>
                        <div className="date-field">
                            <label htmlFor="end">End</label>
                            <input id="end" type="date" max={today} value={endDate} onChange={handleEndDateChange} />
                        </div>
                    </div>
                    <button
                        className="btn action-btn-sm"
                        onClick={onFetchData}
                        disabled={isFetchingData}
                        style={{ marginTop: '10px', width: '100%' }}
                    >
                        <i className="fa-solid fa-magnifying-glass-chart"></i>
                        {isFetchingData ? t('loading') || 'Loading...' : t('fetch_data')}
                    </button>
                </div>
            </div>

            {/* ── Icon Tab Bar ── */}
            <div className="sb2-tab-bar">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`sb2-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        title={tab.label}
                    >
                        <i className={`fa-solid ${tab.icon}`}></i>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Content Panel (scrollable, always filled) ── */}
            <div className="sb2-content">

                {/* ══ LAYERS TAB ══ */}
                {activeTab === 'layers' && (
                    <div className="sb2-panel">

                        {/* Opacity slider */}
                        <div className="sb2-opacity-block">
                            <div className="sb2-opacity-row">
                                <span className="sb2-opacity-label">
                                    <i className="fa-solid fa-circle-half-stroke"></i> Layer Opacity
                                </span>
                                <span className="sb2-opacity-val">{opacity}%</span>
                            </div>
                            <input
                                type="range"
                                className="sb2-range"
                                min="0" max="100"
                                value={opacity}
                                onChange={handleOpacityChange}
                                style={{ background: `linear-gradient(to right, var(--krishi-green) ${opacity}%, #dde3ea ${opacity}%)` }}
                            />
                        </div>

                        {/* Sub-tab: Analysis / Zonal */}
                        <div className="sb2-subtab-bar">
                            <button
                                className={`sb2-subtab ${layerSubTab === 'analysis' ? 'active' : ''}`}
                                onClick={() => setLayerSubTab('analysis')}
                            >
                                <i className="fa-solid fa-satellite-dish"></i> Analysis
                            </button>
                            <button
                                className={`sb2-subtab ${layerSubTab === 'zonal' ? 'active' : ''}`}
                                onClick={() => setLayerSubTab('zonal')}
                            >
                                <i className="fa-solid fa-map"></i> Zonal
                            </button>
                        </div>

                        {/* Active layer pill */}
                        <div className="sb2-active-badge">
                            {activeLayerInfo ? (
                                <>
                                    <i className={`fa-solid ${activeLayerInfo.icon}`} style={{ color: activeLayerInfo.color }}></i>
                                    <span>{activeLayerInfo.label}</span>
                                    <span className="sb2-active-dot"></span>
                                </>
                            ) : (
                                <span className="sb2-placeholder">
                                    <i className="fa-regular fa-hand-pointer"></i> Select a layer below
                                </span>
                            )}
                        </div>

                        {/* 5-col layer icon grid */}
                        <div className="sb2-layer-grid">
                            {activeLayers.map(layer => (
                                <div
                                    key={layer.id}
                                    className={`sb2-layer-item ${selectedLayer === layer.id ? 'active' : ''}`}
                                    onClick={() => handleLayerSelectChange({ target: { value: layer.id } })}
                                    title={layer.label}
                                >
                                    <div
                                        className="sb2-layer-icon"
                                        style={{
                                            backgroundImage: layer.img ? `url(${layer.img})` : 'none',
                                            backgroundColor: layer.img ? 'transparent' : layer.color,
                                            borderColor: selectedLayer === layer.id ? layer.color : 'transparent',
                                            boxShadow: selectedLayer === layer.id ? `0 0 0 2px ${layer.color}50, 0 4px 8px ${layer.color}30` : '0 2px 6px rgba(0,0,0,0.12)',
                                        }}
                                    >
                                        <div className="sb2-layer-overlay"></div>
                                        <i className={`fa-solid ${layer.icon}`}></i>
                                        {selectedLayer === layer.id && <div className="sb2-selected-ring"></div>}
                                    </div>
                                    <span
                                        className="sb2-layer-label"
                                        style={{ color: selectedLayer === layer.id ? layer.color : undefined, fontWeight: selectedLayer === layer.id ? 700 : 500 }}
                                    >
                                        {layer.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ══ DRAW TAB ══ */}
                {activeTab === 'draw' && (
                    <div className="sb2-panel">
                        <div className="sb2-section-label">
                            <i className="fa-solid fa-vector-square"></i> Drawing Tools
                        </div>
                        <div className="sb2-draw-grid">
                            <div className="sb2-draw-card" onClick={() => window.mapFunctions?.startDrawPolygon()}>
                                <div className="sb2-draw-icon" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                    <i className="fa-solid fa-draw-polygon"></i>
                                </div>
                                <div>
                                    <div className="sb2-draw-title">Polygon</div>
                                    <div className="sb2-draw-desc">Draw custom shape</div>
                                </div>
                            </div>
                            <div className="sb2-draw-card" onClick={() => window.mapFunctions?.startDrawRectangle()}>
                                <div className="sb2-draw-icon" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                    <i className="fa-regular fa-square"></i>
                                </div>
                                <div>
                                    <div className="sb2-draw-title">Rectangle</div>
                                    <div className="sb2-draw-desc">Draw box area</div>
                                </div>
                            </div>
                        </div>

                        <div className="sb2-section-label" style={{ marginTop: '16px' }}>
                            <i className="fa-solid fa-sliders"></i> Edit &amp; Manage
                        </div>
                        <div className="sb2-edit-grid">
                            <button className="sb2-edit-btn" onClick={() => window.mapFunctions?.startEditShapes()}>
                                <i className="fa-solid fa-pen-to-square"></i>
                                <span>Edit</span>
                            </button>
                            <button className="sb2-edit-btn sb2-save" onClick={() => window.mapFunctions?.saveEdits()}>
                                <i className="fa-solid fa-circle-check"></i>
                                <span>Save</span>
                            </button>
                            <button className="sb2-edit-btn sb2-del" onClick={() => window.mapFunctions?.deleteShapes()}>
                                <i className="fa-solid fa-trash-can"></i>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ══ COMPARE TAB ══ */}
                {activeTab === 'compare' && (
                    <div className="sb2-panel">
                        <div className="sb2-section-label">
                            <i className="fa-solid fa-code-compare"></i> Layer Comparison
                        </div>
                        <button onClick={addToManagedLayers} className="btn" style={{ width: '100%', marginBottom: '12px', fontSize: '12px', padding: '9px 12px' }}>
                            <i className="fa-solid fa-plus"></i> Add Current Layer
                        </button>

                        {managedLayers.length === 0 ? (
                            <div className="sb2-empty-state">
                                <i className="fa-solid fa-layer-group"></i>
                                <p>Load a layer on the map, then click "Add Current Layer" to compare.</p>
                            </div>
                        ) : (
                            <div className="sb2-compare-list">
                                {managedLayers.map(l => (
                                    <div key={l.id} className="sb2-compare-item">
                                        <label className="sb2-compare-checkbox">
                                            <input type="checkbox" checked={l.visible} onChange={() => toggleManagedLayer(l.id)} />
                                            <span className="sb2-checkmark"></span>
                                        </label>
                                        <span className="sb2-compare-name">
                                            {l.type ? getLayerDisplayName(l.type) : 'Layer'}
                                        </span>
                                        <span className="sb2-compare-opacity">{l.opacity}%</span>
                                        <button className="sb2-remove-btn" onClick={() => removeManagedLayer(l.id)} title="Remove">
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {managedLayers.length > 1 && (
                            <button onClick={handleCompare} className="btn" style={{ width: '100%', marginTop: '12px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', fontSize: '12px', padding: '9px 12px' }}>
                                <i className="fa-solid fa-code-compare"></i> Compare Selected
                            </button>
                        )}
                    </div>
                )}

                {/* ══ CLEAR TAB ══ */}
                {activeTab === 'clear' && (
                    <div className="sb2-panel">
                        <div className="sb2-clear-panel">
                            <div className="sb2-clear-icon">
                                <i className="fa-solid fa-rotate-left"></i>
                            </div>
                            <h4 className="sb2-clear-title">Clear Map</h4>
                            <p className="sb2-clear-desc">
                                This will remove all layers, drawn shapes, and the area of interest from the map. This action cannot be undone.
                            </p>
                            <button
                                className="btn sb2-clear-btn"
                                onClick={() => {
                                    setManagedLayers([]);
                                    setUploadedLayers([]);
                                    if (onClearMap) onClearMap();
                                }}
                            >
                                <i className="fa-solid fa-trash-can"></i>
                                {t('clear_all_layers')}
                            </button>
                        </div>
                    </div>
                )}

            </div>

            {/* ── FOOTER ── */}
            <div className="sidebar-footer">
                <div className="footer-actions-grid">
                    <button
                        className="footer-btn"
                        onClick={irrigationCalendar ? onViewCalendar : onGenerateCalendar}
                        disabled={isGeneratingCalendar}
                        title={t('irrigation_calendar')}
                    >
                        <i className={`fa-solid ${irrigationCalendar ? 'fa-calendar-check' : 'fa-wand-magic-sparkles'}`}></i>
                        <span>{irrigationCalendar ? 'View Plan' : 'Irrigation Calendar'}</span>
                    </button>
                    <button
                        className="footer-btn"
                        onClick={onGenerateReport}
                        disabled={isGeneratingReport}
                        title={t('generate_report')}
                    >
                        <i className="fa-solid fa-file-pdf"></i>
                        <span>Report</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;