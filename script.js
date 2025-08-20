document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const API_BASE_URL = 'http://localhost:3000/api'; // Your backend server URL

    // --- DOM ELEMENTS ---
    const donorForm = document.getElementById('donor-register-form');
    const seekerForm = document.getElementById('seeker-search-form');
    const registerBtn = document.getElementById('register-btn');
    const searchBtn = document.getElementById('search-btn');
    const registerStatus = document.getElementById('register-status');
    const searchStatus = document.getElementById('search-status');
    const resultsList = document.getElementById('results-list');
    
    // --- MAP INITIALIZATION ---
    // Initialize the map and set its view to a default location (e.g., center of India)
    const map = L.map('map').setView([20.5937, 78.9629], 5);
    let userMarker = null; // To hold the marker for the searcher's location
    let donorMarkers = []; // To hold markers for found donors

    // Add a tile layer to the map (the map's visual background)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);


    // --- EVENT LISTENERS ---

    /**
     * Handles the donor registration form submission.
     */
    donorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoadingState(registerBtn, true, 'Registering...');
        clearStatus(registerStatus);

        const formData = new FormData(donorForm);
        const data = Object.fromEntries(formData.entries());

        try {
            // Step 1: Geocode the address to get coordinates
            const coords = await geocodeAddress(data.address);
            if (!coords) {
                throw new Error("Could not find location for the provided address. Please be more specific.");
            }

            const payload = {
                ...data,
                latitude: coords.lat,
                longitude: coords.lon
            };

            // Step 2: Send data to the backend API
            const response = await fetch(`${API_BASE_URL}/donors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || 'Registration failed.');
            }

            const result = await response.json();
            showStatus(registerStatus, `Registration successful! Your Donor ID is ${result.donorId}`, true);
            donorForm.reset();

        } catch (error) {
            showStatus(registerStatus, error.message, false);
        } finally {
            setLoadingState(registerBtn, false, 'Register as a Donor');
        }
    });

    /**
     * Handles the blood seeker search form submission.
     */
    seekerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setLoadingState(searchBtn, true, 'Searching...');
        clearStatus(searchStatus);
        resultsList.innerHTML = '<p>Searching for donors...</p>';
        clearMap();

        const bloodGroup = document.getElementById('searchBloodGroup').value;

        try {
            // Step 1: Get user's current location
            const position = await getCurrentLocation();
            const { latitude, longitude } = position.coords;
            
            // Add a marker for the user's location
            userMarker = L.marker([latitude, longitude]).addTo(map)
                .bindPopup('Your Location').openPopup();
            map.setView([latitude, longitude], 13); // Center map on user

            // Step 2: Call the backend search API
            const response = await fetch(`${API_BASE_URL}/donors/search?latitude=${latitude}&longitude=${longitude}&bloodGroup=${bloodGroup}`);
            
            if (!response.ok) {
                throw new Error('Could not fetch donor data.');
            }

            const donors = await response.json();
            displayResults(donors);

        } catch (error) {
            showStatus(searchStatus, error.message, false);
            resultsList.innerHTML = `<p class="error">${error.message}</p>`;
        } finally {
            setLoadingState(searchBtn, false, 'Search Nearby');
        }
    });


    // --- HELPER FUNCTIONS ---

    /**
     * Converts a physical address to latitude and longitude using Nominatim API.
     * @param {string} address The address to geocode.
     * @returns {Promise<object|null>} A promise that resolves to {lat, lon} or null.
     */
    async function geocodeAddress(address) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
            return null;
        } catch (error) {
            console.error('Geocoding error:', error);
            return null;
        }
    }

    /**
     * Gets the user's current geographical location.
     * @returns {Promise<GeolocationPosition>} A promise that resolves with the position.
     */
    function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser.'));
            }
            navigator.geolocation.getCurrentPosition(resolve, () => {
                reject(new Error('Unable to retrieve your location. Please enable location services.'));
            });
        });
    }

    /**
     * Displays the list of donors and adds markers to the map.
     * @param {Array} donors - An array of donor objects from the API.
     */
    function displayResults(donors) {
        if (donors.length === 0) {
            resultsList.innerHTML = '<p>No donors found within a 15km radius for the selected blood group.</p>';
            return;
        }

        resultsList.innerHTML = donors.map(donor => `
            <div class="donor-item">
                <strong>Name:</strong> ${donor.name}<br>
                <strong>Blood Group:</strong> ${donor.bloodGroup}<br>
                <strong>Phone:</strong> ${donor.phone}<br>
                <strong>Distance:</strong> ${donor.distance.toFixed(2)} km away
            </div>
        `).join('');

        donors.forEach(donor => {
            const marker = L.marker([donor.latitude, donor.longitude]).addTo(map)
                .bindPopup(`<b>${donor.name}</b><br>Blood Group: ${donor.bloodGroup}<br>Phone: ${donor.phone}`);
            donorMarkers.push(marker);
        });
    }

    /**
     * Clears all markers from the map.
     */
    function clearMap() {
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
        donorMarkers.forEach(marker => map.removeLayer(marker));
        donorMarkers = [];
    }
    
    // --- UI UTILITY FUNCTIONS ---
    function setLoadingState(button, isLoading, loadingText) {
        button.disabled = isLoading;
        button.textContent = isLoading ? loadingText : button.dataset.originalText || button.textContent;
        if (!isLoading) {
            delete button.dataset.originalText;
        } else if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
    }

    function showStatus(element, message, isSuccess) {
        element.textContent = message;
        element.className = 'status-message'; // Reset classes
        element.classList.add(isSuccess ? 'success' : 'error');
    }

    function clearStatus(element) {
        element.textContent = '';
        element.className = 'status-message';
    }
});
