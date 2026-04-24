import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import './DateCarousel.css';

const DateCarousel = ({ onDateSelect }) => {
    const { drawnAOI, startDate, endDate } = useApp();
    const [dateItems, setDateItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const carouselRef = useRef(null);

    useEffect(() => {
        const fetchCloudInfo = async () => {
            if (!drawnAOI || !startDate || !endDate) return;
            
            setLoading(true);
            try {
                const response = await fetch('http://localhost:5000/api/s2_cloud_info', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        aoi: drawnAOI, 
                        start_date: startDate, 
                        end_date: endDate 
                    }),
                });
                
                const result = await response.json();
                
                if (result.success) {
                    setDateItems(result.data || []);
                }
            } catch (error) {
                console.error('Error fetching cloud info:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCloudInfo();
    }, [drawnAOI, startDate, endDate]);

    const getCloudPctDisplay = (dateItem) => {
        const pct = dateItem?.cloud_pct_aoi;
        return pct !== undefined ? Number(pct).toFixed(1) : '0.0';
    };

    const formatDateParts = (dateStr) => {
        const date = new Date(dateStr);
        return {
            day: date.getDate(),
            month: date.toLocaleString('default', { month: 'short' }).toUpperCase(),
            year: date.getFullYear()
        };
    };

    const scroll = (direction) => {
        if (carouselRef.current) {
            const scrollAmount = 240;
            carouselRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const handleDateClick = (item) => {
        setSelectedDate(item.date);
        if (onDateSelect) onDateSelect(item.date);
    };

    if (!drawnAOI) return null;

    return (
        <div className="date-carousel-container">
            <div className="date-carousel-header">
                <span className="date-carousel-title">Available Imagery Dates ({dateItems.length})</span>
                {loading && <div className="loading-spinner-tiny"></div>}
            </div>

            <div className="date-carousel-wrapper">
                <button className="carousel-nav-btn left" onClick={() => scroll('left')}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>

                <div className="date-carousel" ref={carouselRef}>
                    {dateItems.map((item, index) => {
                        const { day, month, year } = formatDateParts(item.date);
                        const isSelected = selectedDate === item.date;
                        return (
                            <div 
                                key={index} 
                                className={`date-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleDateClick(item)}
                            >
                                {isSelected && (
                                    <div className="check-icon">
                                        <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="4" fill="none">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </div>
                                )}
                                <div className="date-info">
                                    <span className="date-day">{day}</span>
                                    <span className="date-month">{month}</span>
                                    <span className="date-year">{year}</span>
                                </div>
                                
                                <div className="date-cloud-badge">
                                    <div className="cloud-icon-mini">
                                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                                            <path d="M17.5,19c-3.037,0-5.5-2.463-5.5-5.5c0-0.038,0.002-0.076,0.005-0.113C10.222,12.518,9,10.903,9,9c0-2.209,1.791-4,4-4 c0.218,0,0.43,0.018,0.635,0.052C14.498,3.398,16.113,2,18,2c2.209,0,4,1.791,4,4c0,0.187-0.013,0.37-0.038,0.55 C22.903,7.498,24,9.113,24,11c0,2.209-1.791,4-4,4c-0.187,0-0.37-0.013-0.55-0.038C18.502,17.602,16.887,19,15,19 c-0.11,0-0.218-0.004-0.325-0.012C14.113,21.311,12,23,9.5,23C6.463,23,4,20.537,4,17.5c0-0.11,0.004-0.218,0.012-0.325 C1.689,16.613,0,14.5,0,12c0-3.314,2.686-6,6-6c0.187,0,0.37,0.01,0.55,0.028C7.602,3.387,9.713,2,12,2c2.485,0,4.5,2.015,4.5,4.5 c0,0.204-0.014,0.404-0.04,0.6C17.498,7.387,18.613,8.5,20,8.5c1.381,0,2.5,1.119,2.5,2.5c0,1.381-1.119,2.5-2.5,2.5 c-0.204,0-0.404-0.014-0.6-0.04C18.613,14.502,17.5,15.613,17.5,17V19z"/>
                                        </svg>
                                    </div>
                                    {getCloudPctDisplay(item)}%
                                </div>
                            </div>
                        );
                    })}
                </div>

                <button className="carousel-nav-btn right" onClick={() => scroll('right')}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default DateCarousel;
