import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Delete Junk] Deleting all junk articles from database...');

    // Delete all junk articles
    const { data, error } = await supabase
      .from('junk_articles')
      .delete()
      .neq('link', ''); // Delete all rows (neq with empty string as workaround)

    if (error) {
      console.error('[Delete Junk] Error:', error);
      return res.status(500).json({
        error: 'Failed to delete junk articles',
        details: error.message
      });
    }

    // Count deleted articles (data contains deleted rows)
    const deletedCount = data?.length || 0;

    console.log(`[Delete Junk] Successfully deleted ${deletedCount} junk articles`);

    return res.status(200).json({
      success: true,
      deleted: deletedCount,
      message: `Deleted ${deletedCount} junk articles`
    });

  } catch (error) {
    console.error('[Delete Junk] Error:', error);
    return res.status(500).json({
      error: 'Failed to delete junk articles',
      details: error.message
    });
  }
}
