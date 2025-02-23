import { initMap, validateAddress, clearMarkers, addMarker, displayPharmacies } from './maps.js';
import { setupDrugAutocomplete } from './medicine.js';

let map;
let isAuthenticated = false;
let currentPharmacies = [];

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
        const mapDiv = document.getElementById('map');
        const initialLogo = document.getElementById('initialLogo');
        const headerLogo = document.querySelector('.header');
        const pharmacyListDiv = document.getElementById('pharmacyList');

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

            currentPharmacies = pharmacyData.data;
            displayPharmacies(pharmacyData.data, isAuthenticated);
            
            // Track successful pharmacy search
            posthog.capture('pharmacies_found', {
                count: pharmacyData.data.length,
                drug: document.getElementById('drug').value
            });

        } catch (error) {
            console.error('Error:', error);
        }
    });
}

async function initClerk() {
    try {
        // Wait for Clerk to be loaded
        while (!window.Clerk) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Wait for Clerk to be initialized
        await window.Clerk.load({
            publishableKey: window.clerkConfig.publishableKey
        });
        
        // Now we can check auth state
        isAuthenticated = await window.Clerk.user !== null;
        
        // Mount the user button after Clerk is fully initialized
        window.Clerk.mountUserButton(document.getElementById('user-button'), {
            afterSignOutUrl: '/',
            appearance: {
                elements: {
                    rootBox: {
                        boxShadow: 'none'
                    }
                }
            }
        });
        
        // Listen for auth changes
        window.Clerk.addListener(({ user }) => {
            isAuthenticated = !!user;
            if (currentPharmacies.length > 0) {
                displayPharmacies(currentPharmacies, isAuthenticated);
            }
        });
    } catch (error) {
        console.error('Error initializing Clerk:', error);
    }
}

async function loadHeader() {
    try {
        const response = await fetch('/components/header.html');
        const html = await response.text();
        document.getElementById('header-placeholder').innerHTML = html;
    } catch (error) {
        console.error('Error loading header:', error);
    }
}

async function init() {
    initPostHog();
    await loadHeader(); // Load header first
    await initClerk(); // Then initialize Clerk
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

// Function to update button state based on auth
function updateCallButton(pharmacy) {
  const callButton = document.createElement('button');
  callButton.className = 'call-button';
  
  if (isAuthenticated) {
    callButton.textContent = 'Call';
    callButton.onclick = () => initiateCall(pharmacy);
  } else {
    callButton.textContent = 'Sign in to Call';
    callButton.onclick = () => Clerk.openSignIn();
  }
  
  return callButton;
}

window.addEventListener('load', init); 