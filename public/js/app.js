import { initMap, validateAddress, clearMarkers, addMarker, displayPharmacies } from './maps.js';
import { setupDrugAutocomplete } from './medicine.js';

let map;
let isAuthenticated = false;
let currentPharmacies = [];
let savedFormState = null;

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

            // Add markers for each pharmacy
            currentPharmacies.forEach((pharmacy, index) => {
                addMarker(
                    pharmacy.location,
                    pharmacy.name,
                    `${index + 1}`
                );
            });

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
        while (!window.Clerk) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('Clerk loading, checking for saved state');
        const savedState = loadFromStorage('savedFormState');
        console.log('Found saved state before load:', savedState);

        await window.Clerk.load({
            publishableKey: window.clerkConfig.publishableKey,
            afterSignIn: (user) => window.location.href = document.referrer || '/',
            afterSignUp: (user) => window.location.href = document.referrer || '/',
        });
        
        console.log('Clerk initialized, checking initial auth state');
        isAuthenticated = await window.Clerk.user !== null;
        console.log('Initial auth state:', isAuthenticated);

        // If we have state and are authenticated, restore it immediately
        if (isAuthenticated && savedState) {
            console.log('Restoring state immediately after auth');
            if (Date.now() - savedState.timestamp < 30 * 60 * 1000) {
                // Hide intro and show map
                const mapDiv = document.getElementById('map');
                const initialLogo = document.getElementById('initialLogo');
                const headerLogo = document.querySelector('.header');
                const pharmacyListDiv = document.getElementById('pharmacyList');

                initialLogo.style.display = 'none';
                mapDiv.style.display = 'block';
                headerLogo.style.display = 'flex';
                pharmacyListDiv.style.display = 'block';

                // Restore form values
                document.getElementById('address').value = savedState.address;
                document.getElementById('drug').value = savedState.drug;
                document.getElementById('strength').value = savedState.strength;
                
                // Restore map and pharmacies
                if (savedState.currentPharmacies?.length > 0) {
                    currentPharmacies = savedState.currentPharmacies;
                    
                    // Re-center map on the saved address
                    validateAddress(savedState.address).then(validatedAddress => {
                        map.setCenter(validatedAddress.location);
                        map.setZoom(13);
                        clearMarkers();
                        
                        // Add the user's location marker
                        addMarker(validatedAddress.location, 'Your Location', '📍');
                        
                        // Add markers for each pharmacy
                        currentPharmacies.forEach((pharmacy, index) => {
                            addMarker(
                                pharmacy.location,
                                pharmacy.name,
                                `${index + 1}`
                            );
                        });
                        
                        displayPharmacies(currentPharmacies, isAuthenticated);
                    });
                }
            }
            localStorage.removeItem('savedFormState');
        }

        // Mount user button and continue with normal initialization
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
            console.log('Auth state changed. User:', !!user);
            isAuthenticated = !!user;
            
            const savedState = loadFromStorage('savedFormState');
            console.log('Retrieved saved state:', savedState);
            
            if (isAuthenticated && savedState) {
                console.log('User is authenticated and has saved state');
                if (Date.now() - savedState.timestamp < 30 * 60 * 1000) {
                    console.log('State is fresh, restoring values');
                    document.getElementById('address').value = savedState.address;
                    document.getElementById('drug').value = savedState.drug;
                    document.getElementById('strength').value = savedState.strength;
                    
                    if (savedState.currentPharmacies?.length > 0) {
                        console.log('Restoring pharmacies:', savedState.currentPharmacies.length);
                        currentPharmacies = savedState.currentPharmacies;
                        displayPharmacies(currentPharmacies, isAuthenticated);
                    }
                } else {
                    console.log('State was too old:', new Date(savedState.timestamp));
                }
                localStorage.removeItem('savedFormState');
                console.log('Cleared saved state');
            } else {
                console.log('No state restoration needed:', { 
                    isAuthenticated, 
                    hasSavedState: !!savedState 
                });
            }
        });
    } catch (error) {
        console.error('Error in initClerk:', error);
    }
}

async function loadHeader() {
    try {
        const response = await fetch('/components/header.html');
        const html = await response.text();
        document.getElementById('header-placeholder').innerHTML = html;

        // Add mobile menu functionality
        const menuToggle = document.querySelector('.menu-toggle');
        const nav = document.querySelector('.navigation-menu');
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'menu-overlay';
        document.body.appendChild(overlay);

        menuToggle?.addEventListener('click', () => {
            nav.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        });

        // Close menu when clicking overlay
        overlay.addEventListener('click', () => {
            nav.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        });

        // Close menu when clicking a link
        nav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    } catch (error) {
        console.error('Error loading header:', error);
    }
}

async function init() {
    console.log('Init - checking for saved state:', loadFromStorage('savedFormState'));
    initPostHog();
    await loadHeader();
    await initClerk();
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

// Make handleSignIn globally available
window.handleSignIn = function handleSignIn() {
    console.log('handleSignIn called');
    const formState = {
        address: document.getElementById('address').value,
        drug: document.getElementById('drug').value,
        strength: document.getElementById('strength').value,
        currentPharmacies: currentPharmacies,
        timestamp: Date.now()
    };
    console.log('Form values at sign in:', {
        address: document.getElementById('address').value,
        drug: document.getElementById('drug').value,
        strength: document.getElementById('strength').value,
    });
    console.log('Saving form state before auth:', formState);
    saveToStorage('savedFormState', formState);
    // Verify it was saved
    const savedState = loadFromStorage('savedFormState');
    console.log('Verified save - reading back state:', savedState);
    window.Clerk.openSignIn();
};

// Add these helper functions at the top
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
}

function loadFromStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        return null;
    }
}

window.addEventListener('load', init); 