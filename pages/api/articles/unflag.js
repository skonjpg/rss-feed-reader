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

    // Delete the flagged article from Supabase by link
    const { error } = await supabase
      .from('flagged_articles')
      .delete()
      .eq('link', link);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to unflag article', details: error.message });
    }

    // Also delete the confidence score to prevent auto-junking when article returns to All Articles
    const { error: deleteError } = await supabase
      .from('article_predictions')
      .delete()
      .eq('link', link);

    if (deleteError) {
      console.error('Error deleting prediction:', deleteError);
      // Don't fail the request if prediction deletion fails - article is already unflagged
    }

    return res.status(200).json({
      success: true,
      message: 'Article unflagged successfully'
    });

  } catch (error) {
    console.error('Error unflagging article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
