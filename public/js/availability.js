// wait for document to load
function getDrugs() {
    return fetch('/api/drugs')
        .then((response) => {
            if (!response.ok) {
                throw new Error('Failed to fetch drugs');
            }
            return response.json();
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

window.addEventListener('load', () => {
    document.getElementById('availabilityMenu').addEventListener('submit', async (e) => {
        e.preventDefault();
        const drugId = document.getElementById('drug-picker').value;

        fetch('/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ drug_id: drugId })
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Failed to fetch availability');
                }
                return response.json();
            })
            .then((data) => {
                displayAvailability(data.availability);
            })
            .catch((error) => {
                console.error('Error fetching availability:', error);
            });
    });

    const selectElement = document.getElementById("drug-picker");
    getDrugs()
        .then((data) => {
            data.drugs.forEach(item => {
                const option = document.createElement("option");
                option.value = item.id; // Adjust as per your API data structure
                option.textContent = item.name; // Adjust as per your API data structure
                selectElement.appendChild(option);
            });
        })
        .catch((error) => {
            console.error('Error fetching drugs:', error);
        });
});