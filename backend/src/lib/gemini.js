const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const actionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    action_type: {
      type: SchemaType.STRING,
      enum: ["DELETE", "UPDATE", "DROP", "SCALE"],
    },
    target: { type: SchemaType.STRING },
    condition: { type: SchemaType.STRING },
    environment: {
      type: SchemaType.STRING,
      enum: ["production", "staging"],
    },
    self_reported_rows_affected: { type: SchemaType.NUMBER },
    self_reported_risk: {
      type: SchemaType.STRING,
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
  },
  required: [
    "action_type",
    "target",
    "condition",
    "environment",
    "self_reported_rows_affected",
    "self_reported_risk",
  ],
};

/**
 * Plan action using Gemini with responseSchema constrained generation.
 * @param {string} userRequest - Natural language request
 * @param {object|null} mockEnvironment - Optional mock environment context
 * @returns {Promise<object>} Structured action conforming to actionSchema
 */
async function planAction(userRequest, mockEnvironment = null) {
  const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: actionSchema,
    },
  });

  const envContext = mockEnvironment
    ? `\nCurrent environment state: ${JSON.stringify(mockEnvironment)}`
    : "";

  const prompt = `You are a Planner Agent for an infrastructure/database operations system.${envContext}
User request: "${userRequest}"

Convert this into a structured action. Use "production" as the environment
unless the request explicitly mentions staging/test/dev. Estimate
self_reported_rows_affected based on the environment state provided or realistic context —
do not return 0 unless the condition genuinely matches nothing.`;

  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await model.generateContent(prompt);
      break;
    } catch (err) {
      if (err.message?.includes("503") && attempt < 3) {
        console.warn(` Gemini 503 high demand spike, retrying (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
      } else {
        throw err;
      }
    }
  }

  const rawText = result.response.text();
  const parsed = JSON.parse(rawText);

  // Provide self_reported_rows alias for backward compatibility
  parsed.self_reported_rows = parsed.self_reported_rows_affected;

  return parsed;
}

// Backwards-compatible alias for existing routes
const parseTaskToAction = (userRequest, mockEnvironment) => planAction(userRequest, mockEnvironment);

module.exports = {
  planAction,
  parseTaskToAction,
  actionSchema,
};
