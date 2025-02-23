import { Client } from "@googlemaps/google-maps-services-js";
import { twilioPrompts } from '../config/twilio-prompts.js';

export default async function pharmacyRoutes(fastify) {
  const { GOOGLE_MAPS_API_KEY_BACKEND } = process.env;

  if (!GOOGLE_MAPS_API_KEY_BACKEND) {
    console.error("Missing GOOGLE_MAPS_API_KEY_BACKEND in environment variables");
    process.exit(1);
  }

  const mapsClient = new Client({
    // Use backend key for server-side API calls
    key: GOOGLE_MAPS_API_KEY_BACKEND
  });

  // Helper function to calculate distance between two points using Haversine formula
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Helper function to check auth
  const requireAuth = async (request, reply) => {
    const { auth } = request;
    if (!auth?.userId) {
      reply.code(401).send({ 
        success: false, 
        error: 'Authentication required' 
      });
      return false;
    }
    return true;
  };

  // Public route - keep as is
  fastify.post("/validate-address", async (request, reply) => {
    const { address } = request.body;

    if (!address) {
      return reply.code(400).send({ error: "Address is required" });
    }

    try {
      const geocodeResponse = await mapsClient.geocode({
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY_BACKEND
        }
      });

      if (!geocodeResponse.data.results?.length) {
        return reply.code(400).send({
          success: false,
          error: "Could not find the specified address"
        });
      }

      const result = geocodeResponse.data.results[0];
      return reply.send({
        success: true,
        data: {
          formattedAddress: result.formatted_address,
          location: result.geometry.location,
          placeId: result.place_id
        }
      });
    } catch (error) {
      console.error("Error validating address:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to validate address",
        details: error.message
      });
    }
  });

  // Public route - keep as is
  fastify.get("/map-config", async (request, reply) => {
    try {
      return reply.send({
        success: true,
        data: {
          defaultCenter: { lat: 40.7128, lng: -74.0060 },
          defaultZoom: 13
        }
      });
    } catch (error) {
      console.error("Error getting map config:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to get map configuration"
      });
    }
  });

  fastify.post("/search-pharmacies", async (request, reply) => {
    const { address } = request.body;

    if (!address) {
      return reply.code(400).send({ error: "Address is required" });
    }

    try {
      // Geocode the address
      const geocodeResponse = await mapsClient.geocode({
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY_BACKEND
        }
      });

      if (!geocodeResponse.data.results?.length) {
        return reply.code(400).send({ error: "Could not find the specified address" });
      }

      const { lat, lng } = geocodeResponse.data.results[0].geometry.location;

      // Search for nearby pharmacies
      const placesResponse = await mapsClient.placesNearby({
        params: {
          location: { lat, lng },
          radius: 5000,
          type: "pharmacy",
          key: GOOGLE_MAPS_API_KEY_BACKEND
        }
      });

      if (placesResponse.data.status !== "OK") {
        console.error("Places API error:", placesResponse.data);
        throw new Error(`Places API returned status: ${placesResponse.data.status}`);
      }

      // Get details for each pharmacy
      const pharmacies = await Promise.all(
        placesResponse.data.results.map(async (place) => {
          try {
            const detailsResponse = await mapsClient.placeDetails({
              params: {
                place_id: place.place_id,
                fields: ["name", "formatted_address", "formatted_phone_number", "opening_hours", "geometry"],
                key: GOOGLE_MAPS_API_KEY_BACKEND
              }
            });

            if (detailsResponse.data.status !== "OK") {
              console.error("Place Details API error for place_id:", place.place_id, detailsResponse.data);
              return null;
            }

            const details = detailsResponse.data.result;

            // Calculate distance using Haversine formula
            const distance = calculateDistance(
              lat,
              lng,
              details.geometry.location.lat,
              details.geometry.location.lng
            );

            return {
              name: details.name,
              address: details.formatted_address,
              distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
              phone: details.formatted_phone_number || "Not available",
              hours: details.opening_hours?.weekday_text || "Hours not available"
            };
          } catch (error) {
            console.error("Error getting details for place_id:", place.place_id, error);
            return null;
          }
        })
      );

      const validPharmacies = pharmacies
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

      if (!validPharmacies.length) {
        return reply.code(404).send({
          success: false,
          error: "No pharmacies found in the area"
        });
      }

      reply.send({
        success: true,
        pharmacies: validPharmacies
      });
    } catch (error) {
      console.error("Error searching pharmacies:", error);
      reply.code(500).send({
        success: false,
        error: "Failed to search pharmacies",
        details: error.message
      });
    }
  });

  // Update the nearby-pharmacies endpoint
  fastify.post("/nearby-pharmacies", async (request, reply) => {
    const { location } = request.body;

    if (!location || !location.lat || !location.lng) {
      return reply.code(400).send({
        success: false,
        error: "Location is required"
      });
    }

    try {
      const response = await mapsClient.placesNearby({
        params: {
          location: location,
          radius: 5000, // 5km radius
          type: 'pharmacy',
          key: GOOGLE_MAPS_API_KEY_BACKEND
        }
      });

      const pharmacies = await Promise.all(response.data.results
        .map(async (place) => {
          // Get detailed place information including phone number
          const details = await mapsClient.placeDetails({
            params: {
              place_id: place.place_id,
              fields: ['formatted_phone_number'],
              key: GOOGLE_MAPS_API_KEY_BACKEND
            }
          });

          // Calculate distance using Haversine formula
          const distance = calculateDistance(
            location.lat,
            location.lng,
            place.geometry.location.lat,
            place.geometry.location.lng
          );

          return {
            id: place.place_id,
            name: place.name,
            address: place.vicinity,
            location: place.geometry.location,
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            phoneNumber: details.data.result.formatted_phone_number,
            distance: distance // Add distance to the pharmacy object
          };
        }));

      // Sort pharmacies by distance and take top 10
      const sortedPharmacies = pharmacies
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10) // Limit to top 10 closest pharmacies
        .map((pharmacy, index) => ({
          ...pharmacy,
          index: index + 1 // Re-index after sorting
        }));

      return reply.send({
        success: true,
        data: sortedPharmacies
      });
    } catch (error) {
      console.error("Error finding nearby pharmacies:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to find nearby pharmacies",
        details: error.message
      });
    }
  });

  // Protected route - add auth check
  fastify.post("/outbound-call", async (request, reply) => {
    if (!await requireAuth(request, reply)) return;
    
    const { pharmacyName, pharmacyAddress, drugName, strength, phoneNumber } = request.body;

    // Track pharmacy call attempt
    fastify.posthog.capture({
      distinctId: request.headers['x-forwarded-for'] || request.ip,
      event: 'pharmacy_call_initiated',
      properties: {
        pharmacy_name: pharmacyName,
        drug_name: drugName,
        strength: strength,
        $current_url: request.headers.referer
      }
    });

    if (!phoneNumber) {
      return reply.code(400).send({
        success: false,
        error: "Pharmacy phone number is required"
      });
    }

    // Format phone number to E.164 format if it's not already
    /* const formattedPhone = phoneNumber.startsWith('+')
       ? phoneNumber
       : phoneNumber.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1');
     */
    const formattedPhone = "+14088361690";

    try {
      // Save pharmacy to database first
      await fastify.db.run(`
        INSERT INTO pharmacy (name, address, phone) 
        VALUES (?, ?, ?)
        ON CONFLICT(name, address) DO UPDATE SET 
        phone = ?
      `, [pharmacyName, pharmacyAddress, formattedPhone, formattedPhone]);

      const result = await fastify.db.get(
        'SELECT id FROM pharmacy WHERE name = ? AND address = ?',
        [pharmacyName, pharmacyAddress]
      );

      // Save drug if it doesn't exist and get its id
      await fastify.db.run(`
        INSERT INTO drug (name, dose) 
        VALUES (?, ?)
        ON CONFLICT(name, dose) DO UPDATE SET 
        dose = ?
      `, [drugName, strength, strength]);

      const drugResult = await fastify.db.get(
        'SELECT id FROM drug WHERE name = ? AND dose = ?',
        [drugName, strength]
      );

      const prompt = twilioPrompts.pharmacyCall.getPrompt(pharmacyName, drugName, strength);
      const first_message = twilioPrompts.pharmacyCall.greeting(drugName, strength);

      // Add drug and pharmacy IDs to callInfo
      const callInfo = {
        prompt,
        first_message,
        pharmacyInfo: {
          id: result.id,
          name: pharmacyName,
          address: pharmacyAddress
        },
        drugInfo: {
          id: drugResult.id,
          name: drugName,
          strength: strength
        }
      };

      const response = await fetch(`https://${request.headers.host}/outbound-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: formattedPhone,
          ...callInfo
        })
      });

      const data = await response.json();
      console.log("call data", data);

      // After successful call initiation
      fastify.posthog.capture({
        distinctId: request.headers['x-forwarded-for'] || request.ip,
        event: 'pharmacy_call_connected',
        properties: {
          pharmacy_name: pharmacyName,
          drug_name: drugName,
          call_sid: data.callSid
        }
      });

      return reply.send(data);
    } catch (error) {
      // Track errors
      fastify.posthog.capture({
        distinctId: request.headers['x-forwarded-for'] || request.ip,
        event: 'pharmacy_call_failed',
        properties: {
          pharmacy_name: pharmacyName,
          error: error.message
        }
      });
      console.error("Error initiating pharmacy call:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to initiate call to pharmacy"
      });
    }
  });

  // Protected route - add auth check
  fastify.get("/call-status/:callSid", async (request, reply) => {
    if (!await requireAuth(request, reply)) return;
    
    const { callSid } = request.params;

    try {
      const response = await fetch(`https://${request.headers.host}/call-status/${callSid}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${request.auth.token}`
        }
      });

      const data = await response.json();
      return reply.send(data);
    } catch (error) {
      console.error("Error fetching call status:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch call status"
      });
    }
  });

  // Change the route path from "/availability" to "/api/availability"
  fastify.get("/api/availability", async (request, reply) => {
    const { drugId } = request.query;

    if (!drugId) {
      return reply.code(400).send({
        success: false,
        error: "Drug ID is required"
      });
    }

    try {
      const pharmacies = await fastify.db.all(`
        SELECT 
          p.name,
          p.address,
          p.phone,
          pda.available_from,
          pda.quantity,
          pda.alternative_feedback,
          d.dose
        FROM pharmacy p
        JOIN pharmacy_drug_availability pda ON p.id = pda.pharmacy_id
        JOIN drug d ON d.id = pda.drug_id
        WHERE pda.drug_id = ?
        ORDER BY pda.available_from ASC
      `, [drugId]);

      return reply.send({
        success: true,
        pharmacies: pharmacies
      });
    } catch (error) {
      console.error("Error fetching availability:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch availability",
        details: error.message
      });
    }
  });

  // Keep the drugs endpoint
  fastify.get("/api/drugs", async (request, reply) => {
    try {
      const drugs = await fastify.db.all(`
        SELECT id, name, dose
        FROM drug
        ORDER BY name, dose
      `);

      return reply.send({
        success: true,
        drugs: drugs
      });
    } catch (error) {
      console.error("Error fetching drugs:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch drugs",
        details: error.message
      });
    }
  });
}