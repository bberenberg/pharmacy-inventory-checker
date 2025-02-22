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
        <style>
            .pharmacy-table {
                table-layout: fixed;
                width: 100%;
            }
            .pharmacy-table th:nth-child(1) { width: 25%; } /* Name */
            .pharmacy-table th:nth-child(2) { width: 35%; } /* Address */
            .pharmacy-table th:nth-child(3) { width: 12%; } /* Call Status */
            .pharmacy-table th:nth-child(4) { width: 12%; } /* Inventory Status */
            .pharmacy-table th:nth-child(5) { width: 10%; } /* Notes */
            .pharmacy-table th:nth-child(6) { width: 6%; }  /* Action */
            
            .pharmacy-table td {
                padding: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        </style>
        <table class="pharmacy-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Call Status</th>
                    <th>Inventory Status</th>
                    <th>Notes</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        </table>
    `;

    const tableBody = pharmacyListDiv.querySelector('tbody');
    
    // Define statuses for reference
    const statuses = [
        { text: 'To Check', class: 'status-to-check' },
        { text: 'Calling...', class: 'status-checking' },
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
                
                // Update call status to "Calling..."
                callStatusElement.className = `status-lozenge ${statuses[1].class}`;
                callStatusElement.textContent = statuses[1].text;

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

                // We'll need to update these statuses based on the conversation results
                // This will be handled by a new WebSocket connection or polling mechanism
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