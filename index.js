import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import Twilio from "twilio";
import pharmacyRoutes from "./routes/pharmacy.js";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pkg from 'posthog-node';
import fs from 'fs/promises';
import { clerkPlugin } from '@clerk/fastify';
const { PostHog } = pkg;

let db;

// Load environment variables from .env file
dotenv.config();

// Check for required environment variables
const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  PUBLIC_URL,
} = process.env;

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

// Add this to verify the keys are loaded
const { CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY } = process.env;
if (!CLERK_PUBLISHABLE_KEY || !CLERK_SECRET_KEY) {
  console.error("Missing Clerk environment variables");
  throw new Error("Missing required environment variables: CLERK_PUBLISHABLE_KEY or CLERK_SECRET_KEY");
}

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  !TWILIO_PHONE_NUMBER ||
  !POSTHOG_API_KEY
) {
  console.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

// Initialize Fastify server
const fastify = Fastify();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  db = await open({
    filename: './aipharmacy.sqlite',
    driver: sqlite3.Database
  });

  //let pha = await getPharmacy(db, 'CVS');
  //if (!pha) {
  //  throw new Error('Pharmacy not found');
  //}
} catch (error) {
  console.error('Error opening database:', error);
}

function getPharmacy(db, name) {
  return db.get('SELECT * FROM pharmacy WHERE name LIKE ?', [`%${name}%`]);
}

function getDrug(db, name) {
  return db.get('SELECT * FROM drug WHERE name LIKE ?', [`%${name}%`]);
}

function getAllDrugs(db, name) {
  return db.all('SELECT * FROM drug');
}

function getDrugByAvailability(db, drugId) {
  return db.all(`
    SELECT
      p.name AS pharmacy_name,
      p.address,
      p.phone,
      pda.quantity,
      pda.available_from
    FROM drug d
    JOIN pharmacy_drug_availability pda ON d.id = pda.drug_id
    JOIN pharmacy p ON p.id = pda.pharmacy_id
    WHERE d.id = ?
    ORDER BY pda.available_from ASC, pda.quantity DESC;
  `, [drugId]);
}

function insertOrUpdateAvailability(db, drugId, pharmacyId, quantity) {
  return db.run(`
    INSERT INTO pharmacy_drug_availability
      (drug_id, pharmacy_id, quantity, available_from)
    VALUES
      (?, ?, ?, CURRENT_TIMESTAMP)
  `, [drugId, pharmacyId, quantity]);
}

function insertCallLog(db, {
  callSid,
  pharmacyId,
  drugId,
  callStatus,
  stockStatus,
  restockDate = null,
  alternativeFeedback = null,
  transcriptSummary
}) {
  return db.run(`
    INSERT INTO call_log (
      call_sid,
      pharmacy_id,
      drug_id,
      call_status,
      stock_status,
      restock_date,
      alternative_feedback,
      transcript_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [callSid, pharmacyId, drugId, callStatus, stockStatus, restockDate, alternativeFeedback, transcriptSummary]);
}

// Update the root route to serve index.html with dynamic values
fastify.get('/', async (request, reply) => {
  try {
    let html = await fs.readFile('./public/index.html', 'utf-8');
    
    console.log('Debug - CLERK_PUBLISHABLE_KEY:', CLERK_PUBLISHABLE_KEY);
    console.log('Debug - Key length:', CLERK_PUBLISHABLE_KEY?.length);
    console.log('Debug - Key format check:', CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_'));

    // Replace placeholders with actual values
    html = html
      .replace(/{{POSTHOG_API_KEY}}/g, POSTHOG_API_KEY)
      .replace(/{{POSTHOG_HOST}}/g, POSTHOG_HOST)
      .replace(/{{GOOGLE_MAPS_API_KEY}}/g, process.env.GOOGLE_MAPS_API_KEY_FRONTEND)
      .replace(/{{CLERK_PUBLISHABLE_KEY}}/g, CLERK_PUBLISHABLE_KEY);

    // Debug - Check final HTML for Clerk key
    const debugHtml = html.match(/publishableKey["']:\s*['"]([^'"]+)['"]/);
    console.log('Debug - Final key in HTML:', debugHtml?.[1]);

    reply.type('text/html').send(html);
  } catch (error) {
    console.error('Error serving index.html:', error);
    reply.code(500).send('Error loading page');
  }
});

// Register Clerk before the static file handling
fastify.register(clerkPlugin, {
  publishableKey: CLERK_PUBLISHABLE_KEY,
  secretKey: CLERK_SECRET_KEY,
  // Public routes that don't require authentication
  publicRoutes: [
    '/',                         // Main search page
    '/availability',             // Availability page
    '/api/health',               // Health check
    '/components/*',             // Header and other components
    '/css/*',                    // CSS files
    '/js/*',                     // JavaScript files
    '/images/*',                 // Images
    '/validate-address',         // Address validation
    '/map-config',               // Map configuration
    '/api/drugs',                // Drug list
    '/api/availability',         // Drug availability
    '/nearby-pharmacies',        // Pharmacy search
    '/search-pharmacies',        // Pharmacy search
    '/twilio/inbound_call',      // Twilio webhook
    '/outbound-media-stream'     // WebSocket endpoint
  ],
  // Only protect routes related to making calls
  protectedRoutes: [
    '/outbound-call',           // Making calls
    '/call-status/*'            // Checking call status
  ]
});

// Register static file handling first
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// Add components handling
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public/components"),
  prefix: "/components/",
  decorateReply: false
});

// Then register other plugins and routes
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.decorate('db', db);
fastify.register(pharmacyRoutes);

// Initialize PostHog
const posthog = new PostHog(
  POSTHOG_API_KEY,
  { host: POSTHOG_HOST }
);

// Add PostHog to fastify instance
fastify.decorate('posthog', posthog);

// Store for pending call prompts
const pendingCallPrompts = new Map();

// After creating the Map
fastify.decorate('pendingCallPrompts', pendingCallPrompts);

const PORT = process.env.PORT || 8000;

// Change the root route to a different path for API health check
fastify.get("/api/health", async (_, reply) => {
  reply.send({ message: "Server is running" });
});

// Update the availability route
fastify.get('/availability', async (request, reply) => {
  try {
    let html = await fs.readFile('./public/availability.html', 'utf-8');
    
    html = html.replace('{{GOOGLE_MAPS_API_KEY}}', process.env.GOOGLE_MAPS_API_KEY_FRONTEND);
    
    reply.type('text/html').send(html);
  } catch (error) {
    reply.code(500).send('Error loading page');
  }
});

// Initialize Twilio client
const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Helper function to get signed URL for authenticated conversations
async function getSignedUrl() {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// TwiML route for outbound calls
fastify.all("/outbound-call-twiml", async (request, reply) => {
  const prompt = request.query.prompt || "";
  const first_message = request.query.first_message || "";

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${prompt}" />
            <Parameter name="first_message" value="${first_message}" />
          </Stream>
        </Connect>
      </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// TwiML route for inbound calls
fastify.post("/twilio/inbound_call", async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${request.headers.host}/outbound-media-stream" />
      </Connect>
    </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// Add conversation ID tracking variable
let elevenLabsConversationId = null;

// Update the retry function
function fetchConversationWithRetry(conversationId, attempts = 10, fixedDelay = 6000) {
  let attempt = 0;
  const allResults = [];

  function tryFetch() {
    return fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      }
    )
      .then(response => response.json())
      .then(data => {
        attempt++;
        allResults.push({ attempt, timestamp: new Date().toISOString(), data });

        // Check if we have meaningful data_collection_results
        if (data?.analysis?.data_collection_results &&
          Object.keys(data.analysis.data_collection_results).length > 0) {
          // Only log that we found results, save full logging for the end
          console.log("[ElevenLabs] Found data collection results on attempt", attempt);
          return { data, allResults };
        }

        if (attempt >= attempts) {
          return {
            data: allResults[allResults.length - 1].data,
            allResults
          };
        }

        console.log(`[ElevenLabs] Making attempt ${attempt}/${attempts} in ${fixedDelay / 1000} seconds...`);

        return new Promise(resolve => {
          setTimeout(() => resolve(tryFetch()), fixedDelay);
        });
      });
  }

  return tryFetch().catch(error => {
    console.error(`[ElevenLabs] All attempts failed:`, error);
    return { data: null, allResults };
  });
}

// WebSocket route for handling media streams
fastify.register(async fastifyInstance => {
  fastifyInstance.get(
    "/outbound-media-stream",
    { websocket: true },
    (ws, req) => {
      console.info("[Server] Twilio connected to outbound media stream");

      // Variables to track the call
      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let customParameters = null; // Add this to store parameters

      // Handle WebSocket errors
      ws.on("error", console.error);

      // Set up ElevenLabs connection
      const setupElevenLabs = async () => {
        try {
          const signedUrl = await getSignedUrl();
          // Add voice_id parameter to the WebSocket URL
          const wsUrl = new URL(signedUrl);
          wsUrl.searchParams.append('voice_id', 'tvWD4i07Hg5L4uEvbxYV');

          elevenLabsWs = new WebSocket(wsUrl.toString());

          elevenLabsWs.on("open", () => {
            console.log("[ElevenLabs] Connected to Conversational AI");

            // Get stored prompts
            const storedPrompts = pendingCallPrompts.get(callSid);

            if (storedPrompts) {
              // Inject prompts into conversation config
              customParameters = {
                prompt: storedPrompts.prompt,
                first_message: storedPrompts.first_message
              };

              // Send initial configuration with prompt, first message, and voice ID
              const initialConfig = {
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                  agent: {
                    prompt: {
                      prompt: customParameters.prompt,
                    },
                    first_message: customParameters.first_message,
                  },
                  tts: {
                    voiceId: "tvWD4i07Hg5L4uEvbxYV"
                  }
                },
              };

              console.log(
                "[ElevenLabs] Sending initial config with prompt:",
                initialConfig.conversation_config_override.agent.prompt.prompt
              );

              // Send the configuration to ElevenLabs
              elevenLabsWs.send(JSON.stringify(initialConfig));
            }
          });

          elevenLabsWs.on("message", async data => {
            try {
              const message = JSON.parse(data);

              switch (message.type) {
                case "conversation_initiation_metadata":
                  console.log("[ElevenLabs] Received initiation metadata:", message);
                  // Store the conversation ID from the correct path
                  if (message.conversation_initiation_metadata_event?.conversation_id) {
                    elevenLabsConversationId = message.conversation_initiation_metadata_event.conversation_id;
                    console.log("[ElevenLabs] Conversation ID:", elevenLabsConversationId);
                  }
                  break;

                case "audio":
                  if (streamSid) {
                    if (message.audio?.chunk) {
                      const audioData = {
                        event: "media",
                        streamSid,
                        media: {
                          payload: message.audio.chunk,
                        },
                      };
                      ws.send(JSON.stringify(audioData));
                    } else if (message.audio_event?.audio_base_64) {
                      const audioData = {
                        event: "media",
                        streamSid,
                        media: {
                          payload: message.audio_event.audio_base_64,
                        },
                      };
                      ws.send(JSON.stringify(audioData));
                    }
                  } else {
                    console.log(
                      "[ElevenLabs] Received audio but no StreamSid yet"
                    );
                  }
                  break;

                case "interruption":
                  if (streamSid) {
                    ws.send(
                      JSON.stringify({
                        event: "clear",
                        streamSid,
                      })
                    );
                  }
                  break;

                case "ping":
                  if (message.ping_event?.event_id) {
                    elevenLabsWs.send(
                      JSON.stringify({
                        type: "pong",
                        event_id: message.ping_event.event_id,
                      })
                    );
                  }
                  break;

                case "agent_response":
                  console.log(
                    `[Twilio] Agent response: ${message.agent_response_event?.agent_response}`
                  );
                  break;

                case "user_transcript":
                  console.log(
                    `[Twilio] User transcript: ${message.user_transcription_event?.user_transcript}`
                  );
                  break;

                default:
                  console.log(
                    `[ElevenLabs] Unhandled message type: ${message.type}`
                  );
              }
            } catch (error) {
              console.error("[ElevenLabs] Error processing message:", error);
            }
          });

          elevenLabsWs.on("error", error => {
            console.error("[ElevenLabs] WebSocket error:", error);
          });

          elevenLabsWs.on("close", () => {
            console.log("[ElevenLabs] Disconnected. Will attempt to end call.");

            twilioClient.calls(callSid)
              .update({
                status: 'completed'
              }).then(call => {
                console.log("Call ended successfully", call);
              });
          });
        } catch (error) {
          console.error("[ElevenLabs] Setup error:", error);
        }
      };

      // Set up ElevenLabs connection
      setupElevenLabs();

      // Handle messages from Twilio
      ws.on("message", async message => {
        try {
          const msg = JSON.parse(message);
          if (msg.event !== "media") {
            console.log(`[Twilio] Received event: ${msg.event}`);
          }

          switch (msg.event) {
            case "start":
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              customParameters = msg.start.customParameters; // Store parameters
              console.log(
                `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`
              );
              console.log("[Twilio] Start parameters:", customParameters);
              break;

            case "media":
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                const audioMessage = {
                  user_audio_chunk: Buffer.from(
                    msg.media.payload,
                    "base64"
                  ).toString("base64"),
                };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              }
              break;

            case "stop":
              console.log(`[Twilio] Stream ${streamSid} ended`);
              if (elevenLabsConversationId) {
                console.log("[ElevenLabs] Call ended - Conversation ID:", elevenLabsConversationId);

                fetchConversationWithRetry(elevenLabsConversationId)
                  .then(({ data, allResults }) => {
                    // Only show the final successful data at the end
                    if (data?.analysis?.data_collection_results) {
                      console.log("\n=== Final Call Results ===");
                      console.log("Call Status:", data.analysis.call_successful);

                      const results = data.analysis.data_collection_results;

                      // Stock Status
                      if (results.StockStatus) {
                        console.log("Stock Status:", results.StockStatus.value);
                      }

                      // Restock Timeline
                      if (results.RestockTimeline) {
                        console.log("Restock Timeline:", results.RestockTimeline.value);
                      }

                      // Alternative Feedback
                      if (results.AlternativeFeedback) {
                        console.log("Alternative Options:", results.AlternativeFeedback.value);
                      }

                      console.log("\nTranscript Summary:", data.analysis.transcript_summary);
                      console.log("\nDetailed Conversation:");
                      data.transcript.forEach(turn => {
                        console.log(`${turn.role}: ${turn.message}`);
                      });
                      console.log("=====================\n");

                      // ADD DATA TO DATABASE
                      const quantity = results.StockStatus.value === true ? 1 : 0;
                      const storedCallInfo = pendingCallPrompts.get(callSid);
                      console.log("Retrieved callInfo for sid", callSid, ":", storedCallInfo); // Debug log 3

                      if (storedCallInfo?.pharmacyInfo?.id && storedCallInfo?.drugInfo?.id) {
                        // First update availability
                        insertOrUpdateAvailability(
                          db,
                          storedCallInfo.drugInfo.id,
                          storedCallInfo.pharmacyInfo.id,
                          quantity
                        ).then(() => {
                          console.log('Availability updated for', {
                            pharmacy: storedCallInfo.pharmacyInfo.name,
                            drug: storedCallInfo.drugInfo.name
                          });

                          // Then store call results
                          insertCallLog(db, {
                            callSid,
                            pharmacyId: storedCallInfo.pharmacyInfo.id,
                            drugId: storedCallInfo.drugInfo.id,
                            callStatus: data.analysis.call_successful ? 'completed' : 'failed',
                            stockStatus: results.StockStatus?.value || false,
                            restockDate: results.RestockTimeline?.value || null,
                            alternativeFeedback: results.AlternativeFeedback?.value || null,
                            transcriptSummary: data.analysis.transcript_summary
                          }).then(() => {
                            console.log('Call log stored');
                            // Clean up stored call info
                            pendingCallPrompts.delete(callSid);
                          });
                        });
                      } else {
                        console.error("Missing pharmacy or drug info for availability update");
                      }

                    } else {
                      console.log("[ElevenLabs] No data collection results found after all attempts");
                    }
                  })
                  .finally(() => {
                    if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                      elevenLabsWs.close();
                    }
                  });
              } else {
                if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                  elevenLabsWs.close();
                }
              }
              break;

            default:
              console.log(`[Twilio] Unhandled event: ${msg.event}`);
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error);
        }
      });

      // Handle WebSocket closure
      ws.on("close", () => {
        console.log("[Twilio] Client disconnected");
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });
    }
  );
});

// Start the Fastify server
fastify.listen({
  port: PORT,
  host: '0.0.0.0'
}, err => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
});
