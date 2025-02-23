import { initMap, validateAddress, clearMarkers, addMarker, displayPharmacies } from './maps.js';
import { setupDrugAutocomplete } from './medicine.js';

let map;

function setupFormHandler() {
    document.getElementById('addressForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusDiv = document.getElementById('status');
        const mapDiv = document.getElementById('map');
        const initialLogo = document.getElementById('initialLogo');
        const headerLogo = document.querySelector('.header');
        const pharmacyListDiv = document.getElementById('pharmacyList');
        
        statusDiv.className = '';
        statusDiv.textContent = 'Validating address...';

        try {
            const address = document.getElementById('address').value;
            const validatedAddress = await validateAddress(address);

            initialLogo.style.display = 'none';
            mapDiv.style.display = 'block';
            headerLogo.style.display = 'flex';
            pharmacyListDiv.style.display = 'block';

            map.setCenter(validatedAddress.location);
            map.setZoom(13);

            clearMarkers();

            addMarker(
                validatedAddress.location,
                'Your Location',
                '📍'
            );

            statusDiv.className = 'success';
            statusDiv.textContent = 'Finding nearby pharmacies...';

            const pharmacyResponse = await fetch('/nearby-pharmacies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ location: validatedAddress.location })
            });

            const pharmacyData = await pharmacyResponse.json();
            
            if (!pharmacyData.success) {
                throw new Error(pharmacyData.error);
            }

            displayPharmacies(pharmacyData.data);
            
            statusDiv.textContent = `Found ${pharmacyData.data.length} nearby pharmacies`;

        } catch (error) {
            statusDiv.className = 'error';
            statusDiv.textContent = 'Error: ' + error.message;
            mapDiv.style.display = 'none';
            pharmacyListDiv.style.display = 'none';
        }
    });
}

function init() {
    map = initMap();
    setupDrugAutocomplete();
    setupFormHandler();
    setupQuickTest();
}

function setupQuickTest() {
    document.getElementById('quickTest').addEventListener('click', () => {
        // Pre-fill form with test values
        document.getElementById('address').value = '350 5th Ave, New York, NY 10118';
        document.getElementById('drug').value = 'Lisinopril (Oral Pill)';
        document.getElementById('strength').value = '10 mg Tab';
        
        // Trigger the form submission
        document.getElementById('addressForm').dispatchEvent(new Event('submit'));
    });
}

window.addEventListener('load', init); 