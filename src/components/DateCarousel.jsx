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
                const BASE_URL = import.meta.env.VITE_API_URL || "";
                const response = await fetch(`${BASE_URL}/api/s2_cloud_info`, {
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

            {dateItems.length > 0 && (
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
                                                                    <div className={`date-cloud-badge ${
                                        getCloudPctDisplay(item) > 80 ? 'critical' : 
                                        getCloudPctDisplay(item) > 30 ? 'warning' : 'clear'
                                    }`}>
                                        <div className="cloud-icon-mini">
                                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.5 19c3.037 0 5.5-2.463 5.5-5.5 0-2.97-2.354-5.382-5.28-5.492C17.433 4.116 14.156 1.5 10.5 1.5 6.136 1.5 2.6 4.936 2.502 9.245 0.536 10.147 0 12.015 0 14c0 3.314 2.686 6 6 6h11.5"></path>
                                            </svg>
                                        </div>
                                        <span>{getCloudPctDisplay(item)}%</span>
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
            )}
        </div>
    );
};

export default DateCarousel;
