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

    // Delete the approved article from Supabase by link
    const { error } = await supabase
      .from('approved_articles')
      .delete()
      .eq('link', link);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to unapprove article', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Article unapproved successfully'
    });

  } catch (error) {
    console.error('Error unapproved article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
