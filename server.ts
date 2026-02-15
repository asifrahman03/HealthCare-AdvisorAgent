import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator } from "@coinbase/x402";
import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
import { 
  initializeUserDataDir, 
  loadUserHistory, 
  appendToUserHistory,
  ensureUserId,
  extractUserProvidedHistory
} from './services/userHistory';

dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Get configuration from environment variables
const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("EVM_ADDRESS environment variable is required");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

// Create resource server and register EVM scheme
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme()); // Base mainnet

// Initialize OpenRouter client
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

// Initialize user data directory on startup
initializeUserDataDir();

// Add logging middleware to see what's happening
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Headers:`, JSON.stringify(req.headers, null, 2));
  next();
});

// Configure payment middleware for the LLM endpoint
const paymentConfig = {
  "POST /diagnose": {
    accepts: [
      { 
        scheme: "exact", 
        price: "$0.001", 
        network: "eip155:8453" as `${string}:${string}`, 
        payTo: evmAddress,
      }
    ],
    description: "Healthcare diagnosis and treatment recommendation",
    mimeType: "application/json",
  },
};

// Apply payment middleware
app.use(paymentMiddleware(paymentConfig, server));

// LLM diagnosis endpoint - this will only be reached if payment is valid
app.post("/diagnose", async (req, res) => {
  try {
    const { symptoms, healthHistory, userId } = req.body;

    if (!symptoms) {
      return res.status(400).json({ 
        error: "Symptoms are required. Please provide a 'symptoms' field in the request body." 
      });
    }

    // Generate or use provided userId
    const effectiveUserId = ensureUserId(userId);

    // Load user's historical context from markdown
    const fullHistoryMd = await loadUserHistory(effectiveUserId);
    
    // Extract only user-provided information (symptoms and health history)
    // This prevents LLM hallucinations from previous sessions from being treated as facts
    const userProvidedHistory = extractUserProvidedHistory(fullHistoryMd);

    // Build messages array with historical context
    const messages = [
      {
        role: "system" as const,
        content: `You are a healthcare assistant. You have access to symptoms and health information that the patient has previously reported.

IMPORTANT: The information below contains ONLY what the patient has explicitly reported in previous sessions. Do NOT assume or infer medical conditions that were not explicitly stated by the patient. Only reference information that was directly provided by the patient.

PREVIOUS PATIENT REPORTS:
${userProvidedHistory}

Instructions:
- Review the patient's previously reported symptoms and health information above
- Reference previous symptoms or patterns if relevant
- Note any recurring issues
- Provide continuity of care recommendations
- ONLY reference medical conditions, diagnoses, or health information that was explicitly stated by the patient in their reports
- Do NOT assume chronic conditions or diagnoses unless the patient explicitly mentioned them
- You are given a user's health history and a list of symptoms. You need to diagnose the user's condition and recommend a treatment plan based on the CURRENT symptoms and ONLY the explicitly reported health information.`
      },
      {
        role: "user" as const,
        content: healthHistory 
          ? `Additional Context: ${healthHistory}\n\nCurrent Symptoms: ${symptoms}`
          : `Current Symptoms: ${symptoms}`
      }
    ];

    // Stream the response
    const stream = await openRouter.chat.send({
      chatGenerationParams: {
        model: "arcee-ai/trinity-large-preview:free",
        messages,
        stream: true
      }
    });

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let response = "";
    let chunkCount = 0;
    let usageInfo: any = null;

    try {
      for await (const chunk of stream) {
        chunkCount++;
        const content = chunk.choices[0]?.delta?.content;
        
        if (content) {
          response += content;
          // Send chunk to client
          res.write(content);
        }
        
        // Usage information comes in the final chunk
        if (chunk.usage) {
          usageInfo = chunk.usage;
        }
      }
      
      // After streaming completes, save to markdown file
      await appendToUserHistory(
        effectiveUserId,
        symptoms,
        response,
        healthHistory
      );

      // Send userId back to client so they can use it for future requests
      res.write(`\n\n--- USER_ID: ${effectiveUserId} ---`);
      res.end();

    } catch (streamError) {
      console.error("Error during streaming:", streamError);
      res.write(`\n\n[Error during streaming]: ${streamError}\n`);
      res.write(`[Chunks received before error: ${chunkCount}]\n`);
      res.write(`[Response length before error: ${response.length} characters]\n`);
      res.end();
    }
  } catch (error) {
    console.error("Error in /diagnose endpoint:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Test endpoint without payment (keep your existing one)
app.post("/diagnose-test", async (req, res) => {
  try {
    const { symptoms, healthHistory, userId } = req.body;

    if (!symptoms) {
      return res.status(400).json({ 
        error: "Symptoms are required. Please provide a 'symptoms' field in the request body." 
      });
    }

    // Generate or use provided userId
    const effectiveUserId = ensureUserId(userId);

    // Load user's historical context
    const fullHistoryMd = await loadUserHistory(effectiveUserId);
    
    // Extract only user-provided information (symptoms and health history)
    // This prevents LLM hallucinations from previous sessions from being treated as facts
    const userProvidedHistory = extractUserProvidedHistory(fullHistoryMd);

    // Build messages array
    const messages = [
      {
        role: "system" as const,
        content: `You are a healthcare assistant. You have access to symptoms and health information that the patient has previously reported.

IMPORTANT: The information below contains ONLY what the patient has explicitly reported in previous sessions. Do NOT assume or infer medical conditions that were not explicitly stated by the patient. Only reference information that was directly provided by the patient.

PREVIOUS PATIENT REPORTS:
${userProvidedHistory}

Instructions:
- Review the patient's previously reported symptoms and health information above
- Reference previous symptoms or patterns if relevant
- Note any recurring issues
- Provide continuity of care recommendations
- ONLY reference medical conditions, diagnoses, or health information that was explicitly stated by the patient in their reports
- Do NOT assume chronic conditions or diagnoses unless the patient explicitly mentioned them
- You are given a user's health history and a list of symptoms. You need to diagnose the user's condition and recommend a treatment plan based on the CURRENT symptoms and ONLY the explicitly reported health information.`
      },
      {
        role: "user" as const,
        content: healthHistory 
          ? `Additional Context: ${healthHistory}\n\nCurrent Symptoms: ${symptoms}`
          : `Current Symptoms: ${symptoms}`
      }
    ];

    // Stream the response
    const stream = await openRouter.chat.send({
      chatGenerationParams: {
        model: "arcee-ai/trinity-large-preview:free",
        messages,
        stream: true
      }
    });

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let response = "";
    let chunkCount = 0;

    try {
      for await (const chunk of stream) {
        chunkCount++;
        const content = chunk.choices[0]?.delta?.content;
        
        if (content) {
          response += content;
          res.write(content);
        }
      }
      
      // Save to markdown
      await appendToUserHistory(
        effectiveUserId,
        symptoms,
        response,
        healthHistory
      );

      res.write(`\n\n--- USER_ID: ${effectiveUserId} ---`);
      res.end();

    } catch (streamError) {
      console.error("Error during streaming:", streamError);
      res.write(`\n\n[Error during streaming]: ${streamError}\n`);
      res.end();
    }
  } catch (error) {
    console.error("Error in /diagnose-test endpoint:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// New endpoint to view user history
app.get("/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await loadUserHistory(userId);
    
    res.setHeader('Content-Type', 'text/markdown');
    res.send(history);
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to load history",
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`LLM endpoint (with x402 payment): POST http://localhost:${PORT}/diagnose`);
  console.log(`Test endpoint (no payment): POST http://localhost:${PORT}/diagnose-test`);
}); 