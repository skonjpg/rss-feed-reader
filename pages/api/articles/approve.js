import { supabase } from '../../../lib/supabase';
import { incrementalTraining } from '../../../lib/neural-network-scorer';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { article } = req.body;

    // Validate required fields
    if (!article || !article.title || !article.link) {
      return res.status(400).json({ error: 'Missing required article fields' });
    }

    // Insert the approved article into Supabase
    const { data, error } = await supabase
      .from('approved_articles')
      .insert([
        {
          article_id: article.id?.toString() || '',
          title: article.title,
          description: article.description || '',
          link: article.link,
          pub_date: article.pubDate ? new Date(article.pubDate).toISOString() : new Date().toISOString(),
          source: article.source || 'unknown',
          source_name: article.sourceName || 'Unknown Source'
        }
      ])
      .select()
      .single();

    if (error) {
      // If duplicate (UNIQUE constraint violation on link)
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Article already approved',
          message: 'This article has already been approved'
        });
      }

      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to approve article', details: error.message });
    }

    // Delete the confidence score from predictions table since article is now training data
    const { error: deleteError } = await supabase
      .from('article_predictions')
      .delete()
      .eq('link', article.link);

    if (deleteError) {
      console.error('Error deleting prediction:', deleteError);
      // Don't fail the request if prediction deletion fails - article is already approved
    }

    // Trigger incremental training with the new approved article
    // This runs in the background and doesn't block the response
    incrementalTraining([data], [], 20).catch(err => {
      console.error('Error during incremental training:', err);
    });

    return res.status(200).json({
      success: true,
      article: data,
      message: 'Article approved successfully - neural network is learning from this'
    });

  } catch (error) {
    console.error('Error approving article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
