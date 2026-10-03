import { useState, useRef, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
import ChartPanel from './ChartPanel';
import IoTSensorPanel from './IoTSensorPanel';
import { useApp } from '../context/AppContext';
import { t } from '../utils/translations';
import { fetchLandCoverAnalysis } from '../utils/api';
import Swal from 'sweetalert2';
import DroneIcon from './DroneIcon';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const paramColors = {
    ndvi: { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },
    savi: { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' },
    cwsi: { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },
    kc: { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
    etc: { border: 'rgb(249, 115, 22)', background: 'rgba(249, 115, 22, 0.1)' },
    irrigation_need: { border: 'rgb(6, 182, 212)', background: 'rgba(6, 182, 212, 0.1)' },
    soilmoisture_mm: { border: 'rgb(139, 92, 246)', background: 'rgba(139, 92, 246, 0.1)' },
    lst: { border: 'rgb(234, 88, 12)', background: 'rgba(234, 88, 12, 0.1)' },
    lai: { border: 'rgb(34, 211, 238)', background: 'rgba(34, 211, 238, 0.1)' },
    eto: { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },
    precipitation: { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },
    temperature: { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },
    humidity: { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' },
};

function AnalyticsSidebar() {
    const {
        isRightPanelOpen,
        toggleRightPanel,
        ndviStats,
        irrigationCalendar,
        isDarkMode,
        chartData,
        drawnAOI,
        startDate,
        endDate,
        selectedLayer,
        activeChartParam,
        setActiveChartParam,
        activeMapTab,
        droneLayer,
        vraZones,
        setVraZones,
        currentLayerData
    } = useApp();

    const [activeTab, setActiveTab] = useState('overview');
    const [showDashboard, setShowDashboard] = useState(false);
    const [landCoverData, setLandCoverData] = useState(null);
    const [landCoverLoading, setLandCoverLoading] = useState(false);
    const [timeScale, setTimeScale] = useState('monthly');
    const [selectedPeriod, setSelectedPeriod] = useState(0);

    // Resizing state for right panel
    const [panelWidth, setPanelWidth] = useState(400);
    const isResizingRef = useRef(false);

    const startResizing = (e) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizingRef.current) return;
            const newWidth = window.innerWidth - e.clientX;
            // Set bounds: Min 280px, Max 800px
            if (newWidth >= 280 && newWidth <= 800) {
                setPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Sync chart param with selected layer
    useEffect(() => {
        if (!selectedLayer) return;

        const layerToParam = {
            'ndvi': 'ndvi',
            'savi': 'savi',
            'cwsi': 'cwsi',
            'lst': 'lst',
            'kc': 'kc',
            'etc': 'etc',
            'irrigation_need': 'irrigation_need',
            'soilmoisture': 'soilmoisture_mm',
            'pca': 'pca',
            // VRA layers
            'vra_ndvi': 'ndvi',
            'vra_savi': 'savi',
            'vra_cwsi': 'cwsi',
            'vra_lst': 'lst',
            'vra_kc': 'kc',
            'vra_etc': 'etc',
            'vra_irrigation_need': 'irrigation_need',
            'vra_soilmoisture': 'soilmoisture_mm',
            'vra_pca': 'pca',
            'weather': 'weather',
            'iot': 'iot'
        };

        const targetParam = layerToParam[selectedLayer];
        if (targetParam) {
            setActiveChartParam(targetParam);
        }
    }, [selectedLayer, setActiveChartParam]);

    // Parameter display names
    const paramLabels = {
        ndvi: 'opt_ndvi', // We'll use t() inside the render or mapping
        savi: 'opt_savi',
        cwsi: 'opt_cwsi',
        kc: 'opt_kc',
        etc: 'opt_etc',
        irrigation_need: 'opt_irrigation_need',
        soilmoisture_mm: 'opt_soilmoisture',
        lst: 'opt_lst',
        lai: 'opt_lai',
        weather: 'opt_w',
        pca: 'opt_pca',
        iot: 'IoT Sensors',
    };

    // Calculate generic stats
    const calculateGenericStats = () => {
        if (!chartData || chartData.length === 0) return null;

        // Determine the data key based on activeChartParam
        // We need to handle special cases like 'soilmoisture_mm' or 'weather'
        let dataKey = activeChartParam;
        if (activeChartParam === 'soilmoisture_mm') {
            // Try 'soilmoisture_mm' then 'soilmoisture'
            if (chartData[0].hasOwnProperty('soilmoisture_mm')) dataKey = 'soilmoisture_mm';
            else if (chartData[0].hasOwnProperty('soilmoisture')) dataKey = 'soilmoisture';
        }

        // Weather is complex, simplest generic handling for now or skip
        if (activeChartParam === 'weather') return null;

        const values = chartData
            .map(d => d[dataKey])
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (values.length === 0) return null;

        const meanVal = values.reduce((a, b) => a + b, 0) / values.length;
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        const sorted = [...values].sort((a, b) => a - b);
        const medianVal = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        // Check for Temperature (Kelvin)
        // Heuristic: If mean > 200, assume Kelvin (max ~350), or check param name
        const isKelvin = meanVal > 200 || ['lst', 'temperature'].includes(activeChartParam);

        let mean = meanVal;
        let min = minVal;
        let max = maxVal;
        let median = medianVal;
        let paramLabel = t(paramLabels[activeChartParam] || activeChartParam);

        if (isKelvin) {
            mean = meanVal - 273.15;
            min = minVal - 273.15;
            max = maxVal - 273.15;
            median = medianVal - 273.15;
            paramLabel += ' (°C)';
        }

        // Normalize for gauge
        let normalizedMean;
        if (isKelvin) {
            // Assume range 0-60°C for gauge visualization
            normalizedMean = Math.max(0, Math.min(1, mean / 60));
        } else if (activeChartParam === 'etc') {
            normalizedMean = Math.max(0, Math.min(1, mean / 10)); // ETc: 0-10 mm/day
        } else if (activeChartParam === 'irrigation_need') {
            normalizedMean = Math.max(0, Math.min(1, mean / 15));
        } else if (activeChartParam === 'soilmoisture_mm') {
            normalizedMean = Math.max(0, Math.min(1, mean / 200));
        } else {
            // 0-1 usually for indices, but if mean > 1 assume 0-100 or other
            normalizedMean = mean > 1 ? Math.min(1, mean / 100) : Math.min(1, mean);
        }

        return {
            mean,
            median,
            min,
            max,
            normalizedMean,
            label: paramLabel
        };
    };

    const genericStats = calculateGenericStats();

    // Auto-switch view modes
    useEffect(() => {
        if (selectedLayer === 'ndvi') {
            setShowDashboard(true);
        } else {
            setShowDashboard(false);
        }
    }, [selectedLayer]);

    // ─── Toggle Button Helper ─────────────────────────────────────────────────
    const asideCls = `analytics-sidebar ${!isRightPanelOpen ? 'collapsed' : ''}`;
    const toggleBtn = (
        <button
            className="analytics-panel-toggle-btn"
            onClick={toggleRightPanel}
            title={isRightPanelOpen ? 'Collapse Analytics Panel' : 'Expand Analytics Panel'}
        >
            <i className={`fa-solid fa-chevron-${isRightPanelOpen ? 'right' : 'left'}`}></i>
        </button>
    );

    const asideStyle = isRightPanelOpen ? {
        width: `${panelWidth}px`,
        minWidth: `${panelWidth}px`,
        maxWidth: `${panelWidth}px`,
        flex: `0 0 ${panelWidth}px`
    } : {};

    const resizerEl = isRightPanelOpen && (
        <div
            className="sidebar-resizer-handle"
            onMouseDown={startResizing}
            style={{
                position: 'absolute',
                left: '-4px',
                top: 0,
                width: '8px',
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 999,
                background: 'transparent',
                transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(0, 200, 83, 0.2)'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
        />
    );
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        // Only hide dashboard when switching chart params if we're not on NDVI layer
        if (activeChartParam && selectedLayer !== 'ndvi') {
            setShowDashboard(false);
        }
    }, [activeChartParam, selectedLayer]);

    // Data Report Charts
    const getReportCharts = () => {
        if (!genericStats) return null;

        const { mean, normalizedMean, label } = genericStats;

        const colorObj = paramColors[activeChartParam] || paramColors.ndvi;
        const primaryColor = colorObj.border || '#8e44ad';

        // Gauge Data
        const gaugeData = {
            labels: ['Value', 'Remaining'],
            datasets: [{
                data: [normalizedMean, 1 - normalizedMean],
                backgroundColor: [
                    primaryColor,
                    isDarkMode ? '#4a4a4a' : '#ecf0f1'
                ],
                borderWidth: 0,
                cutout: '75%',
                rotation: -90,
                circumference: 180,
            }]
        };

        const gaugeOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
            },
        };

        // Horizontal Bar Data
        const barData = {
            labels: [label],
            datasets: [{
                label: 'Average',
                data: [mean],
                backgroundColor: primaryColor,
                borderRadius: 5,
                barThickness: 40,
            }]
        };

        const barOptions = {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { color: isDarkMode ? '#a0aec0' : '#64748b' }
                },
                y: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        color: isDarkMode ? '#a0aec0' : '#64748b',
                        font: { size: 11 }
                    }
                }
            }
        };

        return (
            <div className="data-report-container" style={{ padding: '12px', flex: '0 1 auto', maxHeight: '60%', overflowY: 'auto' }}>
                <div style={{
                    textAlign: 'center',
                    marginBottom: '12px',
                    color: '#006064', // Dark teal title
                    fontWeight: 600,
                    fontSize: '14px'
                }}>
                    Data Report
                </div>

                <div className="report-card" style={{
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    marginBottom: '12px'
                }}>
                    <h3 style={{
                        textAlign: 'center',
                        fontSize: '15px',
                        color: isDarkMode ? '#e8e6e3' : '#333',
                        marginBottom: '12px',
                        fontWeight: 600
                    }}>
                        Average {label}
                    </h3>

                    {/* Gauge Chart */}
                    <div style={{ height: '140px', position: 'relative', marginBottom: '6px' }}>
                        <Doughnut data={gaugeData} options={gaugeOptions} />
                        <div style={{
                            position: 'absolute',
                            top: '60%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '24px',
                            fontWeight: 'bold',
                            fontFamily: 'serif', // Matching the font in image
                            color: isDarkMode ? '#e8e6e3' : '#333'
                        }}>
                            {mean.toFixed(2)}
                        </div>
                    </div>

                    <div style={{
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 600,
                        marginBottom: '12px',
                        color: isDarkMode ? '#e8e6e3' : '#333'
                    }}>
                        Average: {mean.toFixed(2)}
                    </div>

                    {/* Additional Stats Grid */}
                    <div className="analytics-stats-grid">
                        <div style={{ padding: '10px', background: isDarkMode ? '#2c2f32' : '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Min</div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: isDarkMode ? '#e8e6e3' : '#333' }}>{genericStats.min?.toFixed(2)}</div>
                        </div>
                        <div style={{ padding: '10px', background: isDarkMode ? '#2c2f32' : '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Max</div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: isDarkMode ? '#e8e6e3' : '#333' }}>{genericStats.max?.toFixed(2)}</div>
                        </div>
                        <div style={{ padding: '10px', background: isDarkMode ? '#2c2f32' : '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Median</div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: isDarkMode ? '#e8e6e3' : '#333' }}>{genericStats.median?.toFixed(2)}</div>
                        </div>
                        <div style={{ padding: '10px', background: isDarkMode ? '#2c2f32' : '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Range</div>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', color: isDarkMode ? '#e8e6e3' : '#333' }}>{(genericStats.max - genericStats.min)?.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Calculate stats from chart data (Existing function logic kept but using it only for NDVI)
    const calculateStats = () => {
        if (!chartData || chartData.length === 0) return null;

        const ndviValues = chartData
            .map(d => d.ndvi)
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (ndviValues.length === 0) return null;

        const sorted = [...ndviValues].sort((a, b) => a - b);
        const mean = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        const p25Index = Math.floor(sorted.length * 0.25);
        const p75Index = Math.floor(sorted.length * 0.75);
        const p10Index = Math.floor(sorted.length * 0.10);
        const p90Index = Math.floor(sorted.length * 0.90);

        const variance = ndviValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / ndviValues.length;
        const stdDev = Math.sqrt(variance);

        return {
            mean,
            median,
            min,
            max,
            stdDev,
            range: max - min,
            p25: sorted[p25Index],
            p75: sorted[p75Index],
            p10: sorted[p10Index],
            p90: sorted[p90Index],
        };
    };

    const stats = calculateStats() || ndviStats;

    // Get health status based on mean NDVI
    const getHealthStatus = (mean) => {
        if (mean >= 0.7) return { text: 'Excellent', emoji: '🌿', color: '#22c55e' };
        if (mean >= 0.5) return { text: 'Good', emoji: '👍', color: '#4ade80' };
        if (mean >= 0.3) return { text: 'Moderate', emoji: '😐', color: '#facc15' };
        return { text: 'Poor', emoji: '⚠️', color: '#ef4444' };
    };

    const healthStatus = stats ? getHealthStatus(stats.mean) : { text: '--', emoji: '😐', color: '#9ca3af' };

    // Get progress bar width (NDVI ranges from -1 to 1, normalize to 0-100)
    const getNormalizedValue = (value) => {
        if (value === null || value === undefined) return 0;
        // NDVI ranges from -1 to 1, normalize to 0-100%
        return Math.max(0, Math.min(100, ((value + 1) / 2) * 100));
    };

    // Get progress bar color based on NDVI value
    const getProgressColor = (value) => {
        if (value >= 0.7) return '#22c55e';
        if (value >= 0.5) return '#4ade80';
        if (value >= 0.3) return '#facc15';
        return '#ef4444';
    };

    // Run land cover analysis
    const runLandCoverAnalysis = async () => {
        if (!drawnAOI) {
            Swal.fire({
                icon: 'warning',
                title: 'No Area Selected',
                text: 'Please draw a polygon or rectangle on the map first.',
                confirmButtonColor: 'var(--krishi-green)',
            });
            return;
        }

        if (!startDate || !endDate) {
            Swal.fire({
                icon: 'warning',
                title: 'Select Dates',
                text: 'Please select start and end dates first.',
                confirmButtonColor: 'var(--krishi-green)',
            });
            return;
        }

        setLandCoverLoading(true);
        try {
            const data = await fetchLandCoverAnalysis(drawnAOI, startDate, endDate, timeScale);

            if (data.error) {
                throw new Error(data.error);
            }

            setLandCoverData(data);
            setSelectedPeriod(0);

            Swal.fire({
                icon: 'success',
                title: 'Analysis Complete!',
                text: `Loaded ${data.data?.length || 0} periods of land cover data.`,
                confirmButtonColor: 'var(--krishi-green)',
                timer: 2000,
                showConfirmButton: false,
            });
        } catch (error) {
            console.error('Land cover analysis error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Analysis Failed',
                text: error.message || 'Could not complete land cover analysis.',
                confirmButtonColor: 'var(--krishi-green)',
            });
        } finally {
            setLandCoverLoading(false);
        }
    };

    // Get current period data for the land cover chart
    const getCurrentPeriodData = () => {
        if (!landCoverData?.data || landCoverData.data.length === 0) return null;
        return landCoverData.data[selectedPeriod];
    };

    // Land cover pie chart data
    const landCoverChartData = () => {
        const periodData = getCurrentPeriodData();
        if (!periodData) return null;

        const percentages = periodData.percentages || {};
        return {
            labels: ['Water', 'Bare Land', 'Built-up', 'Sparse Veg', 'Full Veg'],
            datasets: [{
                data: [
                    percentages['Water'] || 0,
                    percentages['Bare Land'] || 0,
                    percentages['Built-up'] || 0,
                    percentages['Sparse Vegetation'] || 0,
                    percentages['Dense Vegetation'] || 0,
                ],
                backgroundColor: ['#1e88e5', '#8d6e63', '#78909c', '#c0ca33', '#43a047'],
                borderWidth: 1,
                borderColor: isDarkMode ? '#2c2f32' : '#ffffff',
            }],
        };
    };

    const landCoverChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `${context.label}: ${context.parsed}%`;
                    },
                },
                backgroundColor: isDarkMode ? '#2c2f32' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDarkMode ? '#e8e6e3' : '#334155',
                bodyColor: isDarkMode ? '#e8e6e3' : '#334155',
            },
        },
    };

    // Chart for visual tab
    const comparisonChartData = stats ? {
        labels: ['Min', 'P25', 'Median', 'P75', 'Max'],
        datasets: [{
            label: 'NDVI Distribution',
            data: [stats.min, stats.p25, stats.median, stats.p75, stats.max].map(v => v?.toFixed(3) || 0),
            backgroundColor: [
                'rgba(239, 68, 68, 0.7)',
                'rgba(250, 204, 21, 0.7)',
                'rgba(59, 130, 246, 0.7)',
                'rgba(74, 222, 128, 0.7)',
                'rgba(34, 197, 94, 0.7)',
            ],
            borderColor: [
                'rgb(239, 68, 68)',
                'rgb(250, 204, 21)',
                'rgb(59, 130, 246)',
                'rgb(74, 222, 128)',
                'rgb(34, 197, 94)',
            ],
            borderWidth: 1,
        }],
    } : null;

    const comparisonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: isDarkMode ? '#2c2f32' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDarkMode ? '#e8e6e3' : '#334155',
                bodyColor: isDarkMode ? '#e8e6e3' : '#334155',
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 1,
                ticks: {
                    color: isDarkMode ? '#a0aec0' : '#64748b',
                },
                grid: {
                    color: isDarkMode ? '#3a3d40' : '#e2e8f0',
                },
            },
            x: {
                ticks: {
                    color: isDarkMode ? '#a0aec0' : '#64748b',
                },
                grid: {
                    display: false,
                },
            },
        },
    };

    const getVraZonePanel = () => {
        let stats = currentLayerData?.stats || [];
        if (!Array.isArray(stats)) {
            stats = [];
        }
        
        // Also ensure the current layer data matches the selected layer to avoid showing old data while loading
        if (currentLayerData?.type !== selectedLayer) {
            stats = [];
        }
        
        const barData = {
            labels: stats.map(s => s.label || `Zone ${s.class}`),
            datasets: [{
                label: 'Area (ha)',
                data: stats.map(s => s.area_ha || 0),
                backgroundColor: stats.map(s => s.fill_color || s.color),
                borderRadius: 4
            }]
        };

        const barOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const stat = stats[context.dataIndex];
                            if (!stat.area_pct) return `Area: ${stat.area_ha} ha`;
                            return `${stat.area_pct.toFixed(1)}% | Mean: ${stat.mean_value.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Area (ha)', color: isDarkMode ? '#a0aec0' : '#64748b' },
                    beginAtZero: true,
                    ticks: { color: isDarkMode ? '#a0aec0' : '#64748b' },
                    grid: { color: isDarkMode ? '#3a3d40' : '#e2e8f0' }
                },
                x: {
                    ticks: { color: isDarkMode ? '#a0aec0' : '#64748b' },
                    grid: { display: false }
                }
            }
        };

        return (
            <div style={{ padding: '10px', height: '100%', overflowY: 'auto' }}>
                <h3 style={{ marginBottom: '15px', color: isDarkMode ? '#e8e6e3' : '#333' }}>VRA Zone Analysis</h3>
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '13px', marginRight: '10px', color: isDarkMode ? '#e8e6e3' : '#333' }}>Number of Zones:</label>
                    <select 
                        value={vraZones} 
                        onChange={(e) => setVraZones(parseInt(e.target.value))}
                        style={{ padding: '4px', borderRadius: '4px', background: isDarkMode ? '#2c2f32' : '#fff', color: isDarkMode ? '#e8e6e3' : '#333', border: `1px solid ${isDarkMode ? '#4a4a4a' : '#ddd'}` }}
                    >
                        {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} Zones</option>)}
                    </select>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                        Changing zones will regenerate the map.
                    </div>
                </div>
                
                {stats.length > 0 && stats[0].area_ha !== undefined ? (
                    <>
                        <div style={{ height: '250px', marginBottom: '20px' }}>
                            <Bar data={barData} options={barOptions} />
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', color: isDarkMode ? '#e8e6e3' : '#333' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${isDarkMode ? '#4a4a4a' : '#ddd'}`, textAlign: 'left' }}>
                                        <th style={{ padding: '8px 4px' }}>Zone</th>
                                        <th style={{ padding: '8px 4px' }}>Area (ha)</th>
                                        <th style={{ padding: '8px 4px' }}>Area %</th>
                                        <th style={{ padding: '8px 4px' }}>Mean</th>
                                        <th style={{ padding: '8px 4px' }}>Range</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.map((s, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${isDarkMode ? '#2c2f32' : '#eee'}` }}>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 4px' }}>
                                                <div style={{ width: '12px', height: '12px', backgroundColor: s.fill_color || s.color, borderRadius: '2px' }}></div>
                                                {s.label || `Zone ${s.class}`}
                                            </td>
                                            <td style={{ padding: '8px 4px' }}>{s.area_ha?.toFixed(2)}</td>
                                            <td style={{ padding: '8px 4px' }}>{s.area_pct?.toFixed(1)}%</td>
                                            <td style={{ padding: '8px 4px' }}>{s.mean_value?.toFixed(3)}</td>
                                            <td style={{ padding: '8px 4px' }}>{s.min_value?.toFixed(2)} - {s.max_value?.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '40px' }}>
                        Loading zone statistics...
                    </div>
                )}
            </div>
        );
    };

    // MAIN RENDER LOGIC
    if (selectedLayer && selectedLayer.startsWith('vra_')) {
        return (
            <aside className={asideCls} style={asideStyle}>
                {toggleBtn}
                {resizerEl}
                <div className="analytics-sidebar-inner">
                     {getVraZonePanel()}
                </div>
            </aside>
        );
    }

    // Only render the sidebar if a layer is selected or drone tab is active. 
    // This keeps it "Gone" on page load until user interracts with layers.
    if (!selectedLayer && activeMapTab !== 'drone') {
        return null;
    }

    // Case -2: Drone Tab - Show Drone Analytics
    if (activeMapTab === 'drone') {
        if (!droneLayer) {
            return (
                <aside className={asideCls} style={asideStyle}>
                    {toggleBtn}
                    {resizerEl}
                    <div className="analytics-sidebar-inner" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <DroneIcon size={48} style={{ color: 'var(--krishi-green)', marginBottom: '15px', opacity: 0.5 }} />
                        <h4>No Drone Data</h4>
                        <p style={{ fontSize: '12px' }}>Please upload a GeoTIFF image in the Drone tab to view analytics.</p>
                    </div>
                </aside>
            );
        }

        const isLst = droneLayer.type === 'lst';
        const isNdvi = droneLayer.type === 'ndvi';
        const stats = droneLayer.stats;

        // Kelvin adjustment if mean > 100
        const adjustVal = (val) => {
            if (isLst && val > 100) return val - 273.15;
            return val;
        };

        const mean = stats ? adjustVal(stats.mean) : null;
        const min = stats ? adjustVal(stats.min) : null;
        const max = stats ? adjustVal(stats.max) : null;
        const median = stats ? adjustVal(stats.median) : null;
        const range = stats ? adjustVal(stats.range) : null;
        const std = stats ? stats.std : null;
        const count = stats ? stats.count : null;

        const title = isNdvi ? 'Drone Crop Health (NDVI)' : (isLst ? 'Drone Temperature (LST)' : 'Drone Image Analytics');
        const unit = isLst ? '°C' : '';

        return (
            <aside className={asideCls} style={asideStyle}>
                {toggleBtn}
                {resizerEl}
                <div className="analytics-sidebar-inner" style={{ padding: '16px', height: '100%', overflowY: 'auto' }}>
                    <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--krishi-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <DroneIcon size={18} />
                            {title}
                        </h3>
                    </div>

                    <div className="drone-analytics-card" style={{
                        background: 'var(--card-bg, rgba(255,255,255,0.02))',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        marginBottom: '15px'
                    }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-primary)', textAlign: 'center' }}>
                            Raster Analysis Overview
                        </h4>

                        {stats ? (
                            <>
                                {/* Large gauge style block */}
                                <div style={{ textAlign: 'center', padding: '15px 0', marginBottom: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Mean {isLst ? 'Temperature' : 'NDVI'}</div>
                                    <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--krishi-green)', fontFamily: 'monospace' }}>
                                        {mean !== null ? `${mean.toFixed(3)}${unit}` : '--'}
                                    </div>
                                    {isNdvi && (
                                        <div style={{
                                            display: 'inline-block',
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            background: mean >= 0.6 ? 'rgba(34, 197, 94, 0.15)' : (mean >= 0.3 ? 'rgba(250, 204, 21, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                            color: mean >= 0.6 ? '#22c55e' : (mean >= 0.3 ? '#facc15' : '#ef4444'),
                                            borderRadius: '4px',
                                            marginTop: '6px',
                                            fontWeight: 700
                                        }}>
                                            {mean >= 0.7 ? 'Excellent' : (mean >= 0.5 ? 'Good' : (mean >= 0.3 ? 'Moderate' : 'Poor'))}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Minimum</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{min !== null ? `${min.toFixed(3)}${unit}` : '--'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Maximum</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{max !== null ? `${max.toFixed(3)}${unit}` : '--'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Median</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{median !== null ? `${median.toFixed(3)}${unit}` : '--'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Range</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{range !== null ? `${range.toFixed(3)}${unit}` : '--'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Std Dev</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{std !== null ? std.toFixed(3) : '--'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Valid Pixels</div>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{count !== null ? count.toLocaleString() : '--'}</div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                                <i className="fa-solid fa-circle-exclamation fa-2x" style={{ marginBottom: '10px', opacity: 0.5 }}></i>
                                <div>No statistics available for this product type.</div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        );
    }

    // Case -1: IoT Tab - Show IoT Sensor Dashboard
    if (activeChartParam === 'iot') {
        return (
            <aside className={asideCls} style={asideStyle}>
                {toggleBtn}
                {resizerEl}
                <div className="analytics-sidebar-inner" style={{ height: '100%', overflowY: 'auto' }}>
                    <IoTSensorPanel panelWidth={panelWidth} setPanelWidth={setPanelWidth} />
                </div>
            </aside>
        );
    }

    // Case 0: Weather Tab - Show Weather Dashboard
    if (activeChartParam === 'weather') {
        return (
            <aside className={asideCls} style={asideStyle}>
                {toggleBtn}
                {resizerEl}
                <div className="analytics-sidebar-inner">
                    <div className="weather-dashboard" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'hidden' }}>
                        {/* Header */}
                        <div style={{
                            textAlign: 'center',
                            padding: '10px',
                            borderBottom: '1px solid var(--border-color)',
                            flexShrink: 0
                        }}>
                            <h3 style={{
                                margin: 0,
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#607d8b'
                            }}>
                                <i className="fa-solid fa-cloud-sun" style={{ marginRight: '8px' }}></i>
                                {t('opt_w') || 'Weather Analysis'}
                            </h3>
                        </div>

                        <div style={{ flex: '0 1 auto', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            <i className="fa-solid fa-cloud-showers-heavy" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
                            <p style={{ textAlign: 'center', maxWidth: '80%' }}>
                                Select specific weather parameters from the chart dropdown below to analyze trends.
                            </p>
                        </div>

                        {/* Chart Panel - Sidebar Mode */}
                        <div style={{ flex: 1, padding: '0 10px 10px 10px', display: 'flex', flexDirection: 'column' }}>
                            <ChartPanel mode="sidebar" />
                        </div>
                    </div>
                </div>
            </aside>
        );
    }

    // Case 1: Data is available
    if ((chartData && chartData.length > 0) || ndviStats) {


        // Context B: Chart Tab Context -> Show Data Report
        const reportCharts = getReportCharts();
        if (reportCharts) {
            return (
                <aside className={asideCls} style={asideStyle}>
                    {toggleBtn}
                    {resizerEl}
                    <div className="analytics-sidebar-inner">
                        {reportCharts}
                        {/* Chart Panel - Sidebar Mode */}
                        <div style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column' }}>
                            <ChartPanel mode="sidebar" />
                        </div>
                    </div>
                </aside>
            );
        }
    }

    // Case 2: No Data - Logic for Placeholders
    // Only show Crop Health Statistics if NDVI layer is selected (Pre-computation/Map View)
    if (selectedLayer !== 'ndvi') {
        return (
            <aside className={asideCls} style={asideStyle}>
                {toggleBtn}
                {resizerEl}
                <div className="analytics-sidebar-inner">
                    <div className="default-analytics-placeholder">
                        <h3>{t('data_analytics')}</h3>
                        <div className="analytics-chart-wrap">
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: 'var(--muted)',
                                textAlign: 'center',
                                padding: '20px',
                            }}>
                                <p>Select &quot;Crop Health&quot; (NDVI) layer to view statistics</p>
                            </div>
                        </div>
                    </div>
                    {/* Chart Panel - Sidebar Mode */}
                    <div style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column' }}>
                        <ChartPanel mode="sidebar" />
                    </div>
                </div>
            </aside>
        );
    }

    // If no data, show placeholder (NDVI selected but no data fetched)
    return (
        <aside className={asideCls} style={asideStyle}>
            {toggleBtn}
            {resizerEl}
            <div className="analytics-sidebar-inner">
                <div className="default-analytics-placeholder">
                    <h3>{t('data_analytics')}</h3>
                    <div className="analytics-chart-wrap">
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'var(--muted)',
                            textAlign: 'center',
                            padding: '20px',
                        }}>
                            <p>Fetch data to view analytics</p>
                        </div>
                    </div>
                </div>
                {/* Chart Panel - Sidebar Mode */}
                <div style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column' }}>
                    <ChartPanel mode="sidebar" />
                </div>
            </div>
        </aside>
    );
}

export default AnalyticsSidebar;
