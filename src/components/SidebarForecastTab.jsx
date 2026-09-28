import React, { useEffect, useRef, useState, useCallback } from 'react';
import { startForecast, pollForecast, getForecastFrameUrl, getAuthHeaders, fetchAvailableDates, BASE_URL } from '../utils/api';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';

const POLL_INTERVAL_MS = 3000;

export default function SidebarForecastTab({ aoi, chartData }) {
    const { setChartData, setActiveChartParam, setSelectedLayer, setCurrentLayerData, setFullChartData, setForecastReportAssets, opacity } = useApp();

    const [phase, setPhase]         = useState('idle');   // idle | picking | running | done | error
    const [jobId, setJobId]         = useState(null);
    const [progress, setProgress]   = useState('');
    const [result, setResult]       = useState(null);     // { summary_b64, future_dates, bounds }
    const [activeDay, setActiveDay] = useState(0);
    const [activeVar, setActiveVar] = useState('cwsi');


    const pollRef = useRef(null);
    const prevChartRef = useRef(null);
    const zonesCache = useRef({});

    // ── Fetch Accurate Dates ─────────────────────────────────────────────────
    const [availableDates, setAvailableDates] = useState([]);
    useEffect(() => {
        if (!aoi || !chartData || chartData.length === 0) return;
        const loadDates = async () => {
            try {
                const dates = chartData.map(d => d.date).filter(Boolean).sort();
                if (dates.length > 0) {
                    const today = new Date().toISOString().slice(0, 10);
                    const res = await fetchAvailableDates(aoi, dates[0], today);
                    if (res?.success && res.date_info) setAvailableDates(res.date_info);
                }
            } catch (err) { console.error("Failed to fetch available dates for forecast panel"); }
        };
        loadDates();
    }, [aoi, chartData]);

    // ── Polling ──────────────────────────────────────────────────────────────
    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (phase !== 'running' || !jobId) return;
        pollRef.current = setInterval(async () => {
            try {
                const data = await pollForecast(jobId);
                setProgress(data.progress || 'Processing...');
                if (data.status === 'done') {
                    stopPolling();
                    setResult(data.result);
                    setPhase('done');
                } else if (data.status === 'error') {
                    stopPolling();
                    setPhase('error');
                    setProgress(data.progress || 'Unknown error');
                }
            } catch (err) {
                console.error('Poll error:', err);
                stopPolling();
                setPhase('error');
                setProgress(err.message || 'Error communicating with server');
            }
        }, POLL_INTERVAL_MS);
        return () => stopPolling();
    }, [phase, jobId, stopPolling]);

    // ── Map overlay sync ─────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'done' || !result) return;
        
        const abortController = new AbortController();
        const signal = abortController.signal;

        const updateMap = async () => {
            try {
                const url = _zonesUrl(activeVar, activeDay);
                if (!url) return;
                
                if (zonesCache.current[url]) {
                    window.mapFunctions?.addZoneLayer?.(zonesCache.current[url], { opacity: opacity / 100 });
                    return;
                }

                const h = await getAuthHeaders();
                const resp = await fetch(url, { headers: h, signal });
                if (!resp.ok) throw new Error('Failed to fetch zones');
                
                const geojson = await resp.json();
                
                if (!signal.aborted) {
                    zonesCache.current[url] = geojson;
                    window.mapFunctions?.addZoneLayer?.(geojson, { opacity: opacity / 100 });
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Map sync error:", err);
                }
            }
        };
        
        updateMap();
        
        return () => abortController.abort();
    }, [phase, result, activeDay, activeVar, opacity]);


    // Sync app-level selected layer for legend
    useEffect(() => {
        if (phase === 'done' && setSelectedLayer) {
            setSelectedLayer(activeVar === 'cwsi' ? 'vra_cwsi' : 'vra_etc');
        }
    }, [phase, activeVar, setSelectedLayer]);






    // Cleanup overlay on unmount
    useEffect(() => {
        return () => {
            if (window.mapFunctions?.removeImageOverlay) {
                window.mapFunctions.removeImageOverlay();
            }

            // Restore previous chart data if we replaced it with forecast series
            if (prevChartRef.current) {
                setChartData(prevChartRef.current.chartData);
                setActiveChartParam(prevChartRef.current.activeChartParam);
                prevChartRef.current = null;
            }
        };
    }, [setChartData, setActiveChartParam]);

    // When forecast is done, sync right chart to forecast series
    useEffect(() => {
        if (phase !== 'done' || !result) return;

        const series = activeVar === 'etc'
            ? (result.forecast_chart_etc || [])
            : (result.forecast_chart_cwsi || []);

        if (!prevChartRef.current) {
            prevChartRef.current = { chartData, activeChartParam: activeVar };
        }

        setChartData(series);
        setActiveChartParam(activeVar);
        // Clear any analysis-layer-derived cached data (to avoid UI showing old stats)
        setCurrentLayerData(null);
        setFullChartData(null);
    }, [phase, result, activeVar, setChartData, setActiveChartParam, setCurrentLayerData, setFullChartData]);


    // Reset activeDay when variable changes (series might have diff lengths or start dates)
    useEffect(() => {
        setActiveDay(0);
    }, [activeVar]);

    // ── Start forecast: date picker dialog ───────────────────────────────────
    const handleStart = useCallback(async () => {
        if (!aoi) {
            Swal.fire({ icon: 'warning', title: 'No AOI', text: 'Please draw a field boundary first.', confirmButtonColor: 'var(--krishi-green)' });
            return;
        }

        // Filter STRICT Landsat dates (having thermal imagery)
        const landsatDates = availableDates.length > 0
            ? availableDates.filter(d => d.has_landsat || d.sensor === 'Landsat').map(d => d.date)
            : (chartData || []).filter(d => d.source_sensor && d.source_sensor.includes('Landsat')).map(d => d.date).filter(Boolean);

        const allDates = availableDates.length > 0
            ? availableDates.map(d => d.date)
            : [...new Set((chartData || []).map(d => d.date).filter(Boolean))].sort();

        if (allDates.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No Data', text: 'Fetch field data first to see available dates.', confirmButtonColor: 'var(--krishi-green)' });
            return;
        }

        if (landsatDates.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'No Landsat Imagery',
                text: 'CWSI requires Landsat thermal imagery, which was not found in the selected date range. Please select a wider date range (e.g. 3 or 6 months) to capture a clear Landsat pass.',
                confirmButtonColor: 'var(--krishi-green)'
            });
            return;
        }

        // Sort descending so the latest date is first (pre-selected)
        const sortedLandsat = [...new Set(landsatDates)].sort().reverse();
        const sortedAll = [...new Set(allDates)].sort().reverse();

        const optionsHtml = (dates, labelSuffix = '') => dates.map(d => `<option value="${d}">${d}${labelSuffix}</option>`).join('');
        const cwsiOptions = optionsHtml(sortedLandsat, ' (Landsat - Clear Thermal)');
        const etcOptions  = optionsHtml(sortedAll);

        const { value: formValues, isConfirmed } = await Swal.fire({
            title: '🔮 Generate 8-Day Forecast',
            html: `
                <div style="text-align:left; font-size:14px;">
                  <p style="margin-bottom:12px;color:#888;">Select anchor dates for each model. Landsat is required for CWSI thermal stress, Sentinel-2/any date for ETc.</p>
                  <label style="display:block;margin-bottom:4px;font-weight:600;">CWSI Anchor Date (Landsat Only)</label>
                  <select id="cwsi-date" class="swal2-select" style="width:100%;margin-bottom:12px;">${cwsiOptions}</select>
                  <label style="display:block;margin-bottom:4px;font-weight:600;">ETc Anchor Date</label>
                  <select id="etc-date" class="swal2-select" style="width:100%;">${etcOptions}</select>
                </div>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Run Forecast',
            confirmButtonColor: 'var(--krishi-green)',
            preConfirm: () => ({
                cwsiDate: document.getElementById('cwsi-date').value,
                etcDate:  document.getElementById('etc-date').value,
            }),
        });

        if (!isConfirmed || !formValues) return;

        // Clear currently selected analysis layer when starting forecast
        window.mapFunctions?.clearCurrentLayer?.();
        setSelectedLayer('');
        setCurrentLayerData(null);

        try {
            const { default: turf } = await import('@turf/turf');
            const areaSqM = turf.area(aoi);
            if (areaSqM > 5_000_000) {
                Swal.fire({ icon: 'warning', title: 'AOI Too Large', text: 'Please select an area ≤ 500 ha.', confirmButtonColor: 'var(--krishi-green)' });
                return;
            }
        } catch (_) { }

        setPhase('running');
        setProgress('Submitting job...');
        try {
            const { job_id } = await startForecast(aoi, formValues.cwsiDate, formValues.etcDate);
            setJobId(job_id);
        } catch (err) {
            setPhase('error');
            setProgress(err.message || 'Failed to start forecast');
        }
    }, [aoi, chartData, availableDates, setSelectedLayer, setCurrentLayerData]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const _zonesUrl = (variable, day) => {
        if (!jobId) return null;
        return `${BASE_URL}/api/predict_zones/${jobId}/${variable}/${day}`;
    };

    const _frameUrl = (variable, day) => {
        if (!jobId) return null;
        return getForecastFrameUrl(jobId, variable, day);
    };



    const _blobToB64 = (blob) => new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read image'));
            reader.onload = () => {
                const res = String(reader.result || '');
                const b64 = res.includes('base64,') ? res.split('base64,')[1] : res;
                resolve(b64);
            };
            reader.readAsDataURL(blob);
        } catch (e) {
            reject(e);
        }
    });

    const _fetchFramePngB64 = async (variable, dayIndex) => {
        const url = _frameUrl(variable, dayIndex);
        if (!url) return null;
        const h = await getAuthHeaders();
        const token = (h['Authorization'] || '').replace('Bearer ', '');
        const urlWithAuth = token ? `${url}?token=${token}` : url;
        const resp = await fetch(urlWithAuth);
        if (!resp.ok) throw new Error(`Failed to fetch forecast ${variable} frame`);
        const blob = await resp.blob();
        return await _blobToB64(blob);
    };



    // Prepare forecast summary image for PDF report (use backend-provided PNG)
    useEffect(() => {
        if (phase !== 'done' || !result || !result.summary_b64) return;
        setForecastReportAssets({
            createdAt: Date.now(),
            summary_png_b64: result.summary_b64,
            summary_zoned_b64: result.summary_zoned_b64,
            cwsi_dates: result.future_dates_cwsi || result.future_dates || [],
            etc_dates: result.future_dates_etc || [],
        });
    }, [phase, result, setForecastReportAssets]);

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="sidebar-forecast-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            {/* IDLE state */}
            {phase === 'idle' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔮</div>
                    <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
                        Generate an 8-day pixel-level forecast of Crop Water Stress (CWSI) and Evapotranspiration (ETc).
                    </p>
                    <button 
                        onClick={handleStart} 
                        className="btn" 
                        style={{ background: 'linear-gradient(135deg, var(--krishi-green), #0a8f42)', width: '100%', fontWeight: 'bold' }}
                    >
                        Define Anchors & Run
                    </button>
                </div>
            )}

            {/* RUNNING state */}
            {phase === 'running' && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ 
                        width: 40, height: 40, margin: '0 auto 16px', borderRadius: '50%',
                        border: '3px solid rgba(74,222,128,0.2)', borderTop: '3px solid var(--krishi-green)',
                        animation: 'spin 1s linear infinite' 
                    }} />
                    <p style={{ color: 'var(--krishi-green)', fontWeight: 600, fontSize: 14 }}>{progress || 'Starting...'}</p>
                    <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>This may take 60–120 seconds.</p>
                </div>
            )}

            {/* ERROR state */}
            {phase === 'error' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '30px', marginBottom: '10px' }}>⚠️</div>
                    <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: '8px' }}>Forecast failed</p>
                    <p style={{ color: '#64748b', fontSize: 13, wordBreak: 'break-word', marginBottom: '20px' }}>{progress}</p>
                    <button onClick={() => setPhase('idle')} className="btn" style={{ width: '100%' }}>Try Again</button>
                </div>
            )}

            {/* DONE state */}
            {phase === 'done' && result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Variable toggle */}
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                        {['cwsi', 'etc'].map(v => (
                            <button
                                key={v}
                                onClick={() => setActiveVar(v)}
                                style={{
                                    flex: 1, padding: '8px 4px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                    fontWeight: activeVar === v ? 600 : 500, fontSize: 13,
                                    background: activeVar === v ? 'white' : 'transparent',
                                    color: activeVar === v ? 'var(--krishi-green)' : '#64748b',
                                    boxShadow: activeVar === v ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {v === 'cwsi' ? 'CWSI' : 'ETc'}
                            </button>
                        ))}
                    </div>



                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
                        Select Forecast Day
                    </div>

                    {/* Vertical list of dates */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '350px', paddingRight: '4px' }}>
                        {((activeVar === 'etc' ? result.future_dates_etc : result.future_dates_cwsi) || result.future_dates || []).map((dateStr, idx) => (
                            <div 
                                key={idx}
                                onClick={() => setActiveDay(idx)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: '8px', cursor: 'pointer',
                                    border: `1px solid ${activeDay === idx ? 'var(--krishi-green)' : '#e2e8f0'}`,
                                    background: activeDay === idx ? '#f0fdf4' : 'white',
                                    boxShadow: activeDay === idx ? '0 2px 4px rgba(34, 197, 94, 0.1)' : '0 1px 2px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ 
                                        width: '28px', height: '28px', borderRadius: '50%', 
                                        background: activeDay === idx ? 'var(--krishi-green)' : '#f1f5f9',
                                        color: activeDay === idx ? 'white' : '#64748b',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 'bold', fontSize: '12px'
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <span style={{ 
                                        fontWeight: activeDay === idx ? 600 : 500,
                                        color: activeDay === idx ? '#1e293b' : '#475569',
                                        fontSize: '14px'
                                    }}>
                                        {dateStr}
                                    </span>
                                </div>
                                {activeDay === idx && (
                                    <i className="fa-solid fa-eye" style={{ color: 'var(--krishi-green)' }}></i>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    {/* Add a tiny preview of the summary map, optional? Or skip to save space. User didn't request it. */}
                </div>
            )}
        </div>
    );
}
