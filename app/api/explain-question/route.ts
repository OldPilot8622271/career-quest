import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// 🔥 Initialize Groq using the key already in your .env.local
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { questionText, topic, hint } = await req.json();

    if (!questionText) {
      return NextResponse.json({ error: 'Question text is required' }, { status: 400 });
    }

    const prompt = `You are an expert tutor. A student has asked for an explanation of the following ${topic} question.
Question: "${questionText}"
Provided Hint: "${hint}"

Provide a clear, step-by-step explanatory answer. Do not just give the final answer—guide the student through the concepts and methodology required to solve it.

Return ONLY a valid JSON object matching this exact schema:
{
  "explanation": "Your detailed, step-by-step explanation here (formatted as a clean, readable string using LaTeX for math equations if needed)..."
}`;

    // 🔥 Call the Groq API with your requested OSS model
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-oss-120b', // The requested model
      response_format: { type: 'json_object' }, // Ensures the output doesn't break your frontend parsing
      temperature: 0.2,
    });

    const rawContent = chatCompletion.choices[0]?.message?.content || '{}';
    const parsedData = JSON.parse(rawContent);

    return NextResponse.json({ explanation: parsedData.explanation });
  } catch (error: any) {
    console.error('Explanation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate explanation.' },
      { status: 500 }
    );
  }
}