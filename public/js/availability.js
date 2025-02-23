// wait for document to load
function getDrugs() {
    return fetch('/api/drugs')
        .then((response) => {
            if (!response.ok) {
                throw new Error('Failed to fetch drugs');
            }
            return response.json();
        })
        .then((data) => {
            // Ensure we're returning the drugs array from the response
            if (!data.drugs || !Array.isArray(data.drugs)) {
                throw new Error('Invalid drug data received from server');
            }
            return data.drugs;
        });
}

export function displayAvailability(availabilities) {
    const pharmacyListDiv = document.getElementById('availabilityList');
    const tableBody = document.getElementById('pharmacyTableBody');

    const selectElement = document.getElementById('drug-picker');

    if (selectElement) {
        const selectedOption = selectElement.options[selectElement.selectedIndex];
        const selectedText = selectedOption.text;
        document.getElementById('desiredMedication').innerText = selectedText;
    }

    // Show the pharmacy list container
    pharmacyListDiv.style.display = 'block';

    // Clear existing rows
    tableBody.innerHTML = '';

    availabilities.forEach((availability) => {
        const row = document.createElement('tr');
        row.className = 'pharmacy-row';

        // Format the date
        const date = new Date(availability.available_from);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Create status element
        const statusClass = availability.quantity > 0 ? 'status-in-stock' : 'status-out-of-stock';
        const statusText = availability.quantity > 0 ? 'In Stock' : 'Out of Stock';

        row.innerHTML = `
            <td><strong>${availability.name}</strong></td>
            <td>${availability.address}</td>
            <td>${availability.phone || 'Not available'}</td>
            <td>${availability.dose}</td>
            <td><span class="status-lozenge ${statusClass}">${statusText}</span></td>
            <td>${formattedDate}</td>
        `;

        tableBody.appendChild(row);
    });
}

// New file to handle availability page functionality
import { displayAvailabilityResults } from './maps.js';

// Add state preservation variables at the top
let savedAvailabilityState = null;

// Add the same helper functions
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

async function setupAvailabilityHandler() {
    const drugPicker = document.getElementById('drug-picker');
    const dosePicker = document.getElementById('dose-picker');
    const statusDiv = document.getElementById('status');
    
    // Store all drugs data
    let drugsData = [];
    let currentPharmacies = [];
    
    // Load drugs on page load
    try {
        drugsData = await getDrugs();
        
        // Get unique drug names for the first dropdown
        const uniqueDrugs = [...new Set(drugsData.map(drug => drug.name))];
        uniqueDrugs.sort().forEach(drugName => {
            const option = document.createElement('option');
            option.value = drugName;
            option.textContent = drugName;
            drugPicker.appendChild(option);
        });
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = 'Error loading medications: ' + error.message;
    }

    // Function to fetch and display availability
    async function fetchAvailability(drugId) {
        try {
            const response = await fetch(`/api/availability?drugId=${drugId}`, {
                method: 'GET'  // Change from POST to GET
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error);
            }
            return data.pharmacies;
        } catch (error) {
            console.error('Error fetching availability:', error);
            throw error;
        }
    }

    // Handle drug selection
    drugPicker.addEventListener('change', async () => {
        const selectedDrug = drugPicker.value;
        
        if (selectedDrug) {
            try {
                // Get the drug ID from drugsData
                const drugData = drugsData.find(drug => drug.name === selectedDrug);
                if (!drugData) {
                    throw new Error('Drug not found');
                }

                // Show results when a drug is selected
                availabilityList.style.display = 'block';
                dosePicker.innerHTML = '<option value="" disabled selected>Filter by Strength and Form</option>';
                
                // Get doses for selected drug
                const doses = drugsData
                    .filter(drug => drug.name === selectedDrug)
                    .map(drug => drug.dose);
                
                // Add "All Doses" option
                const allOption = document.createElement('option');
                allOption.value = '';
                allOption.textContent = 'All Doses';
                dosePicker.appendChild(allOption);
                
                doses.sort().forEach(dose => {
                    const option = document.createElement('option');
                    option.value = dose;
                    option.textContent = dose;
                    dosePicker.appendChild(option);
                });
                
                dosePicker.disabled = false;
                
                // Fetch availability using drug ID
                console.log('Fetching availability for drug ID:', drugData.id);
                const pharmacies = await fetchAvailability(drugData.id);
                console.log('Received pharmacies:', pharmacies);
                
                // Store results
                currentPharmacies = pharmacies;
                
                // Display results
                displayAvailability(pharmacies);
                
            } catch (error) {
                console.error('Error handling drug selection:', error);
            }
        } else {
            dosePicker.disabled = true;
            currentPharmacies = [];
            displayAvailability([]);
        }
    });

    // Handle dose filtering
    dosePicker.addEventListener('change', () => {
        const selectedDrug = drugPicker.value;
        const selectedDose = dosePicker.value;
        
        if (selectedDrug) {
            if (selectedDose) {
                // Filter existing results by dose
                const filteredPharmacies = currentPharmacies.filter(
                    pharmacy => pharmacy.dose === selectedDose
                );
                displayAvailability(filteredPharmacies);
            } else {
                // Show all doses again
                displayAvailability(currentPharmacies);
            }
        }
    });

    // Update the sign-in click handler
    if (!isAuthenticated) {
        callButton.textContent = 'Sign in to Call';
        callButton.onclick = () => {
            // Save state before sign in
            const availabilityState = {
                selectedDrug: drugPicker.value,
                selectedDose: dosePicker.value,
                currentPharmacies: currentPharmacies,
                timestamp: Date.now()
            };
            saveToStorage('savedAvailabilityState', availabilityState);
            window.Clerk.openSignIn();
        };
    }

    // Add state restoration to Clerk listener
    window.Clerk.addListener(({ user }) => {
        isAuthenticated = !!user;
        
        // Restore state if it exists
        const savedState = loadFromStorage('savedAvailabilityState');
        if (isAuthenticated && savedState) {
            // Check if state is less than 30 minutes old
            if (Date.now() - savedState.timestamp < 30 * 60 * 1000) {
                drugPicker.value = savedState.selectedDrug;
                dosePicker.value = savedState.selectedDose;
                
                if (savedState.currentPharmacies.length > 0) {
                    currentPharmacies = savedState.currentPharmacies;
                    displayAvailability(currentPharmacies);
                }
            }
            // Clear saved state
            localStorage.removeItem('savedAvailabilityState');
        }
    });
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', setupAvailabilityHandler);