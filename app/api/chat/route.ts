import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, profile } = await req.json();

    // Clean messages to prevent API errors and apply sliding window memory
    const cleanMessages = (messages || []).map((msg: any) => ({
      role: imgRole(msg.role),
      content: msg.content
    })).slice(-4);

    const systemMessage = {
      role: 'system',
      content: `You are an elite AI Career & Academic Counsellor. 
      Analyze the student profile and provide a thorough, structured, and complete response. 
      Organize your advice into clear sections: Current Status, Immediate Actions (Next 7 Days), 30-Day Blueprint, and AI Pro-Tip. 
      Write with high density and precision so that your complete blueprint fits naturally and terminates cleanly without cutting off.

      Student Profile: ${JSON.stringify(profile || {})}`
    };

    function imgRole(r: string) {
      return r === 'user' ? 'user' : 'assistant';
    }

    const chatStream = await groq.chat.completions.create({
      messages: [systemMessage, ...cleanMessages],
      model: 'openai/gpt-oss-120b',
      temperature: 0.3,
      // Optimized token ceiling to prevent hard-cutoffs while allowing deep, comprehensive output
      max_tokens: 4096, 
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of chatStream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (err) {
          console.error('Streaming chunk error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}