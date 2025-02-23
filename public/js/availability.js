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
                console.log('Availability:', data);
            })
            .catch((error) => {
                console.error('Error fetching availability:', error);
            });
    });

    const selectElement = document.getElementById("drug-picker");
    getDrugs()
        .then((data) => {
            console.log('Drugs:', data);

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