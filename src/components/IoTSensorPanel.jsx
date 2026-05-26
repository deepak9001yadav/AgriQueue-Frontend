import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getIoTConfig, saveIoTConfig, getIoTData } from '../utils/api';
import { Line } from 'react-chartjs-2';
import Swal from 'sweetalert2';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

function IoTSensorPanel({ panelWidth = 400, setPanelWidth = () => { } } = {}) {
    const [searchParams] = useSearchParams();
    const fieldId = searchParams.get('field_id');

    // UI View State
    const [activeSection, setActiveSection] = useState('dashboard'); // 'dashboard' or 'config'
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Configuration state
    const [config, setConfig] = useState({
        thingspeak_channel_id: '12397',
        thingspeak_read_api_key: '',
        field_mappings: {
            soil_moisture: 'field1',
            temperature: 'field3',
            humidity: 'field5'
        },
        is_active: true,
        exists: false
    });

    // Data and Sync state
    const [sensorData, setSensorData] = useState([]);
    const [latestReading, setLatestReading] = useState(null);
    const [syncStats, setSyncStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Load configuration and data on mount or fieldId change
    useEffect(() => {
        if (!fieldId) return;
        fetchConfigAndData();
    }, [fieldId]);

    // Cleanup IoT Marker from Map on leaving or unmounting IoT tab
    useEffect(() => {
        return () => {
            window.mapFunctions?.hideIoTMarker();
        };
    }, []);

    const fetchConfigAndData = async () => {
        setLoading(true);
        try {
            // 1. Fetch config
            const configRes = await getIoTConfig(fieldId);
            setConfig(configRes);

            // 2. Fetch data (no sync, just read cache)
            const dataRes = await getIoTData(fieldId, false);
            setSensorData(dataRes.data || []);

            if (dataRes.data && dataRes.data.length > 0) {
                setLatestReading(dataRes.data[dataRes.data.length - 1]);
            } else {
                setLatestReading(null);
            }

            // Draw/Render marker on map if channel coordinates exist
            if (dataRes.channel_metadata && dataRes.channel_metadata.latitude && dataRes.channel_metadata.longitude) {
                const latest = dataRes.data && dataRes.data.length > 0 ? dataRes.data[dataRes.data.length - 1] : null;
                window.mapFunctions?.showIoTMarker(
                    dataRes.channel_metadata.latitude,
                    dataRes.channel_metadata.longitude,
                    dataRes.channel_metadata.name,
                    {
                        channelId: dataRes.channel_id,
                        soilMoisture: latest?.soil_moisture,
                        temp: latest?.temperature,
                        humidity: latest?.humidity
                    }
                );
            }
        } catch (err) {
            console.error('Error loading IoT details:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!fieldId) return;
        setSyncing(true);

        Swal.fire({
            title: 'Syncing Data...',
            html: 'Connecting to ThingSpeak servers and executing data cleaning algorithms...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const res = await getIoTData(fieldId, true); // force sync
            setSensorData(res.data || []);

            if (res.data && res.data.length > 0) {
                setLatestReading(res.data[res.data.length - 1]);
            }

            // Draw/Update marker on map upon successful live sync
            if (res.channel_metadata && res.channel_metadata.latitude && res.channel_metadata.longitude) {
                const latest = res.data && res.data.length > 0 ? res.data[res.data.length - 1] : null;
                window.mapFunctions?.showIoTMarker(
                    res.channel_metadata.latitude,
                    res.channel_metadata.longitude,
                    res.channel_metadata.name,
                    {
                        channelId: res.channel_id,
                        soilMoisture: latest?.soil_moisture,
                        temp: latest?.temperature,
                        humidity: latest?.humidity
                    }
                );
            }

            if (res.sync_results) {
                setSyncStats(res.sync_results);

                if (res.sync_results.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Sync Completed',
                        html: `
                            <div style="text-align: left; font-size: 14px;">
                                <p><strong>Status:</strong> ${res.sync_results.message}</p>
                                <p><strong>Feeds Fetched:</strong> ${res.sync_results.records_fetched}</p>
                                <p><strong>New Feeds Cached:</strong> ${res.sync_results.records_inserted}</p>
                                <p><strong>Data Cleaning Summary:</strong></p>
                                <ul>
                                    <li>Missing Values Filled: ${res.sync_results.stats?.missing_filled || 0}</li>
                                    <li>Outliers Clamped/Corrected: ${res.sync_results.stats?.outliers_clamped || 0}</li>
                                </ul>
                            </div>
                        `,
                        confirmButtonColor: 'var(--krishi-green)'
                    });
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Sync Warning',
                        text: res.sync_results.error || 'Failed to sync with ThingSpeak.',
                        confirmButtonColor: 'var(--krishi-green)'
                    });
                }
            } else {
                // No sync results returned because channel is not configured or not active in DB
                Swal.fire({
                    icon: 'info',
                    title: 'No Configuration Found',
                    text: 'Please configure and save your ThingSpeak Channel ID under Channel Settings before syncing.',
                    confirmButtonColor: 'var(--krishi-green)'
                });
            }
        } catch (err) {
            console.error('Error syncing IoT data:', err);
            Swal.fire({
                icon: 'error',
                title: 'Sync Failed',
                text: err.message || 'Could not fetch data from live ThingSpeak channel.',
                confirmButtonColor: 'var(--krishi-green)'
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        if (!fieldId) return;

        Swal.fire({
            title: 'Verifying Channel Connection...',
            text: 'Validating ThingSpeak Channel access and mappings...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const saveRes = await saveIoTConfig(fieldId, config);
            if (saveRes.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Configuration Saved',
                    text: 'Your IoT channel config has been verified and saved. Initiating first sync...',
                    confirmButtonColor: 'var(--krishi-green)',
                    timer: 2000,
                    showConfirmButton: false
                });

                setActiveSection('dashboard');
                // Trigger auto-sync on successful save
                await handleSync();
            }
        } catch (err) {
            console.error('Error saving config:', err);
            Swal.fire({
                icon: 'error',
                title: 'Validation Failed',
                text: err.message || 'Could not verify ThingSpeak Channel. Please review your credentials.',
                confirmButtonColor: 'var(--krishi-green)'
            });
        }
    };

    // Calculate dynamic agronomic soil moisture alerts
    const getSoilMoistureStatus = (sm) => {
        if (sm === null || sm === undefined) return { label: 'No Data', color: '#94a3b8', class: 'neutral' };
        if (sm < 20) return { label: 'Extremely Dry', color: '#f97316', class: 'danger-dry' };
        if (sm < 40) return { label: 'Dry (Water Soon)', color: '#eab308', class: 'warning-dry' };
        if (sm <= 80) return { label: 'Optimal', color: '#22c55e', class: 'optimal' };
        return { label: 'Wet (Saturated)', color: '#06b6d4', class: 'wet' };
    };

    const smStatus = latestReading ? getSoilMoistureStatus(latestReading.soil_moisture) : { label: 'No Data', color: '#94a3b8', class: 'neutral' };

    // Chart configs
    const getChartConfig = () => {
        if (!sensorData || sensorData.length === 0) return null;

        const labels = sensorData.map(d => {
            const date = new Date(d.timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        });

        const soilMoistureData = sensorData.map(d => d.soil_moisture);
        const temperatureData = sensorData.map(d => d.temperature);
        const humidityData = sensorData.map(d => d.humidity);

        return {
            labels,
            datasets: [
                {
                    label: 'Soil Moisture (%)',
                    data: soilMoistureData,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    yAxisID: 'y_percentage',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Temperature (°C)',
                    data: temperatureData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    yAxisID: 'y_temp',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Humidity (%)',
                    data: humidityData,
                    borderColor: 'rgb(6, 182, 212)',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    yAxisID: 'y_percentage',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    fill: false
                }
            ]
        };
    };

    const chartConfig = getChartConfig();

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    boxWidth: 10,
                    font: { size: 10, family: 'Poppins' },
                    color: 'var(--text-main)'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                titleFont: { family: 'Poppins', size: 11 },
                bodyFont: { family: 'Poppins', size: 10 },
                padding: 8,
                cornerRadius: 6
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#94a3b8',
                    font: { size: 8 },
                    maxTicksLimit: 6
                },
                grid: { display: false }
            },
            y_percentage: {
                type: 'linear',
                position: 'left',
                suggestedMin: 0,
                ticks: {
                    color: '#94a3b8',
                    font: { size: 8 }
                },
                title: {
                    display: true,
                    text: 'Percentage (%)',
                    color: '#94a3b8',
                    font: { size: 9, weight: '600' }
                },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
            },
            y_temp: {
                type: 'linear',
                position: 'right',
                suggestedMin: 0,
                ticks: {
                    color: '#f87171',
                    font: { size: 8 }
                },
                title: {
                    display: true,
                    text: 'Temp (°C)',
                    color: '#f87171',
                    font: { size: 9, weight: '600' }
                },
                grid: { drawOnChartArea: false }
            }
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '12px', color: 'var(--text-secondary)' }}>
                <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '32px', color: 'var(--krishi-green)' }}></i>
                <p style={{ fontSize: '13px' }}>Loading IoT configuration...</p>
            </div>
        );
    }

    return (
        <div className="iot-panel-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header tab switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={`btn ${activeSection === 'dashboard' ? 'btn-active' : ''}`}
                        onClick={() => setActiveSection('dashboard')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: activeSection === 'dashboard' ? 'var(--krishi-green)' : 'transparent',
                            color: activeSection === 'dashboard' ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer'
                        }}
                    >
                        <i className="fa-solid fa-chart-line" style={{ marginRight: '6px' }}></i>
                        Live Dashboard
                    </button>
                    <button
                        className={`btn ${activeSection === 'config' ? 'btn-active' : ''}`}
                        onClick={() => setActiveSection('config')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: activeSection === 'config' ? 'var(--krishi-green)' : 'transparent',
                            color: activeSection === 'config' ? 'white' : 'var(--text-secondary)',
                            cursor: 'pointer'
                        }}
                    >
                        <i className="fa-solid fa-gear" style={{ marginRight: '6px' }}></i>
                        Channel Settings
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {activeSection === 'dashboard' && (
                        <button
                            onClick={handleSync}
                            disabled={syncing || !config.is_active}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#0ea5e9',
                                color: 'white',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className={`fa-solid fa-arrows-rotate ${syncing ? 'fa-spin' : ''}`}></i>
                            {syncing ? 'Syncing...' : 'Sync Live'}
                        </button>
                    )}

                    <button
                        onClick={() => setIsModalOpen(true)}
                        title="Expand to Fullscreen Dialog View"
                        style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--krishi-green)';
                            e.currentTarget.style.color = 'var(--krishi-green)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                    >
                        <i className="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>

            {/* DASHBOARD TAB */}
            {activeSection === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Live Metric Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center',
                            backdropFilter: 'blur(10px)'
                        }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                <i className="fa-solid fa-droplet" style={{ color: '#3b82f6', marginRight: '4px' }}></i>
                                Soil Moisture
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                {latestReading?.soil_moisture !== undefined && latestReading?.soil_moisture !== null ? `${latestReading.soil_moisture.toFixed(1)}%` : '--'}
                            </div>
                            <span style={{
                                display: 'inline-block',
                                fontSize: '9px',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                marginTop: '6px',
                                color: 'white',
                                fontWeight: 600,
                                background: smStatus.color
                            }}>
                                {smStatus.label}
                            </span>
                        </div>

                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center',
                            backdropFilter: 'blur(10px)'
                        }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                <i className="fa-solid fa-temperature-high" style={{ color: '#ef4444', marginRight: '4px' }}></i>
                                Temperature
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                {latestReading?.temperature !== undefined && latestReading?.temperature !== null ? `${latestReading.temperature.toFixed(1)}°C` : '--'}
                            </div>
                            <span style={{
                                display: 'inline-block',
                                fontSize: '9px',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                marginTop: '6px',
                                color: '#ef4444',
                                background: 'rgba(239, 68, 68, 0.1)',
                                fontWeight: 600
                            }}>
                                Ambient
                            </span>
                        </div>

                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center',
                            backdropFilter: 'blur(10px)'
                        }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                <i className="fa-solid fa-cloud-rain" style={{ color: '#06b6d4', marginRight: '4px' }}></i>
                                Humidity
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                {latestReading?.humidity !== undefined && latestReading?.humidity !== null ? `${latestReading.humidity.toFixed(1)}%` : '--'}
                            </div>
                            <span style={{
                                display: 'inline-block',
                                fontSize: '9px',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                marginTop: '6px',
                                color: '#06b6d4',
                                background: 'rgba(6, 182, 212, 0.1)',
                                fontWeight: 600
                            }}>
                                Relative
                            </span>
                        </div>
                    </div>

                    {/* Sensor Time Series Chart */}
                    <div style={{
                        padding: '16px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        height: '240px'
                    }}>
                        {chartConfig ? (
                            <Line data={chartConfig} options={chartOptions} />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '12px', gap: '8px' }}>
                                <i className="fa-solid fa-chart-line" style={{ fontSize: '24px', opacity: 0.5 }}></i>
                                No cached telemetry logs. Click "Sync Live" above to query ThingSpeak.
                            </div>
                        )}
                    </div>

                    {/* Live Data Cleaning Pipeline Auditor */}
                    <div style={{
                        padding: '14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px'
                    }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#a855f7' }}></i>
                            Data Cleaning Pipeline Auditor
                        </div>

                        {sensorData && sensorData.some(d => d.is_cleaned) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                                {sensorData.slice().reverse().filter(d => d.is_cleaned).map((d, index) => (
                                    <div key={index} style={{
                                        padding: '8px 10px',
                                        background: 'rgba(239, 68, 68, 0.04)',
                                        borderRadius: '8px',
                                        borderLeft: '3px solid #f97316',
                                        fontSize: '11px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                                            <span>Telemetry Adjustments</span>
                                            <span>{new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        {Object.entries(d.cleaning_logs || {}).map(([metric, logText]) => (
                                            <div key={metric} style={{ color: '#f97316', fontWeight: 500 }}>
                                                ⚠️ <strong>{metric.replace('_', ' ')}:</strong> {logText}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ) : sensorData.length > 0 ? (
                            <div style={{ color: '#22c55e', fontSize: '11px', padding: '6px', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fa-solid fa-circle-check"></i>
                                All cached telemetry verified. No anomalies, outliers, or missing registers detected.
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'center' }}>
                                No telemetry data loaded yet.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CONFIGURATION SETTINGS TAB */}
            {activeSection === 'config' && (
                <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>ThingSpeak Channel ID</label>
                        <input
                            type="text"
                            value={config.thingspeak_channel_id}
                            onChange={(e) => setConfig({ ...config, thingspeak_channel_id: e.target.value })}
                            placeholder="Enter Channel ID (e.g. 12397,1733232)"
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-light)',
                                color: 'var(--text-main)',
                                fontSize: '12px',
                                outline: 'none'
                            }}
                            required
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            To test your Proof of Concept, use the default MathWorks live Weather Station channel ID: <strong>12397</strong>.
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>Read API Key (Optional)</label>
                        <input
                            type="text"
                            value={config.thingspeak_read_api_key}
                            onChange={(e) => setConfig({ ...config, thingspeak_read_api_key: e.target.value })}
                            placeholder="Leave blank for public channels"
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-light)',
                                color: 'var(--text-main)',
                                fontSize: '12px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Mapping Config */}
                    <div style={{
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                            ThingSpeak Field Mappings
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Soil Moisture (%)</span>
                            <select
                                value={config.field_mappings.soil_moisture}
                                onChange={(e) => setConfig({
                                    ...config,
                                    field_mappings: { ...config.field_mappings, soil_moisture: e.target.value }
                                })}
                                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '11px' }}
                            >
                                <option value="">(None)</option>
                                {[...Array(8)].map((_, i) => (
                                    <option key={i} value={`field${i + 1}`}>Field {i + 1}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Temperature (°C)</span>
                            <select
                                value={config.field_mappings.temperature}
                                onChange={(e) => setConfig({
                                    ...config,
                                    field_mappings: { ...config.field_mappings, temperature: e.target.value }
                                })}
                                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '11px' }}
                            >
                                <option value="">(None)</option>
                                {[...Array(8)].map((_, i) => (
                                    <option key={i} value={`field${i + 1}`}>Field {i + 1}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Relative Humidity (%)</span>
                            <select
                                value={config.field_mappings.humidity}
                                onChange={(e) => setConfig({
                                    ...config,
                                    field_mappings: { ...config.field_mappings, humidity: e.target.value }
                                })}
                                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '11px' }}
                            >
                                <option value="">(None)</option>
                                {[...Array(8)].map((_, i) => (
                                    <option key={i} value={`field${i + 1}`}>Field {i + 1}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={config.is_active}
                            onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
                            style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="is_active" style={{ fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>Enable Telemetry Stream</label>
                    </div>

                    <button
                        type="submit"
                        style={{
                            padding: '8px 16px',
                            background: 'var(--krishi-green)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginTop: '8px'
                        }}
                    >
                        Save Configuration
                    </button>
                </form>
            )}

            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{
                        width: '90%',
                        maxWidth: '1100px',
                        maxHeight: '90%',
                        background: 'var(--card-bg, #ffffff)',
                        borderRadius: '24px',
                        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.1))',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--header-bg, #f8fafc)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <i className="fa-solid fa-tower-broadcast" style={{ color: 'var(--krishi-green)', fontSize: '20px' }}></i>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    IoT Telemetry Analytics & Data Cleaning Engine
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '20px',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
                            {/* Live Metric Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                {/* Soil Moisture Card */}
                                <div style={{
                                    padding: '20px',
                                    background: 'var(--card-bg, #ffffff)',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border-color)',
                                    textAlign: 'center',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                                        <i className="fa-solid fa-droplet" style={{ color: '#3b82f6', marginRight: '6px' }}></i>
                                        Soil Moisture (Live)
                                    </div>
                                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--text-main)', margin: '8px 0' }}>
                                        {latestReading?.soil_moisture !== undefined && latestReading?.soil_moisture !== null ? `${latestReading.soil_moisture.toFixed(1)}%` : '--'}
                                    </div>
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontWeight: 600,
                                        background: smStatus.color
                                    }}>
                                        {smStatus.label}
                                    </span>
                                </div>

                                {/* Temperature Card */}
                                <div style={{
                                    padding: '20px',
                                    background: 'var(--card-bg, #ffffff)',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border-color)',
                                    textAlign: 'center',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                                        <i className="fa-solid fa-temperature-high" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                        Temperature (Celsius)
                                    </div>
                                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--text-main)', margin: '8px 0' }}>
                                        {latestReading?.temperature !== undefined && latestReading?.temperature !== null ? `${latestReading.temperature.toFixed(1)}°C` : '--'}
                                    </div>
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        color: '#ef4444',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        fontWeight: 600
                                    }}>
                                        Ambient Sensor
                                    </span>
                                </div>

                                {/* Humidity Card */}
                                <div style={{
                                    padding: '20px',
                                    background: 'var(--card-bg, #ffffff)',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border-color)',
                                    textAlign: 'center',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                                        <i className="fa-solid fa-cloud-rain" style={{ color: '#06b6d4', marginRight: '6px' }}></i>
                                        Relative Humidity
                                    </div>
                                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--text-main)', margin: '8px 0' }}>
                                        {latestReading?.humidity !== undefined && latestReading?.humidity !== null ? `${latestReading.humidity.toFixed(1)}%` : '--'}
                                    </div>
                                    <span style={{
                                        display: 'inline-block',
                                        fontSize: '11px',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        color: '#06b6d4',
                                        background: 'rgba(6, 182, 212, 0.1)',
                                        fontWeight: 600
                                    }}>
                                        Humidity Sensor
                                    </span>
                                </div>
                            </div>

                            {/* Large Telemetry Chart */}
                            <div style={{
                                flex: 1,
                                minHeight: '520px',
                                padding: '20px',
                                background: 'var(--card-bg, #ffffff)',
                                borderRadius: '16px',
                                border: '1px solid var(--border-color)',
                                boxShadow: 'var(--shadow-sm)',
                                position: 'relative'
                            }}>
                                <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    High-Resolution Telemetry Analytics
                                </h4>
                                <div style={{ height: '460px', position: 'relative' }}>
                                    {chartConfig ? (
                                        <Line data={chartConfig} options={{
                                            ...chartOptions,
                                            plugins: {
                                                ...chartOptions.plugins,
                                                legend: {
                                                    labels: {
                                                        font: { size: 12, family: 'Poppins' }
                                                    }
                                                }
                                            }
                                        }} />
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                            No telemetry logs synced yet. Click "Sync Live" to load.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Anomaly Auditor Log */}
                            <div style={{
                                padding: '20px',
                                background: 'var(--card-bg, #ffffff)',
                                borderRadius: '16px',
                                border: '1px solid var(--border-color)',
                                boxShadow: 'var(--shadow-sm)'
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--krishi-green)' }}></i>
                                    Data Cleaning & Imputation Auditor
                                </h4>
                                {sensorData.some(d => d.is_cleaned) ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                                        {sensorData.filter(d => d.is_cleaned).reverse().map((log) => (
                                            <div key={log.id} style={{
                                                padding: '10px 14px',
                                                background: 'rgba(230, 242, 255, 0.5)',
                                                borderLeft: '4px solid #3b82f6',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                color: 'var(--text-main)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div>
                                                    <strong>Anomaly Corrected:</strong> {Object.values(log.cleaning_logs || {}).join(' | ')}
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '12px',
                                        background: 'rgba(34, 197, 94, 0.08)',
                                        borderRadius: '8px',
                                        color: '#15803d',
                                        fontSize: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <i className="fa-solid fa-circle-check"></i>
                                        All cached telemetry verified. No anomalies, outliers, or missing registers detected.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default IoTSensorPanel;
