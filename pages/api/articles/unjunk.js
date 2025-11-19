import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link } = req.body;

    // Validate required fields
    if (!link) {
      return res.status(400).json({ error: 'Missing article link' });
    }

    // Delete the junk article from Supabase by link
    const { error } = await supabase
      .from('junk_articles')
      .delete()
      .eq('link', link);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to remove article from junk', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Article removed from junk successfully'
    });

  } catch (error) {
    console.error('Error removing article from junk:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
