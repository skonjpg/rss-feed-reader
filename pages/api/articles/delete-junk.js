import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link } = req.body;

    if (!link) {
      return res.status(400).json({ error: 'Article link is required' });
    }

    console.log(`[Delete Junk] Deleting article with link: ${link}`);

    // Delete the specific junk article
    const { error } = await supabase
      .from('junk_articles')
      .delete()
      .eq('link', link);

    if (error) {
      console.error('[Delete Junk] Error:', error);
      return res.status(500).json({
        error: 'Failed to delete junk article',
        details: error.message
      });
    }

    console.log(`[Delete Junk] Successfully deleted article`);

    return res.status(200).json({
      success: true,
      message: 'Article deleted from database'
    });

  } catch (error) {
    console.error('[Delete Junk] Error:', error);
    return res.status(500).json({
      error: 'Failed to delete junk article',
      details: error.message
    });
  }
}
