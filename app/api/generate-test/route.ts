import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { topic, count } = await req.json();
    const questionCount = count || 5;

    // CHAIN OF THOUGHT PROMPT: Explanation MUST come before the answer
    const prompt = `You are an expert academic examiner. Create a ${questionCount}-question multiple-choice quiz on the topic: "${topic}".

STRICT RULES TO PREVENT FACTUAL ERRORS:
1. You must think step-by-step. Write a detailed, factually accurate "explanation" FIRST.
2. Based on your explanation, provide 4 distinct "options".
3. In "correctAnswer", write the EXACT string matching the correct option verbatim. Do not use letters or indices.

Return ONLY a valid JSON object matching this schema with no extra text or markdown:
{
  "questions": [
    {
      "question": "Question text here?",
      "explanation": "Step-by-step factual reasoning explaining the correct concept.",
      "options": [
        "First option",
        "Second option",
        "Third option",
        "Fourth option"
      ],
      "correctAnswer": "Exact text of the correct option"
    }
  ]
}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'openai/gpt-oss-120b',
      temperature: 0.1, // Keep this very low for factual accuracy
      max_tokens: 2500,
    });

    const rawContent = chatCompletion.choices[0]?.message?.content || '{}';

    // Strip out markdown formatting that Groq sometimes adds
    const cleanJSON = rawContent
      .replace(/```json/gi, '')
      .replace(/```/gi, '')
      .trim();

    const parsedData = JSON.parse(cleanJSON);

    // Sanitize the output for the frontend
    const sanitizedQuestions = (parsedData.questions || []).map((q: any) => {
      let correctIndex = q.options.findIndex(
        (opt: string) => opt.trim().toLowerCase() === String(q.correctAnswer || '').trim().toLowerCase()
      );

      if (correctIndex === -1) {
        correctIndex = q.options.findIndex((opt: string) =>
          opt.toLowerCase().includes(String(q.correctAnswer || '').toLowerCase())
        );
      }

      const finalIndex = correctIndex >= 0 ? correctIndex : 0;

      return {
        question: q.question,
        options: q.options,
        correctAnswer: q.options[finalIndex], // Ensure the exact string is passed
        correctAnswerIndex: finalIndex,
        explanation: q.explanation || '',
      };
    });

    return NextResponse.json({ questions: sanitizedQuestions });
  } catch (error: any) {
    console.error('Test generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate test' },
      { status: 500 }
    );
  }
}