# HealthCare-AdvisorAgent

AI Agent that retains Patient context for personalized care. Utilizes x402 integration for monetization via stablecoin.

## Features

- **Personalized Healthcare Advice**: AI-powered diagnosis and treatment recommendations
- **Patient Context Retention**: Maintains conversation history across sessions for continuity of care
- **x402 Payment Integration**: Monetized API with stablecoin payments via Base network
- **Streaming Responses**: Real-time streaming of AI-generated healthcare recommendations

## Setup

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- OpenRouter API key ([get one here](https://openrouter.ai/))
- EVM wallet address (for receiving payments on Base network)

### Installation

1. Clone the repository and navigate to the project directory:
```bash
cd HealthCare-AdvisorAgent
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
touch .env
```

4. Add the following environment variables to `.env`:
```env
# OpenRouter API Key (required)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# EVM Address for receiving payments (required)
# Must be a valid Ethereum address on Base network (eip155:8453)
EVM_ADDRESS=0xYourEthereumAddressHere

# Optional: Server port (defaults to 3001)
PORT=3001
```

5. Build the TypeScript project (optional, for production):
```bash
npm run build
```

### Running the Server

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The server will start on `http://localhost:3001` (or the port specified in your `.env` file).

## API Endpoints

### Health Check
```bash
GET /health
```
Returns server status.

### Get User History
```bash
GET /history/:userId
```
Retrieves the complete medical history for a specific user in markdown format.

### Test Endpoint (No Payment Required)
```bash
POST /diagnose-test
```
Test endpoint that doesn't require x402 payment. Useful for development and testing.

### Diagnosis Endpoint (Payment Required)
```bash
POST /diagnose
```
Main endpoint that requires x402 payment ($0.001 per request). Returns streaming healthcare diagnosis and recommendations.

## Usage via cURL

### Test Endpoint (No Payment)

Test the agent without payment requirements:

```bash
curl -X POST http://localhost:3001/diagnose-test \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "Headache, fever, and fatigue for the past 3 days",
    "healthHistory": "No known allergies, generally healthy",
    "userId": "optional-user-id-for-continuity"
  }'
```

**First Request** (without userId):
```bash
curl -X POST http://localhost:3001/diagnose-test \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "Persistent cough and chest pain",
    "healthHistory": "Non-smoker, no previous respiratory issues"
  }'
```

The response will include a `USER_ID` at the end. Save this for future requests to maintain context.

**Subsequent Requests** (with userId for context):
```bash
curl -X POST http://localhost:3001/diagnose-test \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "Follow-up: cough is improving but still present",
    "healthHistory": "Following previous recommendations",
    "userId": "your-user-id-from-previous-response"
  }'
```

### Production Endpoint (With x402 Payment)

The `/diagnose` endpoint requires x402 payment. The first request will return a `402 Payment Required` response with payment details.

**Initial Request** (will return 402 with payment instructions):
```bash
curl -X POST http://localhost:3001/diagnose \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "symptoms": "Headache, fever, and fatigue for the past 3 days",
    "healthHistory": "No known allergies, generally healthy"
  }' \
  -v
```

**With Payment** (include X-PAYMENT header):
```bash
curl -X POST http://localhost:3001/diagnose \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-PAYMENT: your-payment-signature-here" \
  -d '{
    "symptoms": "Headache, fever, and fatigue for the past 3 days",
    "healthHistory": "No known allergies, generally healthy",
    "userId": "your-user-id"
  }'
```

> **Note**: To generate the `X-PAYMENT` header, you'll need to use an x402 client library. The payment amount is $0.001 per request, payable on Base network (eip155:8453).

### View User History

Retrieve a user's complete medical history:

```bash
curl http://localhost:3001/history/your-user-id
```

## Request Body Format

All diagnosis endpoints accept the following JSON structure:

```json
{
  "symptoms": "Required: Description of current symptoms",
  "healthHistory": "Optional: Additional health context or medical history",
  "userId": "Optional: User ID for maintaining context across sessions"
}
```

### Field Descriptions

- **symptoms** (required): A description of the patient's current symptoms
- **healthHistory** (optional): Additional context such as allergies, previous conditions, medications, etc.
- **userId** (optional): A unique identifier for the patient. If not provided, a new UUID will be generated and returned in the response.

## Response Format

The diagnosis endpoints return a streaming response (text/event-stream) containing:

1. **Streaming AI Response**: Real-time chunks of the diagnosis and recommendations
2. **User ID**: At the end of the stream, you'll receive `--- USER_ID: <uuid> ---`

Example response:
```
Based on your symptoms of headache, fever, and fatigue, I recommend...

[streaming content continues...]

--- USER_ID: 550e8400-e29b-41d4-a716-446655440000 ---
```

## Patient Context Retention

The agent maintains patient context by:

1. **Storing History**: Each session is saved to a markdown file in `user-data/` directory
2. **Context Loading**: When a `userId` is provided, previous symptoms and health history are loaded
3. **Continuity**: The AI references previous sessions to provide continuity of care
4. **Privacy**: Each user's data is stored separately in their own file

## Development

### Project Structure

```
HealthCare-AdvisorAgent/
├── server.ts              # Main Express server with x402 integration
├── services/
│   └── userHistory.ts     # User history management service
├── user-data/             # Generated directory for storing patient histories
├── package.json
└── .env                   # Environment variables (not in git)
```

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production server (requires build first)
- `npm run type-check` - Type check without building

