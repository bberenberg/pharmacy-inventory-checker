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
        console.log("inserting", availability);
        const row = document.createElement('tr');
        row.className = 'pharmacy-row';

        const {
            pharmacy_name, address, phone, available_from
        } = availability;

        row.innerHTML = `
            <td><strong>${pharmacy_name}</strong></td>
            <td>${address}</td>
            <td>${phone}</td>
            <td>${available_from}</td>
            <td>
                <button class="call-button">Call</button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

// New file to handle availability page functionality
import { displayAvailabilityResults } from './maps.js';

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
    async function fetchAvailability(drugName, selectedDose = null) {
        try {
            statusDiv.className = 'info';
            statusDiv.textContent = 'Checking availability...';

            // Get all drug IDs for the selected medication
            const drugIds = drugsData
                .filter(drug => drug.name === drugName && (!selectedDose || drug.dose === selectedDose))
                .map(drug => drug.id);

            // Fetch availability for all doses of this drug
            const promises = drugIds.map(drugId => 
                fetch('/api/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ drugId })
                }).then(r => r.json())
            );

            const results = await Promise.all(promises);
            
            // Combine and flatten results
            currentPharmacies = results
                .filter(r => r.success)
                .flatMap(r => r.pharmacies);

            // Update display
            document.getElementById('desiredMedication').textContent = 
                selectedDose ? `${drugName} ${selectedDose}` : drugName;

            displayAvailabilityResults(currentPharmacies, drugsData);
            
            statusDiv.className = 'success';
            statusDiv.textContent = `Found ${currentPharmacies.length} pharmacies with availability information`;

        } catch (error) {
            statusDiv.className = 'error';
            statusDiv.textContent = 'Error: ' + error.message;
        }
    }

    // Handle drug selection
    drugPicker.addEventListener('change', async () => {
        const selectedDrug = drugPicker.value;
        
        if (selectedDrug) {
            // Show results when a drug is selected
            availabilityList.style.display = 'block';
            dosePicker.innerHTML = '<option value="" disabled selected>Filter by Dose</option>';
            
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
            
            // Fetch availability for all doses
            await fetchAvailability(selectedDrug);
        } else {
            dosePicker.disabled = true;
            currentPharmacies = [];
            displayAvailabilityResults([], drugsData);
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
                displayAvailabilityResults(filteredPharmacies, drugsData);
            } else {
                // Show all doses again
                displayAvailabilityResults(currentPharmacies, drugsData);
            }
        }
    });
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', setupAvailabilityHandler);