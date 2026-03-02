import { GoogleGenAI } from "@google/genai";
import { statsService } from "./statsService";

// Helper to get the active API key
const getApiKey = () => {
  const activeKey = statsService.getActiveApiKey();
  if (activeKey) return activeKey;
  return process.env.GEMINI_API_KEY;
};

export async function translateText(text: string, targetLanguage: string) {
  if (!text || text.trim().length === 0) return "";

  const apiKey = getApiKey();
  if (!apiKey) {
    return "API Key is missing. Please configure it in the Admin Panel or Secrets panel.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [{
          text: `Translate the following text into ${targetLanguage}.
Rules:
1. Maintain a natural, conversational tone appropriate for a novel.
2. IMPORTANT: Keep all proper names (people, places, specific titles) in English. Do not translate them.
3. Return only the translated text without any explanations or quotes.

Text to translate:
"${text}"`
        }]
      }],
      config: {
        temperature: 0.3,
      }
    });

    if (!response.text) {
      throw new Error("Empty response from AI");
    }

    return response.text;
  } catch (error: any) {
    console.error("Translation error:", error);
    if (error.message?.includes("API_KEY_INVALID")) {
      return "Invalid API Key. Please check your configuration.";
    }
    return `Translation failed: ${error.message || "Unknown error"}`;
  }
}
