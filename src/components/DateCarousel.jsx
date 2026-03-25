import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { fetchAvailableDates } from '../utils/api';
import './DateCarousel.css';

function DateCarousel({ onDateSelect }) {
    const { drawnAOI, startDate, endDate, isDarkMode, selectedLayer } = useApp();
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);
    const [loading, setLoading] = useState(false);
    const carouselRef = useRef(null);

    useEffect(() => {
        if (drawnAOI && startDate && endDate) {
            loadAvailableDates();
        }
        // Only run once on mount since the key prop will handle refreshes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset selection when layer or critical parameters change
    useEffect(() => {
        setSelectedDate(null);
    }, [selectedLayer, drawnAOI, startDate, endDate]);

    const loadAvailableDates = async () => {
        try {
            setLoading(true);
            console.log('DateCarousel: Loading available dates for AOI:', drawnAOI);
            console.log('DateCarousel: Date range:', startDate, 'to', endDate);

            const response = await fetchAvailableDates(drawnAOI, startDate, endDate);

            console.log('DateCarousel: Response received:', response);

            if (response.success) {
                setAvailableDates(response.date_info || []);
                console.log('DateCarousel: Loaded', response.date_info?.length || 0, 'dates');

                // Don't auto-select any date - let user click if they want specific date
                // Otherwise layer will show composite (median) by default
            } else {
                console.error('DateCarousel: Response not successful:', response);
            }
        } catch (error) {
            console.error('DateCarousel: Failed to load available dates:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDateClick = (dateItem) => {
        setSelectedDate(dateItem.date);
        if (onDateSelect) {
            onDateSelect(dateItem.date);
        }
    };

    const scroll = (direction) => {
        if (carouselRef.current) {
            const scrollAmount = 200;
            carouselRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');
    };

    if (!drawnAOI) {
        return null;
    }

    // Show loading state while fetching dates
    if (loading && availableDates.length === 0) {
        return (
            <div className={`date-carousel-container ${isDarkMode ? 'dark' : ''}`}>
                <div className="date-carousel-header">
                    <span className="date-carousel-title">Loading Available Dates...</span>
                    <span className="date-carousel-loading">Loading...</span>
                </div>
            </div>
        );
    }

    // Filter dates based on layer requirements
    const displayDates = selectedLayer === 'vra_irrigation'
        ? availableDates.filter(d => d.sensor === 'Landsat')
        : availableDates;

    // Don't show if no dates found after loading
    if (!loading && displayDates.length === 0) {
        return null;
    }

    // Helper function to get sensor display name
    const getSensorDisplay = (sensor) => {
        if (sensor === 'Landsat') return 'L8/9';
        if (sensor === 'Sentinel-1') return 'S1/SMAP';
        if (sensor === 'Sentinel-2') {
            // Show S2/MODIS for LST layer
            return selectedLayer === 'lst' ? 'S2/MODIS' : 'S2';
        }
        return sensor; // fallback
    };

    return (
        <div className={`date-carousel-container ${isDarkMode ? 'dark' : ''}`}>
            <div className="date-carousel-header">
                <span className="date-carousel-title">Available Imagery Dates ({displayDates.length})</span>
                {loading && <span className="date-carousel-loading">Refreshing...</span>}
            </div>

            <div className="date-carousel-wrapper">
                <button
                    className="carousel-nav-btn left"
                    onClick={() => scroll('left')}
                    aria-label="Scroll left"
                >
                    ‹
                </button>

                <div className="date-carousel" ref={carouselRef}>
                    {displayDates.map((dateItem, index) => {
                        const dateObj = new Date(dateItem.date);
                        const day = dateObj.getDate();
                        const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
                        const year = dateObj.getFullYear();
                        const isSelected = selectedDate === dateItem.date;

                        return (
                            <div
                                key={index}
                                className={`date-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleDateClick(dateItem)}
                            >
                                {isSelected && (
                                    <div className="check-icon">
                                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </div>
                                )}
                                <div className="date-info">
                                    <div className="date-day">{day}</div>
                                    <div className="date-month">{month}</div>
                                    <div className="date-year">{year}</div>
                                </div>
                                <div className={`sensor-badge ${dateItem.sensor.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                                    {getSensorDisplay(dateItem.sensor)}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <button
                    className="carousel-nav-btn right"
                    onClick={() => scroll('right')}
                    aria-label="Scroll right"
                >
                    ›
                </button>
            </div>
        </div>
    );
}

export default DateCarousel;
