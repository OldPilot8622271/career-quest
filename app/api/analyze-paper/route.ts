import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// 🔥 Prevents Vercel from timing out on multi-page analyses
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { images } = await req.json();

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    const prompt = `You are an expert exam analyzer. I have uploaded images of a past paper or mock test.
Analyze all the images and extract the main questions. 
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

    // Map all uploaded images to the Groq Vision format
    const contentPayload: any[] = [
      { type: 'text', text: prompt }
    ];

    images.forEach((imgBase64: string) => {
      contentPayload.push({
        type: 'image_url',
        image_url: { url: imgBase64 }
      });
    });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: contentPayload
        }
      ],
      model: 'llama-3.2-90b-vision-preview', 
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 3500, // Boosted to allow room for multi-page extraction
    });

    const rawContent = chatCompletion.choices[0]?.message?.content || '{}';
    
    // Robust JSON cleaning
    let parsedData: any = {};
    try {
      const cleanJSON = rawContent.replace(/```json/gi, '').replace(/```/gi, '').trim();
      parsedData = JSON.parse(cleanJSON);
    } catch (parseError) {
      console.error("JSON Parsing failed. Raw Output:", rawContent);
      throw new Error("AI returned malformed data. Please try again.");
    }

    return NextResponse.json({ analysis: parsedData });
  } catch (error: any) {
    console.error('Analyzer error:', error);
    return NextResponse.json(
      { error: error.message || 'Server limits reached or AI failed. Please try fewer images.' },
      { status: 500 }
    );
  }
}