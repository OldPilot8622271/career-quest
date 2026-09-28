import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Prevents Vercel timeouts for large PDFs
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { images } = await req.json();

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }

    const prompt = `You are an expert exam analyzer. I have uploaded images or a PDF of a past paper/mock test.
Analyze the document and extract the main questions. 
For each question, identify the core topic, estimate the difficulty (Easy, Medium, Hard), and provide a brief hint.

Return ONLY valid JSON matching this exact schema:
{
  "paperSummary": "Brief 1-sentence summary of the paper's subject",
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

    // Safely format all images/PDFs into Gemini's required inlineData structure
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
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(parts);
    const response = await result.response;
    let rawContent = response.text();
    
    // Strip markdown formatting just in case
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/gi, '').trim();

    let parsedData: any = {};
    try {
      parsedData = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("JSON Parsing failed. Raw Output:", rawContent);
      throw new Error("AI returned malformed data. Please try again.");
    }

    return NextResponse.json({ analysis: parsedData });
  } catch (error: any) {
    console.error('Analyzer error:', error);
    return NextResponse.json(
      { error: error.message || 'Server limits reached or AI failed. Please try again.' },
      { status: 500 }
    );
  }
}