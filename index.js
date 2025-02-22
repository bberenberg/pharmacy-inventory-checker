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

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  !TWILIO_PHONE_NUMBER
) {
  console.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

// Initialize Fastify server
const fastify = Fastify();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register static file handling first
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// Then register other plugins and routes
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.register(pharmacyRoutes);

const PORT = process.env.PORT || 8000;

// Change the root route to a different path for API health check
fastify.get("/api/health", async (_, reply) => {
  reply.send({ message: "Server is running" });
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

// Store for pending call prompts
const pendingCallPrompts = new Map();



// Modified outbound-call route
fastify.post("/outbound-call", async (request, reply) => {
  const { number, prompt, first_message } = request.body;

  if (!number) {
    return reply.code(400).send({ error: "Phone number is required" });
  }

  try {
    // Get the base URL from environment or request
    const baseUrl = PUBLIC_URL || `https://${request.headers.host}`;

    // Make the call without prompts in URL
    const call = await twilioClient.calls.create({
      to: number,
      from: TWILIO_PHONE_NUMBER,
      url: `${baseUrl}/twilio/inbound_call`,
    });

    // Store prompts mapped to callSid
    pendingCallPrompts.set(call.sid, {
      prompt,
      first_message
    });

    // Cleanup after 5 minutes in case call never connects
    setTimeout(() => {
      pendingCallPrompts.delete(call.sid);
    }, 300000); // 5 minutes

    return reply.send({ success: true, callSid: call.sid });
  } catch (error) {
    console.error("Error initiating call:", error);
    return reply.code(500).send({ error: error.message });
  }
});

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

      console.log(`[ElevenLabs] Making attempt ${attempt}/${attempts} in ${fixedDelay/1000} seconds...`);
      
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
          elevenLabsWs = new WebSocket(signedUrl);

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

              // Send initial configuration with prompt and first message
              const initialConfig = {
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                  agent: {
                    prompt: {
                      prompt: customParameters.prompt,
                    },
                    first_message: customParameters.first_message,
                  },
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
fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`[Server] Listening on port ${PORT}`);
});
