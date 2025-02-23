let map;
let markers = [];
let autocomplete;
let activePolls = new Map();

export function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: { lat: 40.7128, lng: -74.0060 } // Default to NYC
    });

    autocomplete = new google.maps.places.Autocomplete(
        document.getElementById('address'),
        { types: ['address'] }
    );
    
    return map;
}

export async function validateAddress(address) {
    try {
        const response = await fetch('/validate-address', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ address })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }
        return data.data;
    } catch (error) {
        throw new Error(error.message || 'Failed to validate address');
    }
}

export function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}

export function addMarker(location, title, label) {
    const marker = new google.maps.Marker({
        map,
        position: location,
        title,
        label
    });
    markers.push(marker);
    return marker;
}

export function displayPharmacies(pharmacies) {
    const pharmacyListDiv = document.getElementById('pharmacyList');
    const tableBody = document.getElementById('pharmacyTableBody');
    
    // Show the pharmacy list container
    pharmacyListDiv.style.display = 'block';
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Define statuses for reference
    const statuses = [
        { text: 'To Check', class: 'status-to-check' },
        { text: 'Checking...', class: 'status-checking' },
        { text: 'Call Successful', class: 'status-success' },
        { text: 'Call Failed', class: 'status-failed' },
        { text: 'In Stock', class: 'status-in-stock' },
        { text: 'Out of Stock', class: 'status-out-of-stock' },
        { text: 'Unknown', class: 'status-unknown' }
    ];
    
    pharmacies.forEach((pharmacy) => {
        const marker = addMarker(
            pharmacy.location,
            pharmacy.name,
            pharmacy.index.toString()
        );

        const row = document.createElement('tr');
        row.className = 'pharmacy-row';
        row.dataset.phoneNumber = pharmacy.phoneNumber;
        
        row.innerHTML = `
            <td><strong>${pharmacy.name}</strong></td>
            <td>${pharmacy.address}</td>
            <td><span class="status-lozenge ${statuses[0].class}" data-type="call">${statuses[0].text}</span></td>
            <td><span class="status-lozenge ${statuses[0].class}" data-type="inventory">${statuses[0].text}</span></td>
            <td><span class="notes-field">-</span></td>
            <td>
                <button class="call-button">Call</button>
            </td>
        `;

        const callStatusElement = row.querySelector('.status-lozenge[data-type="call"]');
        const inventoryStatusElement = row.querySelector('.status-lozenge[data-type="inventory"]');
        const callButton = row.querySelector('.call-button');

        callButton.addEventListener('click', async () => {
            try {
                // Disable button during call
                callButton.disabled = true;
                
                // Always reset both statuses at the start of a new call
                callStatusElement.className = `status-lozenge ${statuses[1].class}`;
                callStatusElement.textContent = statuses[1].text;
                inventoryStatusElement.className = `status-lozenge ${statuses[1].class}`; // Set to "Checking"
                inventoryStatusElement.textContent = statuses[1].text;
                
                // Clear any existing notes
                const notesField = row.querySelector('.notes-field');
                notesField.textContent = '-';

                const drugName = document.getElementById('drug').value;
                const strength = document.getElementById('strength').value;
                const phoneNumber = row.dataset.phoneNumber;
                
                const response = await fetch('/call-pharmacy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        pharmacyName: pharmacy.name,
                        pharmacyAddress: pharmacy.address,
                        drugName,
                        strength,
                        phoneNumber
                    })
                });

                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error);
                }

                // Start polling for this call's status
                const callSid = data.callSid;
                if (callSid) {
                    startPolling(callSid, {
                        callStatusElement,
                        inventoryStatusElement,
                        notesField: row.querySelector('.notes-field')
                    });
                }

            } catch (error) {
                console.error('Error:', error);
                callStatusElement.className = `status-lozenge ${statuses[3].class}`;
                callStatusElement.textContent = statuses[3].text;
                inventoryStatusElement.className = `status-lozenge ${statuses[6].class}`;
                inventoryStatusElement.textContent = statuses[6].text;
            } finally {
                callButton.disabled = false;
            }
        });

        row.addEventListener('mouseover', () => {
            marker.setAnimation(google.maps.Animation.BOUNCE);
            row.classList.add('highlighted');
        });
        row.addEventListener('mouseout', () => {
            marker.setAnimation(null);
            row.classList.remove('highlighted');
        });

        tableBody.appendChild(row);
    });
}

function startPolling(callSid, elements) {
    if (activePolls.has(callSid)) {
        return;
    }

    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/call-status/${callSid}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            console.log('Poll response:', data);
            updateCallStatus(data.data, elements);

            // Stop polling if call is complete or failed
            if (data.data.status === 'completed' || data.data.status === 'failed') {
                console.log('Stopping poll - final status:', data.data);
                stopPolling(callSid);
            }
        } catch (error) {
            console.error('Polling error:', error);
            stopPolling(callSid);
        }
    }, 2000);

    activePolls.set(callSid, pollInterval);
}

function stopPolling(callSid) {
    const interval = activePolls.get(callSid);
    if (interval) {
        clearInterval(interval);
        activePolls.delete(callSid);
    }
}

function updateCallStatus(data, elements) {
    const { callStatusElement, inventoryStatusElement, notesField } = elements;

    // Get statuses array from displayPharmacies scope
    const statuses = [
        { text: 'To Check', class: 'status-to-check' },
        { text: 'Checking...', class: 'status-checking' },
        { text: 'Call Successful', class: 'status-success' },
        { text: 'Call Failed', class: 'status-failed' },
        { text: 'In Stock', class: 'status-in-stock' },
        { text: 'Out of Stock', class: 'status-out-of-stock' },
        { text: 'Unknown', class: 'status-unknown' }
    ];

    // Debug log
    console.log('Updating status with data:', data);

    // Update call status
    if (data.status === 'completed') {
        callStatusElement.className = `status-lozenge ${statuses[2].class}`;
        callStatusElement.textContent = statuses[2].text;
    } else if (data.status === 'failed') {
        callStatusElement.className = `status-lozenge ${statuses[3].class}`;
        callStatusElement.textContent = statuses[3].text;
    }

    // Only update inventory status if we have a stockStatus in the response
    if ('stockStatus' in data) {
        if (data.stockStatus === true) {
            inventoryStatusElement.className = `status-lozenge ${statuses[4].class}`;
            inventoryStatusElement.textContent = statuses[4].text;
        } else {
            inventoryStatusElement.className = `status-lozenge ${statuses[5].class}`;
            inventoryStatusElement.textContent = statuses[5].text;
        }
    }
    // Don't update to unknown - keep the "Checking..." status until we get a result

    // Update notes field
    let notes = [];
    if (data.restockDate) {
        notes.push(`Restock: ${data.restockDate}`);
    }
    if (data.alternativeFeedback) {
        notes.push(data.alternativeFeedback);
    }
    if (notes.length > 0) {
        notesField.textContent = notes.join(' | ');
    }
} 