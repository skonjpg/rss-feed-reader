import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 12); // 12 days ago

    console.log(`Cleaning up articles older than ${cutoffDate.toISOString()}`);

    // Get links that should be kept (approved and junk articles)
    const { data: approvedData } = await supabase
      .from('approved_articles')
      .select('link');

    const { data: junkData } = await supabase
      .from('junk_articles')
      .select('link');

    const approvedLinks = new Set((approvedData || []).map(a => a.link));
    const junkLinks = new Set((junkData || []).map(j => j.link));
    const keepLinks = new Set([...approvedLinks, ...junkLinks]);

    console.log(`Keeping ${keepLinks.size} links (approved + junk)`);

    // Remove flagged articles that are also approved or junked (should be mutually exclusive)
    const { data: conflictingFlagged } = await supabase
      .from('flagged_articles')
      .select('link');

    const flaggedToRemove = (conflictingFlagged || [])
      .filter(f => approvedLinks.has(f.link) || junkLinks.has(f.link))
      .map(f => f.link);

    if (flaggedToRemove.length > 0) {
      const { error: conflictError } = await supabase
        .from('flagged_articles')
        .delete()
        .in('link', flaggedToRemove);

      if (!conflictError) {
        console.log(`Removed ${flaggedToRemove.length} flagged articles that are approved/junked`);
      }
    }

    // Delete old predictions (except those in approved/junk)
    const { data: oldPredictions } = await supabase
      .from('article_predictions')
      .select('link, predicted_at')
      .lt('predicted_at', cutoffDate.toISOString());

    const predictionsToDelete = (oldPredictions || [])
      .filter(p => !keepLinks.has(p.link))
      .map(p => p.link);

    if (predictionsToDelete.length > 0) {
      const { error: predError } = await supabase
        .from('article_predictions')
        .delete()
        .in('link', predictionsToDelete);

      if (predError) {
        console.error('Error deleting old predictions:', predError);
      } else {
        console.log(`Deleted ${predictionsToDelete.length} old predictions`);
      }
    }

    // Delete old flagged articles (except those in approved/junk)
    const { data: oldFlagged } = await supabase
      .from('flagged_articles')
      .select('link, flagged_at')
      .lt('flagged_at', cutoffDate.toISOString());

    const flaggedToDelete = (oldFlagged || [])
      .filter(f => !keepLinks.has(f.link))
      .map(f => f.link);

    if (flaggedToDelete.length > 0) {
      const { error: flagError } = await supabase
        .from('flagged_articles')
        .delete()
        .in('link', flaggedToDelete);

      if (flagError) {
        console.error('Error deleting old flagged articles:', flagError);
      } else {
        console.log(`Deleted ${flaggedToDelete.length} old flagged articles`);
      }
    }

    res.status(200).json({
      success: true,
      deleted: {
        predictions: predictionsToDelete.length,
        flagged: flaggedToDelete.length,
        conflicts: flaggedToRemove.length
      },
      kept: keepLinks.size
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
}
