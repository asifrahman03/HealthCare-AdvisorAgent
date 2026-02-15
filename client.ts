import { config } from "dotenv";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import axios from "axios";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { withPaymentInterceptor } from "@x402/axios";

// Load environment variables
config();

const {
  PRIVATE_KEY,
  EVM_ADDRESS,
  OPENROUTER_API_KEY,
  CDP_API_KEY_ID,
  CDP_API_KEY_SECRET,
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
 * Step 3: Create Axios Instance with Payment Interceptor
 */
const apiClient = withPaymentInterceptor(axios.create(), x402ClientInstance);

console.log("✅ Axios client with x402 payment interceptor ready");

/**
 * Interface for diagnosis request
 */
interface DiagnosisRequest {
  symptoms: string;
  healthHistory?: string;
  userId?: string;
}

/**
 * Function to call the paid /diagnose endpoint
 * This function will automatically handle the 402 payment flow:
 * 1. Make initial request
 * 2. Receive 402 Payment Required
 * 3. Create and sign payment payload
 * 4. Retry request with payment signature
 * 5. Receive response and payment confirmation
 */
async function getDiagnosis(request: DiagnosisRequest): Promise<void> {
  console.log("\n🏥 Requesting diagnosis...");
  console.log("📋 Symptoms:", request.symptoms);
  
  if (request.healthHistory) {
    console.log("📝 Health History:", request.healthHistory);
  }
  
  if (request.userId) {
    console.log("👤 User ID:", request.userId);
  }

  try {
    // Make the request - payment is handled automatically by the interceptor
    const response = await apiClient.post(
      `${SERVER_URL}/diagnose`,
      request,
      {
        headers: {
          "Content-Type": "application/json",
        },
        // Enable response streaming
        responseType: "stream",
      }
    );

    console.log("\n✅ Payment successful! Streaming diagnosis...\n");
    console.log("─".repeat(80));

    // Handle streaming response
    let fullResponse = "";
    
    response.data.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      fullResponse += text;
    });

    response.data.on("end", () => {
      console.log("\n" + "─".repeat(80));
      console.log("\n✅ Diagnosis complete!");
      
      // Extract USER_ID from response if present
      const userIdMatch = fullResponse.match(/--- USER_ID: (.*?) ---/);
      if (userIdMatch) {
        console.log(`\n💾 Your User ID: ${userIdMatch[1]}`);
        console.log("   (Save this to access your history in future requests)");
      }

      // Check for payment response header
      const paymentResponse = response.headers["x-payment-response"];
      if (paymentResponse) {
        console.log("\n💳 Payment confirmed:");
        console.log(`   Transaction recorded: ${paymentResponse}`);
      }
    });

    response.data.on("error", (error: Error) => {
      console.error("\n❌ Stream error:", error.message);
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("\n❌ Request failed:");
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.error || error.message}`);
      
      if (error.response?.status === 402) {
        console.error("\n💡 Note: Payment was required but the interceptor couldn't complete it.");
        console.error("   Please ensure your wallet has sufficient USDC on Base mainnet.");
      }
    } else {
      console.error("\n❌ Error:", error);
    }
    throw error;
  }
}

/**
 * Function to retrieve user history
 */
async function getUserHistory(userId: string): Promise<void> {
  console.log(`\n📖 Fetching history for user: ${userId}`);

  try {
    const response = await axios.get(`${SERVER_URL}/history/${userId}`);
    
    console.log("\n✅ User History:\n");
    console.log("─".repeat(80));
    console.log(response.data);
    console.log("─".repeat(80));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("\n❌ Failed to fetch history:");
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.error || error.message}`);
    } else {
      console.error("\n❌ Error:", error);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("🏥 Healthcare Diagnosis Client with x402 Payments");
  console.log("=".repeat(80) + "\n");

  // Example 1: First diagnosis (new user)
  console.log("\n📍 Example 1: New Diagnosis Request");
  await getDiagnosis({
    symptoms: "Persistent headache for 3 days, sensitivity to light, nausea",
    healthHistory: "No history of migraines, occasional tension headaches",
  });

  // Wait a bit before next request
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Example 2: Follow-up diagnosis with userId
  console.log("\n\n📍 Example 2: Follow-up Diagnosis (Uncomment to test with saved userId)");
  // Uncomment and add your userId from the previous request:
  // await getDiagnosis({
  //   symptoms: "Headache has improved but still feeling dizzy",
  //   userId: "YOUR_USER_ID_HERE",
  // });

  // Example 3: Retrieve history
  console.log("\n\n📍 Example 3: Retrieve User History (Uncomment to test)");
  // Uncomment and add your userId:
  // await getUserHistory("YOUR_USER_ID_HERE");
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
}

// Export for use in other modules
export {
  walletClient,
  x402ClientInstance,
  apiClient,
  getDiagnosis,
  getUserHistory,
};
