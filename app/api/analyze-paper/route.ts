import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { images, subject = 'All Subjects' } = await req.json();

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }

    // 🔥 Dynamically adjust extraction instructions based on the selected tab
    let extractionInstruction = `Extract a broad, representative sample of 15-20 questions across all sections.`;
    if (subject !== 'All Subjects') {
      extractionInstruction = `CRITICAL INSTRUCTION: You MUST extract EVERY SINGLE QUESTION exclusively from the ${subject.toUpperCase()} section of this booklet. Do not skip any questions in this section. Do not extract questions from other subjects.`;
    }

    const prompt = `You are an expert exam analyzer. I have uploaded an exam paper/test booklet.
${extractionInstruction}

For each extracted question:
1. Provide the exact question text.
2. Identify the specific sub-topic (e.g., Kinematics, Chemical Bonding, Polynomials).
3. Estimate difficulty (Easy, Medium, Hard).
4. Provide a helpful 1-sentence hint for solving it.

Return ONLY a valid JSON object matching this exact schema:
{
  "paperSummary": "Brief summary of the test paper focusing on the selected section",
  "questions": [
    {
      "questionText": "The exact extracted question text...",
      "topic": "Specific Topic (e.g., Kinematics, Integration)",
      "difficulty": "Medium",
      "hint": "A brief 1-sentence hint on how to start solving it."
    }
  ]
}`;

    const parts: any[] = [{ text: prompt }];

    images.forEach((base64Str: string) => {
      const match = base64Str.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    });

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.5-flash-lite', 
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192, // Generous ceiling for dense text
        temperature: 0.1,      // Kept low for accurate extraction
      }
    });

    const result = await model.generateContent(parts);
    const response = await result.response;
    let rawContent = response.text().trim();
    
    // Clean up JSON parsing
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedData = JSON.parse(rawContent);

    return NextResponse.json({ analysis: parsedData });
  } catch (error: any) {
    console.error('Analyzer error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze paper.' },
      { status: 500 }
    );
  }
}