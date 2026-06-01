// API utility for backend communication
import { auth } from '../config/firebase';
const BASE_URL = import.meta.env.VITE_API_URL || "";

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
export async function fetchDailyData(aoi, startDate, endDate, fieldId = null) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/get_daily_data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            aoi: aoi,
            start_date: startDate,
            end_date: endDate,
            field_id: fieldId
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

// Fetch VRA map with Jenks classification
export async function fetchVraMap(aoi, parameter, date, startDate, endDate, signal = null) {
    try {
        const requestBody = {
            aoi: aoi,
            parameter: parameter,
            date: date,
            start_date: startDate,
            end_date: endDate
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

// Search location using Nominatim API
export async function searchLocation(query) {
    try {
        // Check if query is latitude, longitude (e.g., "20.5937, 78.9629" or "20.5937 78.9629")
        // Basic match for digits, decimal points, and optional comma separation
        const coordMatch = query.trim().match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);

        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lon = parseFloat(coordMatch[2]);

            // Validate ranges
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                let displayName = `Coordinates: ${lat}, ${lon}`;
                try {
                    const reverseResponse = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
                    );
                    if (reverseResponse.ok) {
                        const data = await reverseResponse.json();
                        if (data && data.display_name) {
                            displayName = data.display_name;
                        }
                    }
                } catch (e) {
                    console.warn('Reverse geocoding failed', e);
                }

                return [{
                    lat: lat.toString(),
                    lon: lon.toString(),
                    display_name: displayName
                }];
            }
        }

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`
        );

        if (!response.ok) {
            throw new Error('Search failed');
        }

        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

// Reverse geocode
export async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );

        if (!response.ok) {
            throw new Error('Reverse geocoding failed');
        }

        const data = await response.json();
        return data.display_name || 'Unknown location';
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return 'Unknown location';
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
export async function getIoTData(fieldId, sync = false, startDate = null, endDate = null) {
    try {
        const headers = await getAuthHeaders();
        let url = `${BASE_URL}/api/fields/${fieldId}/iot-data?sync=${sync}`;
        if (startDate) {
            url += `&start_date=${startDate}`;
        }
        if (endDate) {
            url += `&end_date=${endDate}`;
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

    // Reports
    generateReport,

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

