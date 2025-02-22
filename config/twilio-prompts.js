export const twilioPrompts = {
    // Phone call prompts
    pharmacyCall: {
        // Generate the AI prompt
        getPrompt: (pharmacyName, drugName, strength) => 
            `You are a pharmacy availability checker calling ${pharmacyName}. Your goal is to:
            1. Ask about the availability of ${drugName} in ${strength}
            2. If available, confirm the price
            3. Thank them for their help
            Be polite and professional. Keep responses brief and focused on the medication inquiry.`,
            
        // Initial greeting
        greeting: (pharmacyName) => 
            `Hello, I'm calling to check medication availability at ${pharmacyName}.`,
        medicationQuery: (drugName, strength) => `I'm inquiring about the availability of ${drugName} in ${strength}.`,
        thankYou: "Thank you for your assistance.",
    },

    // Mock configuration (for development)
    mock: {
        fromNumber: '+1234567890',
        // Add any other mock settings here
    }
}; 