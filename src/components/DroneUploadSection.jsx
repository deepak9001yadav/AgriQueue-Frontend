import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { uploadDrone } from '../utils/api';
import Swal from 'sweetalert2';

export default function DroneUploadSection() {
    const { droneLayer, setDroneLayer, setOpacity } = useApp();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);

    const handleFile = async (file) => {
        if (!file) return;
        
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'tif' && ext !== 'tiff') {
            Swal.fire({
                icon: 'error',
                title: 'Invalid File Format',
                text: 'Please upload only a valid GeoTIFF file (.tif or .tiff)',
                confirmButtonColor: 'var(--krishi-green, #4caf50)'
            });
            return;
        }

        setUploadProgress(true);
        setUploadError('');
        
        try {
            const result = await uploadDrone(file);
            if (result.success) {
                setDroneLayer(result);
                setOpacity(80); // Set default opacity to 80% for overlay clarity
                
                // Fly to bounds if mapFunctions is registered globally
                if (result.bounds && window.mapFunctions?.flyToBounds) {
                    // flat [minLat, minLon, maxLat, maxLon] -> Leaflet nested
                    const bounds = [
                        [result.bounds[0], result.bounds[1]],
                        [result.bounds[2], result.bounds[3]]
                    ];
                    window.mapFunctions.flyToBounds(bounds);
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Drone Imagery Loaded!',
                    text: `Successfully processed ${file.name} (${result.type.toUpperCase()})`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                throw new Error(result.error || 'Unknown upload error');
            }
        } catch (error) {
            console.error('Drone upload failed:', error);
            setUploadError(error.message || 'Processing failed. Make sure your GeoTIFF has correct coordinate systems.');
            Swal.fire({
                icon: 'error',
                title: 'Processing Failed',
                text: error.message || 'Make sure your GeoTIFF is not corrupted and contains georeferencing.',
                confirmButtonColor: '#ff5722'
            });
        } finally {
            setUploadProgress(false);
        }
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleSelectClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };

    const handleClearLayer = () => {
        setDroneLayer(null);
    };

    return (
        <div className="sb2-panel drone-upload-panel">
            <div className="sb2-section-label">
                <i className="fa-solid fa-helicopter"></i> Drone Data Induction
            </div>
            
            {!droneLayer ? (
                <div 
                    className={`drone-dropzone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={handleSelectClick}
                    style={{
                        border: '2px dashed var(--krishi-green, #4caf50)',
                        borderRadius: '12px',
                        padding: '30px 15px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragging ? 'rgba(76, 175, 80, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.03))',
                        transition: 'all 0.3s ease',
                        marginBottom: '15px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px'
                    }}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".tif,.tiff" 
                        style={{ display: 'none' }}
                    />
                    {uploadProgress ? (
                        <div className="drone-spinner-wrapper" style={{ padding: '20px 0' }}>
                            <i className="fa-solid fa-circle-notch fa-spin fa-3x" style={{ color: 'var(--krishi-green, #4caf50)' }}></i>
                            <div style={{ marginTop: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Warp, Color &amp; Calculate Stats...
                            </div>
                        </div>
                    ) : (
                        <>
                            <i className="fa-solid fa-cloud-arrow-up fa-3x" style={{ color: 'var(--krishi-green, #4caf50)' }}></i>
                            <h4 style={{ margin: '5px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Drag &amp; Drop GeoTIFF
                            </h4>
                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary, #888)' }}>
                                Supports .tif or .tiff formats up to 50MB
                            </p>
                            <button 
                                className="btn action-btn-sm" 
                                type="button"
                                style={{ marginTop: '5px', pointerEvents: 'none' }}
                            >
                                Browse Files
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="drone-success-card" style={{
                    background: 'var(--card-bg, rgba(255,255,255,0.03))',
                    borderRadius: '12px',
                    padding: '15px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    marginBottom: '15px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ 
                            fontSize: '11px', 
                            padding: '3px 8px', 
                            background: 'rgba(76, 175, 80, 0.15)', 
                            color: 'var(--krishi-green, #4caf50)',
                            borderRadius: '4px',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                        }}>
                            {droneLayer.type} Product
                        </span>
                        <button 
                            onClick={handleClearLayer}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ff5722',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Remove Drone Image"
                        >
                            <i className="fa-solid fa-trash-can"></i> Clear
                        </button>
                    </div>

                    <h4 style={{ margin: '0 0 5px 0', fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                        {droneLayer.name}
                    </h4>

                    {/* Stats table if present */}
                    {droneLayer.stats && (
                        <div className="drone-stats-mini" style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                <i className="fa-solid fa-chart-simple"></i> Raster Statistics
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '6px'
                            }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Mean</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{droneLayer.stats.mean}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Median</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{droneLayer.stats.median}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Min</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{droneLayer.stats.min}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Max</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{droneLayer.stats.max}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {uploadError && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(244, 67, 54, 0.1)',
                    borderLeft: '3px solid #f44336',
                    borderRadius: '4px',
                    color: '#f44336',
                    fontSize: '11px',
                    lineHeight: 1.4,
                    marginBottom: '15px'
                }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> {uploadError}
                </div>
            )}
        </div>
    );
}
