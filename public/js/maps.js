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
        { text: 'Checking', class: 'status-checking' },
        { text: 'In Stock', class: 'status-in-stock' },
        { text: 'Out of Stock', class: 'status-out-of-stock' }
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
            <td>${pharmacy.index}</td>
            <td><strong>${pharmacy.name}</strong></td>
            <td>${pharmacy.address}</td>
            <td>${pharmacy.rating ? `${pharmacy.rating}` : 'N/A'}</td>
            <td>${pharmacy.userRatingsTotal || 'N/A'}</td>
            <td><span class="status-lozenge ${statuses[0].class}">${statuses[0].text}</span></td>
            <td>
                <button class="call-button">Call</button>
            </td>
        `;

        const statusElement = row.querySelector('.status-lozenge');
        const callButton = row.querySelector('.call-button');

        callButton.addEventListener('click', async () => {
            try {
                // Disable button during call
                callButton.disabled = true;
                
                // Update status to "Checking"
                statusElement.className = `status-lozenge ${statuses[1].class}`;
                statusElement.textContent = statuses[1].text;

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

                // For now, randomly set to either In Stock or Out of Stock after a delay
                setTimeout(() => {
                    const finalStatus = Math.random() > 0.5 ? statuses[2] : statuses[3];
                    statusElement.className = `status-lozenge ${finalStatus.class}`;
                    statusElement.textContent = finalStatus.text;
                    callButton.disabled = false;
                }, 3000);

            } catch (error) {
                console.error('Failed to initiate pharmacy call:', error);
                // Reset status on error
                statusElement.className = `status-lozenge ${statuses[0].class}`;
                statusElement.textContent = statuses[0].text;
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