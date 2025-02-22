let currentDrugData = null;

async function searchDrugs(query) {
    try {
        const response = await fetch(
            `https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(query)}&ef=STRENGTHS_AND_FORMS`
        );
        const [total, names, extras, fullNames] = await response.json();
        console.log('Search API Response:', { total, names, extras, fullNames });
        
        return names.map(name => ({
            name: name,
            strengths: extras.STRENGTHS_AND_FORMS[names.indexOf(name)] || []
        }));
    } catch (error) {
        console.error('Error fetching drugs:', error);
        return [];
    }
}

export function setupDrugAutocomplete() {
    const drugInput = document.getElementById('drug');
    const drugList = document.getElementById('drugList');
    const strengthInput = document.getElementById('strength');
    const strengthList = document.getElementById('strengthList');
    let debounceTimer;

    drugInput.addEventListener('input', async () => {
        clearTimeout(debounceTimer);
        strengthInput.value = '';
        strengthInput.disabled = true;
        currentDrugData = null;

        if (!drugInput.value.trim()) {
            drugList.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            const results = await searchDrugs(drugInput.value);
            drugList.innerHTML = '';
            
            if (results.length > 0) {
                results.forEach((result) => {
                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.textContent = result.name;
                    div.addEventListener('click', async () => {
                        drugInput.value = result.name;
                        drugList.style.display = 'none';
                        
                        const strengths = result.strengths;
                        console.log('Available strengths:', strengths);
                        currentDrugData = result;
                        
                        if (strengths && strengths.length > 0) {
                            strengthInput.disabled = false;
                            strengthInput.placeholder = 'Select strength';
                            
                            strengthList.innerHTML = '';
                            strengthList.style.display = 'block';
                            strengths.forEach(strength => {
                                const strengthDiv = document.createElement('div');
                                strengthDiv.className = 'autocomplete-item';
                                strengthDiv.textContent = strength;
                                strengthDiv.addEventListener('click', () => {
                                    strengthInput.value = strength;
                                    strengthList.style.display = 'none';
                                });
                                strengthList.appendChild(strengthDiv);
                            });
                        } else {
                            console.log('No strengths available for this medication');
                            strengthInput.disabled = true;
                            strengthInput.placeholder = 'No strengths available';
                        }
                    });
                    drugList.appendChild(div);
                });
                drugList.style.display = 'block';
            } else {
                drugList.style.display = 'none';
            }
        }, 300);
    });

    strengthInput.addEventListener('click', () => {
        if (!strengthInput.disabled && currentDrugData) {
            console.log('Showing strength list');
            console.log('Current drug data:', currentDrugData);
            strengthList.style.display = 'block';
        } else {
            console.log('Strength input clicked but disabled or no drug data');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            drugList.style.display = 'none';
            strengthList.style.display = 'none';
        }
    });
} 