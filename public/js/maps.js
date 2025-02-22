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
    pharmacyListDiv.innerHTML = '<h2>Nearby Pharmacies</h2>';

    pharmacies.forEach(pharmacy => {
        const marker = addMarker(
            pharmacy.location,
            pharmacy.name,
            pharmacy.index.toString()
        );

        const item = document.createElement('div');
        item.className = 'pharmacy-item';
        const drugName = document.getElementById('drug').value;
        const strength = document.getElementById('strength').value;
        item.innerHTML = `
            <strong>${pharmacy.index}. ${pharmacy.name}</strong><br>
            ${pharmacy.address}<br>
            ${pharmacy.rating ? `Rating: ${pharmacy.rating}⭐ (${pharmacy.userRatingsTotal} reviews)` : 'No ratings yet'}<br>
            ${drugName ? `<small>Searching for: ${drugName}${strength ? ` - ${strength}` : ''}</small>` : ''}
        `;

        item.addEventListener('mouseover', () => {
            marker.setAnimation(google.maps.Animation.BOUNCE);
        });
        item.addEventListener('mouseout', () => {
            marker.setAnimation(null);
        });

        pharmacyListDiv.appendChild(item);
    });
} 