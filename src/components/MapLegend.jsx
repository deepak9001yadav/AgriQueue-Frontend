import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const layerLegends = {
    ndvi: {
        title: 'NDVI',
        items: [
            { color: '#006400', label: 'Excellent' },
            { color: '#228B22', label: 'Good' },
            { color: '#32CD32', label: 'Moderate' },
            { color: '#FFD700', label: 'Needs Attention' },
            { color: '#8B4513', label: 'Poor' },
        ],
    },
    savi: {
        title: 'SAVI',
        items: [
            { color: '#006400', label: 'Full Crop' },
            { color: '#32CD32', label: 'Healthy Crop' },
            { color: '#FFFF00', label: 'Sparse Crop' },
            { color: '#8B4513', label: 'Mostly Soil' },
        ],
    },
    evi: {
        title: 'EVI ',
        items: [
            { color: '#006400', label: 'Very High (> 0.7)' },
            { color: '#00FF00', label: 'High (0.5 - 0.7)' },
            { color: '#7FFF00', label: 'Moderate (0.3 - 0.5)' },
            { color: '#FFFF00', label: 'Low (0.1 - 0.3)' },
            { color: '#F4A460', label: 'Very Low (0 - 0.1)' },
            { color: '#8B4513', label: 'Bare (< 0)' },
        ],
    },
    cwsi: {
        title: 'CWSI (Water Stress)',
        items: [
            { color: '#FF0000', label: 'Extreme' },
            { color: '#FF6666', label: 'Moderate' },
            { color: '#FFFF00', label: 'Need Attention' },
            { color: '#87CEEB', label: 'Fair' },
            { color: '#0000FF', label: 'Healthy' },
        ],
    },
    lst: {
        title: 'Temperature (°C)',
        items: [
            { color: '#8B0000', label: '> 47°C (Hot)' },
            { color: '#FF4500', label: '37 - 47°C' },
            { color: '#FFA500', label: '27 - 37°C' },
            { color: '#FFFF00', label: '17 - 27°C' },
            { color: '#00FFFF', label: '7 - 17°C' },
            { color: '#0000FF', label: '< 7°C (Cool)' },
        ],
    },
    lai: {
        title: 'LAI (Leaf Area Index)',
        items: [
            { color: '#006400', label: 'High (> 4.5)' },
            { color: '#228B22', label: 'Moderate (3 - 4.5)' },
            { color: '#32CD32', label: 'Low (1.5 - 3)' },
            { color: '#FFD700', label: 'Very Low (0.5 - 1.5)' },
            { color: '#964B00', label: 'Minimal (< 0.5)' },
        ],
    },
    kc: {
        title: 'Kc (Crop Coefficient)',
        items: [
            { color: '#00FF00', label: 'High (Peak Growth)' },
            { color: '#7FFF00', label: 'Mid-High Growth' },
            { color: '#FFFF00', label: 'Moderate (Mid Season)' },
            { color: '#FF7F00', label: 'Early Growth' },
            { color: '#FF0000', label: 'Low (Initial Phase)' },
        ],
    },
    etc: {
        title: 'ETc (mm/day)',
        items: [
            { color: '#D7191C', label: 'Very High Water Use' },
            { color: '#FDAE61', label: 'High Water Use' },
            { color: '#FFFFBF', label: 'Moderate Water Use' },
            { color: '#ABD9E9', label: 'Low Water Use' },
            { color: '#2C7BB6', label: 'Very Low Water Use' },




        ],
    },
    irrigation_need: {
        title: 'Irrigation Need (mm/day)',
        items: [
            { color: '#C62828', label: 'Heavy Watering Needed' },
            { color: '#F57C00', label: 'Medium Watering Needed' },
            { color: '#FFB74D', label: 'Light Watering Needed' },
            { color: '#FFF9C4', label: 'Minimal Watering Needed' },
            { color: '#E8F5E9', label: 'No Watering Needed' },
        ],
    },
    vra_ndvi: {
        title: 'NDVI Zones',
        items: [
            { color: '#00441b', label: 'Highest' },
            { color: '#238b45', label: 'High' },
            { color: '#74c476', label: 'Moderate' },
            { color: '#c7e9c0', label: 'Low' },
            { color: '#f7fcf5', label: 'Lowest' },
        ],
    },
    vra_savi: {
        title: 'SAVI',
        items: [
            { color: '#00441b', label: 'Highest' },
            { color: '#238b45', label: 'High' },
            { color: '#74c476', label: 'Moderate' },
            { color: '#c7e9c0', label: 'Low' },
            { color: '#f7fcf5', label: 'Lowest' },
        ],
    },
    vra_lai: {
        title: 'Leaf Area Index',
        items: [
            { color: '#00441b', label: 'Highest' },
            { color: '#238b45', label: 'High' },
            { color: '#74c476', label: 'Moderate' },
            { color: '#c7e9c0', label: 'Low' },
            { color: '#f7fcf5', label: 'Lowest' },
        ],
    },
    vra_cwsi: {
        title: 'Water Stress Zones',
        items: [
            { color: '#E57373', label: 'Severe Stress' },
            { color: '#FFB74D', label: 'High Stress' },
            { color: '#FFFF8D', label: 'Moderate' },
            { color: '#4FC3F7', label: 'Low Stress' },
            { color: '#81D4FA', label: 'No Stress' },
        ],
    },
    vra_irrigation_need: {
        title: 'Irrigation Need Zones',
        items: [
            { color: '#08306b', label: 'Highest Need' },
            { color: '#2171b5', label: 'High Need' },
            { color: '#6baed6', label: 'Moderate' },
            { color: '#c6dbef', label: 'Low Need' },
            { color: '#f7fbff', label: 'Minimal' },
        ],
    },
    vra_kc: {
        title: 'Crop Coefficient Zones',
        items: [
            { color: '#004529', label: 'Highest' },
            { color: '#238443', label: 'High' },
            { color: '#78C679', label: 'Moderate' },
            { color: '#D9F0A3', label: 'Low' },
            { color: '#FFFFE5', label: 'Lowest' },
        ],
    },
    vra_soilmoisture: {
        title: 'Soil Moisture Zones',
        items: [
            { color: '#08306b', label: 'Highest' },
            { color: '#2171b5', label: 'High' },
            { color: '#6baed6', label: 'Moderate' },
            { color: '#c6dbef', label: 'Low' },
            { color: '#f7fbff', label: 'Lowest' },
        ],
    },
    vra_lst: {
        title: 'Temperature Zones',
        items: [
            { color: '#bd0026', label: 'Hottest' },
            { color: '#f03b20', label: 'Hot' },
            { color: '#feb24c', label: 'Moderate' },
            { color: '#ffeda0', label: 'Cool' },
            { color: '#ffffcc', label: 'Coolest' },
        ],
    },
    vra_etc: {
        title: 'Evapotranspiration Zones',
        items: [
            { color: '#54278f', label: 'Highest' },
            { color: '#756bb1', label: 'High' },
            { color: '#9e9ac8', label: 'Moderate' },
            { color: '#c6dbef', label: 'Low' },
            { color: '#f7fcfd', label: 'Lowest' },
        ],
    },
    vra_irrigation: {
        title: 'Irrigation Zones',
        items: [
            { color: '#FF0000', label: 'Urgent Irrigation' },
            { color: '#FFFF00', label: 'Moderate Irrigation' },
            { color: '#00FF00', label: 'No Irrigation' },
        ],
    },

    soilmoisture: {
        title: 'Soil Moisture (%)',
        items: [
            { color: 'blue', label: 'Very High (> 80%)' },
            { color: 'darkgreen', label: 'High (60 - 80%)' },
            { color: 'lightgreen', label: 'Moderate (40 - 60%)' },
            { color: 'yellow', label: 'Low (20 - 40%)' },
            { color: 'brown', label: 'Very Low (< 20%)' },
        ],
    },
    pca: {
        title: 'Crop Health ',
        items: [
            { color: '#1a9850', label: 'Very Healthy' },
            { color: '#91cf60', label: 'Healthy' },
            { color: '#fee08b', label: 'Average' },
            { color: '#fc8d59', label: 'Poor' },
            { color: '#d73027', label: 'Very Poor' },
        ],
    },
    vra_pca: {
        title: 'Crop Health Zones',
        items: [
            { color: '#00441b', label: 'Highest Potential' },
            { color: '#238b45', label: 'High Potential' },
            { color: '#74c476', label: 'Moderate' },
            { color: '#c7e9c0', label: 'Low Potential' },
            { color: '#f7fcf5', label: 'Lowest/Monitor' },
        ],
    },
    // RGB/TCC layers don't need a legend - they're visual representations
};

function MapLegend({ layerType, stats }) {
    const { isDarkMode } = useApp();
    const [position, setPosition] = useState({ x: 20, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed
    const dragStartRef = useRef({ x: 0, y: 0 });
    const dragMovedRef = useRef(false);
    const legendRef = useRef(null);

    const legend = layerLegends[layerType];

    // Determine items to display: Prefer dynamic 'stats' if it's an array (VRA classes), otherwise use static legend
    const displayItems = Array.isArray(stats) ? stats.map((item, i) => {
        let label = `Zone ${item['class']}`;
        if (legend && legend.items) {
            let staticItem = legend.items.find(si =>
                si.color.toLowerCase() === item.color.toLowerCase()
            );
            if (!staticItem) {
                if (legend.items.length === stats.length) {
                    staticItem = legend.items[legend.items.length - 1 - i];
                }
            }
            if (staticItem) {
                label = staticItem.label;
            }
        }
        const hasRange = item.min != null && item.max != null;
        const labelWithRange = hasRange
            ? `${label} (${Number(item.min).toFixed(2)} - ${Number(item.max).toFixed(2)})`
            : label;

        return {
            color: item.color,
            label: labelWithRange
        };
    }) : (legend ? legend.items : []);

    const title = legend ? legend.title : layerType;

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragMovedRef.current = false;
        dragStartRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !legendRef.current) return;

        dragMovedRef.current = true;

        const mapContainer = legendRef.current.closest('.main-panel');
        if (!mapContainer) return;

        const containerRect = mapContainer.getBoundingClientRect();
        const legendRect = legendRef.current.getBoundingClientRect();

        let newX = e.clientX - dragStartRef.current.x;
        let newY = e.clientY - dragStartRef.current.y;

        const minX = 10;
        const minY = 10;
        const maxX = containerRect.width - legendRect.width - 10;
        const maxY = containerRect.height - legendRect.height - 10;

        newX = Math.max(minX, Math.min(newX, maxX));
        newY = Math.max(minY, Math.min(newY, maxY));

        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Clamp position on window resize or container change
    useEffect(() => {
        const clampPosition = () => {
            if (!legendRef.current) return;
            const mapContainer = legendRef.current.closest('.main-panel');
            if (!mapContainer) return;

            const containerRect = mapContainer.getBoundingClientRect();
            const legendRect = legendRef.current.getBoundingClientRect();

            const minX = 10;
            const minY = 10;
            const maxX = Math.max(minX, containerRect.width - legendRect.width - 10);
            const maxY = Math.max(minY, containerRect.height - legendRect.height - 10);

            setPosition(prev => ({
                x: Math.max(minX, Math.min(prev.x, maxX)),
                y: Math.max(minY, Math.min(prev.y, maxY))
            }));
        };

        const resizeObserver = new ResizeObserver(clampPosition);
        const mapContainer = legendRef.current?.closest('.main-panel');
        if (mapContainer) {
            resizeObserver.observe(mapContainer);
        }

        window.addEventListener('resize', clampPosition);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', clampPosition);
        };
    }, []);

    const toggleExpand = (e) => {
        // Only toggle if we didn't actually drag the element
        if (!dragMovedRef.current) {
            setIsExpanded(!isExpanded);
        }
    };

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    if (!legend && !Array.isArray(stats)) return null;

    return (
        <div
            ref={legendRef}
            className={`map-legend ${isExpanded ? 'expanded' : 'collapsed'}`}
            style={{
                position: 'absolute',
                top: position.y,
                left: position.x,
                cursor: isDragging ? 'grabbing' : 'pointer',
                transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 1100
            }}
            onMouseDown={handleMouseDown}
            onClick={toggleExpand}
        >

            <div className="legend-header">
                {/*<i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-list-ul'} legend-toggle-icon`}></i>*/}
                <span className="legend-title">{isExpanded ? title : 'Legend'}</span>
                {!isExpanded && <div className="legend-preview-colors">
                    {displayItems.slice(0, 3).map((item, i) => (
                        <div key={i} className="preview-dot" style={{ backgroundColor: item.color }}></div>
                    ))}
                </div>}
            </div>

            {isExpanded && (
                <div className="legend-body">
                    <div className="legend-content-wrapper">
                        <div className="legend-gradient-bar"
                            style={{
                                background: displayItems.length > 1
                                    ? `linear-gradient(to bottom, ${displayItems.map(item => item.color).join(', ')})`
                                    : (displayItems[0]?.color || 'transparent'),
                            }}
                        ></div>
                        <div className="legend-scale">
                            {displayItems.map((item, index) => (
                                <div key={index} className="legend-item">
                                    <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                                    <span className="legend-label">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MapLegend;
