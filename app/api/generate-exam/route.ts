import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// 🔥 THE FIX: Adds Vercel's 60-second timeout ceiling to prevent 504 Gateway errors
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { examName } = await req.json();

    if (!examName) {
      return NextResponse.json({ error: 'Exam name is required' }, { status: 400 });
    }

    const systemPrompt = `You are an expert entrance exam database and academic counsellor.
Provide complete, factual bulletin details for the requested exam.

STRICT RULES:
1. NEVER output "Check official bulletin" or leave any field blank or vague.
2. For "examDate" and "applicationDeadline", provide the typical annual timeframe if the exact calendar is unannounced (e.g., "April - May (Expected)", "First week of March (Usually by March 8th)").
3. For "eligibility", provide concrete criteria (mandatory subjects like PCM/PCB, minimum aggregate percentage such as 45% or 75%, and qualifying board status).
4. For "stream", be specific (e.g., "Science (PCM / PCB)", "Engineering / Technology", "Medical", "Law", "Management").
5. Provide the actual official portal link (e.g., "https://cetcell.mahacet.org").

Return ONLY a valid JSON object matching this schema:
{
  "title": "Full Official Name of the Exam",
  "stream": "Academic Stream",
  "examDate": "Estimated or confirmed exam timeframe",
  "applicationDeadline": "Estimated or confirmed application deadline",
  "eligibility": "Detailed eligibility criteria including marks and subjects",
  "officialWebsite": "https://..."
}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate bulletin details for: ${examName}` }
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
      max_tokens: 1200,
      // 🔥 THE FIX: Forces the AI to strictly output a clean JSON object
      response_format: { type: 'json_object' },
    });

    const rawContent = chatCompletion.choices[0]?.message?.content || '{}';

    // Extract JSON block safely
    let parsed: any = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(rawContent);
      }
    } catch (parseError) {
      console.warn("Failed to parse AI output, falling back to defaults.", parseError);
      parsed = {};
    }

    // Support both direct objects and nested { exam: { ... } } responses
    const rawExam = parsed.exam || parsed;

    // Normalize keys so the frontend receives populated values every time
    const formattedExam = {
      title: rawExam.title || rawExam.name || rawExam.examName || examName,
      stream: rawExam.stream || rawExam.category || 'General / Entrance',
      examDate: rawExam.examDate || rawExam.date || rawExam.exam_date || 'April - May (Typical schedule)',
      applicationDeadline: rawExam.applicationDeadline || rawExam.deadline || rawExam.lastDate || 'March (Typical window)',
      eligibility: rawExam.eligibility || rawExam.criteria || rawExam.eligibilityCriteria || '10+2 / HSC Passed or appearing with relevant subjects.',
      officialWebsite: rawExam.officialWebsite || rawExam.website || rawExam.url || 'https://google.com'
    };

    return NextResponse.json({ exam: formattedExam });

  } catch (error: any) {
    console.error('Generate Exam API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate exam bulletin' },
      { status: 500 }
    );
  }
}