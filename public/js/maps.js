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
    
    // Create table structure
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
                    ${document.getElementById('drug').value ? '<th>Medication</th>' : ''}
                </tr>
            </thead>
            <tbody>
            </tbody>
        </table>
    `;

    const tableBody = pharmacyListDiv.querySelector('tbody');
    
    // Define possible statuses
    const statuses = [
        { text: 'To Check', class: 'status-to-check' },
        { text: 'Checking', class: 'status-checking' },
        { text: 'In Stock', class: 'status-in-stock' },
        { text: 'Out of Stock', class: 'status-out-of-stock' }
    ];
    
    pharmacies.forEach(pharmacy => {
        const marker = addMarker(
            pharmacy.location,
            pharmacy.name,
            pharmacy.index.toString()
        );

        const row = document.createElement('tr');
        row.className = 'pharmacy-row';
        
        const drugName = document.getElementById('drug').value;
        const strength = document.getElementById('strength').value;
        
        // Randomly select a status
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        row.innerHTML = `
            <td>${pharmacy.index}</td>
            <td><strong>${pharmacy.name}</strong></td>
            <td>${pharmacy.address}</td>
            <td>${pharmacy.rating ? `${pharmacy.rating}` : 'N/A'}</td>
            <td>${pharmacy.userRatingsTotal || 'N/A'}</td>
            <td><span class="status-lozenge ${randomStatus.class}">${randomStatus.text}</span></td>
            ${drugName ? `<td>${drugName}${strength ? ` - ${strength}` : ''}</td>` : ''}
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
    });
} 