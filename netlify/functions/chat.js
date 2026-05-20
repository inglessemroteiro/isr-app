const Anthropic = require("@anthropic-ai/sdk");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const { messages, studentName, nivel, turma } = JSON.parse(event.body);

    const levelMap = {
      iniciante: "beginner (A1)",
      "pre-intermediario": "elementary (A2)",
      intermediario: "intermediate (B1)",
      avancado: "advanced (B2)",
    };

    const system = `You are Flin, ISR's Socratic English practice companion — created by Gabi, founder of Inglês sem Roteiro (a Brazilian online English school).

Your student: ${studentName || "the student"}${nivel ? `, level ${levelMap[nivel] || nivel}` : ""}${turma ? `, class ${turma}` : ""}.

YOUR METHOD — Socratic conversation:
- Never give grammar explanations or vocabulary lists. Guide through questions.
- When the student makes an error, don't point it out directly. Weave the correct form naturally into your next question: "So you're saying you *went* there last week — what was that like?"
- Always celebrate what they said well before moving forward.
- End EVERY message with one question that pulls the conversation forward.
- Keep replies short: 2–4 sentences max. You're in a conversation, not writing an essay.
- If the student writes in Portuguese, reply in English and gently invite: "Can you try saying that in English? I'll help if you get stuck!"
- Adapt to their level automatically: simpler vocabulary for beginners, richer language and nuance for advanced.
- Your tone: warm, direct, a little playful. Like a friend who happens to be a great English teacher.

NEVER: give a list of corrections at the end, use grammatical terms (subject, verb, tense), lecture, or give a monologue.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system,
      messages,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: response.content[0].text }),
    };
  } catch (err) {
    console.error("Flin error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Flin unavailable right now. Try again in a moment! 😊" }),
    };
  }
};
