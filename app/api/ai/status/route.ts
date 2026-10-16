// Tells the app which AI steps are connected. Only ever reports true/false; never exposes keys or provider details.
// Transcription is on when both the OpenRouter key and the tester code are set (spec §7c).
export const dynamic = 'force-dynamic';

export function GET() {
  const transcription = !!(process.env.OPENROUTER_API_KEY?.trim() && process.env.TESTER_CODE?.trim());
  return Response.json({ mode: 'demo', transcription, photoText: false }, { headers: { 'Cache-Control': 'no-store' } });
}
