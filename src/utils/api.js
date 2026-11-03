// API utility for backend communication
import { auth } from '../config/firebase';
export const BASE_URL = import.meta.env.VITE_API_URL || "";

/**
 * Get authentication headers with Firebase ID token
 */
export async function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        }
    } catch (error) {
        console.error('Error getting auth token:', error);
    }

    return headers;
}


// Fetch daily data from backend - matches app2.html logic exactly
export async function fetchDailyData(aoi, startDate, endDate, fieldId = null, iotLatitude = null, iotLongitude = null) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/get_daily_data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            aoi: aoi,
            start_date: startDate,
            end_date: endDate,
            field_id: fieldId,
            iot_latitude: iotLatitude,
            iot_longitude: iotLongitude
        }),
    });

    // Try parse JSON body regardless of res.ok so we can show server error details
    let body = null;
    try {
        body = await response.json();
    } catch (parseErr) {
        // If parsing fails, leave body as null
        body = null;
    }

    // Return both response status and body for caller to handle
    return {
        ok: response.ok,
        status: response.status,
        data: body
    };
}

// Fetch irrigation calendar from backend
export async function fetchIrrigationCalendar(aoi, startDate, endDate, fieldId = null) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/get_irrigation_calendar`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aoi: aoi,
                start_date: startDate,
                end_date: endDate,
                field_id: fieldId
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching irrigation calendar:', error);
        throw error;
    }
}

// Fetch available dates with satellite imagery
export async function fetchAvailableDates(aoi, startDate, endDate) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/get_available_dates`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aoi: aoi,
                start_date: startDate,
                end_date: endDate
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching available dates:', error);
        throw error;
    }
}

// Fetch land cover analysis from backend
export async function fetchLandCoverAnalysis(aoi, startDate, endDate, timeScale = 'monthly') {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/get_land_cover_analysis`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aoi: aoi,
                start_date: startDate,
                end_date: endDate,
                time_scale: timeScale,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching land cover analysis:', error);
        throw error;
    }
}

// Fetch GEE tile URL
export async function fetchGeeTile(aoi, layer, startDate, endDate, specificDate = null, signal = null) {
    try {
        const requestBody = {
            aoi: aoi,
            layer: layer
        };

        // If specific date is provided, use it; otherwise use date range
        if (specificDate) {
            requestBody.date = specificDate;
        } else {
            requestBody.start_date = startDate;
            requestBody.end_date = endDate;
        }

        const response = await fetch(`${BASE_URL}/get_gee_tile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: signal,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching GEE tile:', error);
        throw error;
    }
}

// Fetch VRA map with Hybrid pipeline
export async function fetchVraMap(aoi, parameter, date, startDate, endDate, nZones = 3, signal = null) {
    try {
        const requestBody = {
            aoi: aoi,
            parameter: parameter,
            date: date,
            start_date: startDate,
            end_date: endDate,
            n_zones: nZones
        };

        const response = await fetch(`${BASE_URL}/get_vra_map`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: signal,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching VRA map:', error);
        throw error;
    }
}

// Generate PDF report
export async function generateReport(reportData) {
    try {
        const response = await fetch(`${BASE_URL}/generate_report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        // The response should be a PDF blob
        const blob = await response.blob();
        return blob;
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}

// Search location using multi-tier backend engine with client-side fallback
export async function searchLocation(query, lat = null, lon = null) {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    try {
        // 1. Check if query is latitude, longitude (e.g., "20.5937, 78.9629" or "20.5937 78.9629")
        const coordMatch = trimmed.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);

        if (coordMatch) {
            const parsedLat = parseFloat(coordMatch[1]);
            const parsedLon = parseFloat(coordMatch[2]);

            if (parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
                let displayName = `Coordinates: ${parsedLat}, ${parsedLon}`;
                try {
                    displayName = await reverseGeocode(parsedLat, parsedLon);
                } catch (e) {
                    console.warn('Reverse geocoding failed', e);
                }

                return [{
                    lat: parsedLat.toString(),
                    lon: parsedLon.toString(),
                    display_name: displayName
                }];
            }
        }

        // 2. Try Backend Multi-tier Search Engine (/api/search-location)
        try {
            const params = new URLSearchParams({ q: trimmed });
            if (lat !== null && lon !== null) {
                params.append('lat', lat);
                params.append('lon', lon);
            }
            const backendRes = await fetch(`${BASE_URL}/api/search-location?${params.toString()}`);
            if (backendRes.ok) {
                const data = await backendRes.json();
                if (data && Array.isArray(data.results) && data.results.length > 0) {
                    return data.results;
                }
            }
        } catch (backendErr) {
            console.warn('Backend search-location unavailable, falling back to client-side:', backendErr);
        }

        // 3. Client-side Nominatim Fallback (with countrycodes=in and addressdetails=1)
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&countrycodes=in&limit=8&addressdetails=1`;
        const response = await fetch(osmUrl);

        if (response.ok) {
            const results = await response.json();
            if (results && results.length > 0) {
                return results;
            }
        }

        // 4. Token Fallback: If compound name (e.g. "Bhairopur Tikra"), try individual tokens
        const words = trimmed.split(/[\s,]+/).filter(w => w.length >= 3);
        if (words.length >= 2) {
            for (const word of words) {
                try {
                    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(word + ' Uttar Pradesh')}&countrycodes=in&limit=3&addressdetails=1`;
                    const fbRes = await fetch(fallbackUrl);
                    if (fbRes.ok) {
                        const fbData = await fbRes.json();
                        if (fbData && fbData.length > 0) {
                            return fbData.map(item => ({
                                ...item,
                                is_fallback: true,
                                display_name: `${item.display_name} (Similar Area)`
                            }));
                        }
                    }
                } catch (e) {
                    // continue
                }
            }
        }

        return [];
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

// Reverse geocode
export async function reverseGeocode(lat, lng) {
    try {
        // Try backend reverse-geocode first
        try {
            const backendRes = await fetch(`${BASE_URL}/api/reverse-geocode?lat=${lat}&lon=${lng}`);
            if (backendRes.ok) {
                const data = await backendRes.json();
                if (data && data.data && data.data.display_name) {
                    return data.data.display_name;
                }
            }
        } catch (e) {
            console.warn('Backend reverse-geocode failed, falling back to OSM:', e);
        }

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );

        if (!response.ok) {
            throw new Error('Reverse geocoding failed');
        }

        const data = await response.json();
        return data.display_name || `Location: ${lat}, ${lng}`;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return `Location: ${lat}, ${lng}`;
    }
}

// Get detailed location (district, village)
export async function getLocationDetails(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`
        );

        if (!response.ok) {
            return { district: 'NA', village: 'NA' };
        }

        const data = await response.json();
        const address = data.address || {};
        
        // Prioritize rural and local tags commonly used in OpenStreetMap for India
        const village = address.isolated_dwelling || address.hamlet || address.village || 
                        address.neighbourhood || address.suburb || address.residential || 
                        address.locality || address.town || address.city || address.municipality || 'NA';
        
        // Extract district or county
        let district = address.state_district || address.county || address.city_district || address.region || 'NA';

        // Avoid redundancy (e.g. "Lalitpur, Lalitpur" -> "Lalitpur, Uttar Pradesh")
        if (village !== 'NA' && district !== 'NA' && village.toLowerCase() === district.toLowerCase()) {
            district = address.state || 'NA';
        }

        return { district, village };
    } catch (error) {
        console.error('getLocationDetails error:', error);
        return { district: 'NA', village: 'NA' };
    }
}

// ===================================================================
// FIELD MANAGEMENT APIs
// ===================================================================

/**
 * Get all fields for the current user
 */
export async function getFields() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/get_fields`, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching fields:', error);
        throw error;
    }
}

/**
 * Save a new field or update existing field
 */
export async function saveField(fieldData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/save_field`, {
            method: 'POST',
            headers,
            body: JSON.stringify(fieldData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error saving field:', error);
        throw error;
    }
}

/**
 * Update existing field
 */
export async function updateField(fieldId, fieldData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/update_field/${fieldId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(fieldData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating field:', error);
        throw error;
    }
}

/**
 * Delete a field
 */
export async function deleteField(fieldId) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/delete_field/${fieldId}`, {
            method: 'DELETE',
            headers
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting field:', error);
        throw error;
    }
}

/**
 * Get last irrigation calendar
 */
export async function getLastIrrigationCalendar() {
    try {
        const response = await fetch(`${BASE_URL}/api/get_last_irrigation_calendar`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching last irrigation calendar:', error);
        throw error;
    }
}

/**
 * Get total area summary for the current user directly from the database.
 * Returns { fieldCount, totalHectares, totalAcres }
 */
export async function getUserAreaSummary() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/get_user_area_summary`, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching user area summary:', error);
        throw error;
    }
}

// ===================================================================
// EXPENDITURE APIs
// ===================================================================

export async function addExpenditure(expenditureData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/add_expenditure`, {
            method: 'POST',
            headers,
            body: JSON.stringify(expenditureData)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error adding expenditure:', error);
        throw error;
    }
}

export async function getExpenditures(fieldId = null) {
    try {
        const headers = await getAuthHeaders();
        let url = `${BASE_URL}/api/get_expenditures`;
        if (fieldId) {
            url += `?field_id=${fieldId}`;
        }
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching expenditures:', error);
        throw error;
    }
}

export async function deleteExpenditure(expId) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/delete_expenditure/${expId}`, {
            method: 'DELETE',
            headers
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error deleting expenditure:', error);
        throw error;
    }
}

// ===================================================================
// IOT SENSOR APIs
// ===================================================================

/**
 * Get IoT Config for a field
 */
export async function getIoTConfig(fieldId) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/fields/${fieldId}/iot-config`, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching IoT config:', error);
        throw error;
    }
}

/**
 * Save/Update IoT Config for a field
 */
export async function saveIoTConfig(fieldId, configData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BASE_URL}/api/fields/${fieldId}/iot-config`, {
            method: 'POST',
            headers,
            body: JSON.stringify(configData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error saving IoT config:', error);
        throw error;
    }
}

/**
 * Get IoT sensor data for a field, optionally forcing a sync with ThingSpeak
 */
export async function getIoTData(fieldId, sync = false, startDate = null, endDate = null, interval = null) {
    try {
        const headers = await getAuthHeaders();
        let url = `${BASE_URL}/api/fields/${fieldId}/iot-data?sync=${sync}`;
        if (startDate) {
            url += `&start_date=${startDate}`;
        }
        if (endDate) {
            url += `&end_date=${endDate}`;
        }
        if (interval) {
            url += `&interval=${interval}`;
        }
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching IoT data:', error);
        throw error;
    }
}

/**
 * Upload a Drone GeoTIFF file (.tif/.tiff)
 */
export async function uploadDrone(file) {
    try {
        const headers = await getAuthHeaders();
        // Delete Content-Type to let browser set boundary for multipart/form-data
        delete headers['Content-Type'];

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${BASE_URL}/api/upload_drone`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error uploading drone GeoTIFF:', error);
        throw error;
    }
}

// =====================================================================
// FORECAST PREDICTION APIs
// =====================================================================
/**
 * Start an 8-day CWSI + ETc forecast job.
 * Returns { job_id, status } immediately (job runs in background).
 */
export async function startForecast(aoi, cwsiDate, etcDate) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/api/predict_forecast`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ aoi, cwsi_date: cwsiDate, etc_date: etcDate }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
}

/**
 * Poll forecast job status.
 * Returns { job_id, status, progress, result? }
 */
export async function pollForecast(jobId) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/api/predict_status/${jobId}`, { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
}

/**
 * Returns the URL for a single forecast frame PNG overlay.
 * variable: 'cwsi' | 'etc' day: 0-based
 */
export function getForecastFrameUrl(jobId, variable, day) {
    return `${BASE_URL}/api/predict_frame/${jobId}/${variable}/${day}`;
}

/**
 * Fetch simplified Agro-Climatic Zones GeoJSON for map display.
 */
export async function getAgroClimaticZones() {
    const response = await fetch(`${BASE_URL}/api/agroclimatic_zones`);
    if (!response.ok) {
        throw new Error(`Failed to fetch agro-climatic zones: HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch the specific Agro-Climatic Zone for an AOI or coordinate pair.
 */
export async function getFieldAgroClimaticZone(data) {
    const response = await fetch(`${BASE_URL}/api/agroclimatic_zone_for_field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch field agro-climatic zone: HTTP ${response.status}`);
    }
    return response.json();
}

// ===================================================================
// Export all API functions
// ===================================================================

export default {
    // Auth
    getAuthHeaders,

    // Data fetching
    fetchDailyData,
    fetchIrrigationCalendar,
    fetchAvailableDates,
    fetchLandCoverAnalysis,
    fetchGeeTile,
    fetchVraMap,
    uploadDrone,

    // Forecast
    startForecast,
    pollForecast,
    getForecastFrameUrl,

    // Reports
    generateReport,

    // Agro-Climatic Zones
    getAgroClimaticZones,
    getFieldAgroClimaticZone,

    // Field management
    getFields,
    saveField,
    updateField,
    deleteField,
    getLastIrrigationCalendar,
    getUserAreaSummary,

    // Location
    searchLocation,
    reverseGeocode,
    getLocationDetails,

    // Expenditures
    addExpenditure,
    getExpenditures,
    deleteExpenditure,

    // IoT Sensors
    getIoTConfig,
    saveIoTConfig,
    getIoTData,
};

