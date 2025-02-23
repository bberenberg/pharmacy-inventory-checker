import { initMap, validateAddress, clearMarkers, addMarker, displayPharmacies } from './maps.js';
import { setupDrugAutocomplete } from './medicine.js';

let map;

function initPostHog() {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    
    // Use the config from window.posthogConfig
    posthog.init(window.posthogConfig.apiKey, {
        api_host: window.posthogConfig.apiHost
    });
}

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

        // Track form submission
        posthog.capture('search_pharmacies', {
            address: document.getElementById('address').value,
            drug: document.getElementById('drug').value,
            strength: document.getElementById('strength').value
        });

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

            // Track successful pharmacy search
            posthog.capture('pharmacies_found', {
                count: pharmacyData.data.length,
                drug: document.getElementById('drug').value
            });

        } catch (error) {
            statusDiv.className = 'error';
            statusDiv.textContent = 'Error: ' + error.message;
            mapDiv.style.display = 'none';
            pharmacyListDiv.style.display = 'none';

            // Track errors
            posthog.capture('pharmacy_search_error', {
                error: error.message
            });
        }
    });
}

function init() {
    initPostHog();
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