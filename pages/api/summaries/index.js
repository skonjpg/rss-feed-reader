import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Fetch all summaries
    try {
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to fetch summaries', details: error.message });
      }

      return res.status(200).json({
        success: true,
        summaries: data || [],
        count: data?.length || 0
      });

    } catch (error) {
      console.error('Error fetching summaries:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  else if (req.method === 'POST') {
    // Create a new summary
    try {
      const { text, articleNumber } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Summary text is required' });
      }

      const { data, error } = await supabase
        .from('summaries')
        .insert([
          {
            text,
            article_number: articleNumber,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to create summary', details: error.message });
      }

      return res.status(201).json({
        success: true,
        summary: data[0]
      });

    } catch (error) {
      console.error('Error creating summary:', error);
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
