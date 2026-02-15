import { config } from "dotenv";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

// Load environment variables
config();

const {
  PRIVATE_KEY,
  EVM_ADDRESS,
  SERVER_URL = "http://localhost:3001",
} = process.env;

// Validate required environment variables
if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY environment variable is required");
  process.exit(1);
}

if (!EVM_ADDRESS) {
  console.error("❌ EVM_ADDRESS environment variable is required");
  process.exit(1);
}

console.log("✅ Environment variables loaded");
console.log(`📍 Server URL: ${SERVER_URL}`);
console.log(`💳 Using wallet address: ${EVM_ADDRESS}`);

/**
 * Step 1: Create VIEM Wallet Client with Private Key
 */
const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  transport: http(),
  chain: base, // Base mainnet (eip155:8453)
}).extend(publicActions);

console.log("✅ VIEM wallet client created");
console.log(`🔑 Account address: ${account.address}`);

/**
 * Step 2: Create x402 Client and Register EVM Scheme
 */
const x402ClientInstance = new x402Client();

// Register the exact EVM scheme with the wallet client's signer
registerExactEvmScheme(x402ClientInstance, {
  signer: account,
});

console.log("✅ x402 client created and EVM scheme registered");

/**
 * Step 3: Wrap fetch with x402 Payment Handler
 */
const fetchWithPayment = wrapFetchWithPayment(fetch, x402ClientInstance);

console.log("✅ Fetch client with x402 payment wrapper ready");

/**
 * Interface for diagnosis request
 */
interface DiagnosisRequest {
  symptoms: string;
  healthHistory?: string;
  userId?: string;
}

/**
 * Function to call the paid /diagnose endpoint using fetch
 * This function will automatically handle the 402 payment flow
 */
async function getDiagnosisFetch(request: DiagnosisRequest): Promise<void> {
  console.log("\n🏥 Requesting diagnosis (using fetch)...");
  console.log("📋 Symptoms:", request.symptoms);
  
  if (request.healthHistory) {
    console.log("📝 Health History:", request.healthHistory);
  }
  
  if (request.userId) {
    console.log("👤 User ID:", request.userId);
  }

  try {
    // Make the request - payment is handled automatically by the wrapper
    const response = await fetchWithPayment(`${SERVER_URL}/diagnose`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok && response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("\n✅ Payment successful! Streaming diagnosis...\n");
    console.log("─".repeat(80));

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const text = decoder.decode(value, { stream: true });
        process.stdout.write(text);
        fullResponse += text;
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log("\n✅ Diagnosis complete!");

    // Extract USER_ID from response if present
    const userIdMatch = fullResponse.match(/--- USER_ID: (.*?) ---/);
    if (userIdMatch) {
      console.log(`\n💾 Your User ID: ${userIdMatch[1]}`);
      console.log("   (Save this to access your history in future requests)");
    }

    // Check for payment response header
    const httpClient = new x402HTTPClient(x402ClientInstance);
    const paymentResponse = httpClient.getPaymentSettleResponse(
      (name) => response.headers.get(name)
    );

    if (paymentResponse) {
      console.log("\n💳 Payment confirmed:");
      console.log(`   Transaction: ${JSON.stringify(paymentResponse, null, 2)}`);
    }

  } catch (error) {
    console.error("\n❌ Request failed:");
    console.error(error);
    throw error;
  }
}

/**
 * Function to retrieve user history (no payment required)
 */
async function getUserHistoryFetch(userId: string): Promise<void> {
  console.log(`\n📖 Fetching history for user: ${userId}`);

  try {
    const response = await fetch(`${SERVER_URL}/history/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const history = await response.text();
    
    console.log("\n✅ User History:\n");
    console.log("─".repeat(80));
    console.log(history);
    console.log("─".repeat(80));
  } catch (error) {
    console.error("\n❌ Failed to fetch history:");
    console.error(error);
  }
}

/**
 * Main execution for fetch-based client
 */
async function mainFetch() {
  console.log("\n" + "=".repeat(80));
  console.log("🏥 Healthcare Diagnosis Client with x402 Payments (Fetch API)");
  console.log("=".repeat(80) + "\n");

  // Example 1: First diagnosis (new user)
  console.log("\n📍 Example 1: New Diagnosis Request");
  await getDiagnosisFetch({
    symptoms: "Persistent cough for 2 weeks, mild fever, fatigue",
    healthHistory: "Recent travel to cold climate, no known allergies",
  });

  // Wait a bit before next request
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Example 2: Follow-up diagnosis with userId
  console.log("\n\n📍 Example 2: Follow-up Diagnosis (Uncomment to test with saved userId)");
  // Uncomment and add your userId from the previous request:
  // await getDiagnosisFetch({
  //   symptoms: "Cough has improved, but still feeling tired",
  //   userId: "YOUR_USER_ID_HERE",
  // });

  // Example 3: Retrieve history
  console.log("\n\n📍 Example 3: Retrieve User History (Uncomment to test)");
  // Uncomment and add your userId:
  // await getUserHistoryFetch("YOUR_USER_ID_HERE");
}

// Run if executed directly
if (require.main === module) {
  mainFetch().catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
}

// Export for use in other modules
export {
  walletClient,
  x402ClientInstance,
  fetchWithPayment,
  getDiagnosisFetch,
  getUserHistoryFetch,
};
