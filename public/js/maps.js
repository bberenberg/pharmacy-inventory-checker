let map;
let markers = [];
let autocomplete;

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
    
    pharmacyListDiv.innerHTML = `
        <h2>Nearby Pharmacies</h2>
        <table class="pharmacy-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Rating</th>
                    <th>Reviews</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        </table>
    `;

    const tableBody = pharmacyListDiv.querySelector('tbody');
    
    // Define status progression
    const statuses = [
        { text: 'To Check', class: 'status-to-check' },
        { text: 'Checking', class: 'status-checking' },
        { text: 'In Stock', class: 'status-in-stock' },
        { text: 'Out of Stock', class: 'status-out-of-stock' }
    ];
    
    // Create all rows first
    const statusCells = pharmacies.map((pharmacy, index) => {
        const marker = addMarker(
            pharmacy.location,
            pharmacy.name,
            pharmacy.index.toString()
        );

        const row = document.createElement('tr');
        row.className = 'pharmacy-row';
        
        row.innerHTML = `
            <td>${pharmacy.index}</td>
            <td><strong>${pharmacy.name}</strong></td>
            <td>${pharmacy.address}</td>
            <td>${pharmacy.rating ? `${pharmacy.rating}` : 'N/A'}</td>
            <td>${pharmacy.userRatingsTotal || 'N/A'}</td>
            <td><span class="status-lozenge ${statuses[0].class}">${statuses[0].text}</span></td>
        `;

        row.addEventListener('mouseover', () => {
            marker.setAnimation(google.maps.Animation.BOUNCE);
            row.classList.add('highlighted');
        });
        row.addEventListener('mouseout', () => {
            marker.setAnimation(null);
            row.classList.remove('highlighted');
        });

        tableBody.appendChild(row);
        return row.querySelector('.status-lozenge');
    });

    // Start the sequential checking process
    checkPharmaciesSequentially(statusCells, statuses);
}

async function checkPharmaciesSequentially(statusCells, statuses) {
    for (const statusElement of statusCells) {
        await simulateStatusProgression(statusElement, statuses);
    }
}

async function simulateStatusProgression(statusElement, statuses) {
    let currentStep = 0;
    
    return new Promise(async (resolve) => {
        async function updateStatus() {
            currentStep++;
            
            if (currentStep < statuses.length) {
                // If moving to "Checking" status, make the API call
                if (statuses[currentStep].text === 'Checking') {
                    try {
                        const row = statusElement.closest('tr');
                        const pharmacyName = row.querySelector('td:nth-child(2)').textContent;
                        const pharmacyAddress = row.querySelector('td:nth-child(3)').textContent;
                        
                        const response = await fetch('/call-pharmacy', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                pharmacyName,
                                pharmacyAddress
                            })
                        });

                        const data = await response.json();
                        if (!data.success) {
                            throw new Error(data.error);
                        }
                    } catch (error) {
                        console.error('Failed to initiate pharmacy call:', error);
                    }
                }

                // Update status display
                statusElement.className = `status-lozenge ${statuses[currentStep].class}`;
                statusElement.textContent = statuses[currentStep].text;
                
                // Schedule next update with random delay
                const delay = 1000 + Math.random() * 2000;
                setTimeout(updateStatus, delay);
            } else {
                resolve(); // Resolve the promise when all statuses are complete
            }
        }

        // Start with initial delay
        const initialDelay = 1000 + Math.random() * 2000;
        setTimeout(updateStatus, initialDelay);
    });
} 