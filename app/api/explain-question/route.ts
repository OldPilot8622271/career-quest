import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  "explanation": "Your detailed, step-by-step explanation here (formatted as a clean, readable string)..."
}`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.5-flash-lite', 
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let rawContent = response.text().trim();
    
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/gi, '').trim();
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