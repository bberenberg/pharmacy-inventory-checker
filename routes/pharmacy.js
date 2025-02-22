import { Client } from "@googlemaps/google-maps-services-js";

const mapsClient = new Client({});

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

export default async function pharmacyRoutes(fastify) {
  const { GOOGLE_MAPS_API_KEY } = process.env;

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Missing GOOGLE_MAPS_API_KEY in environment variables");
    process.exit(1);
  }

  // New endpoint to validate and geocode an address
  fastify.post("/validate-address", async (request, reply) => {
    const { address } = request.body;

    if (!address) {
      return reply.code(400).send({ error: "Address is required" });
    }

    try {
      const geocodeResponse = await mapsClient.geocode({
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY
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

  // New endpoint to get map configuration
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
          key: GOOGLE_MAPS_API_KEY
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
          key: GOOGLE_MAPS_API_KEY
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
                key: GOOGLE_MAPS_API_KEY
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
} 