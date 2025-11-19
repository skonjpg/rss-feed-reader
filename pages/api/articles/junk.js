import { supabase } from '../../../lib/supabase';

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

    // Insert the junk article into Supabase
    const { data, error } = await supabase
      .from('junk_articles')
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
          error: 'Article already marked as junk',
          message: 'This article has already been marked as junk'
        });
      }

      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to mark article as junk', details: error.message });
    }

    return res.status(200).json({
      success: true,
      article: data,
      message: 'Article marked as junk successfully'
    });

  } catch (error) {
    console.error('Error marking article as junk:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
