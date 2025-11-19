import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  console.log('Predictions API called');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all predictions from the database
    const { data, error } = await supabase
      .from('article_predictions')
      .select('link, confidence_score, reasoning')
      .order('predicted_at', { ascending: false });

    if (error) {
      console.error('Supabase error fetching predictions:', error);
      throw error;
    }

    console.log(`Database returned ${data?.length || 0} predictions`);

    // Convert to a map keyed by link
    const predictions = {};
    (data || []).forEach(pred => {
      predictions[pred.link] = {
        confidence: pred.confidence_score,
        reasoning: pred.reasoning
      };
    });

    console.log(`Returning ${Object.keys(predictions).length} predictions to frontend`);
    res.status(200).json({ predictions });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: error.message });
  }
}
