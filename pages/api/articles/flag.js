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

    // Insert the flagged article into Supabase
    const { data, error } = await supabase
      .from('flagged_articles')
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
          error: 'Article already flagged',
          message: 'This article has already been flagged for approval'
        });
      }

      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to flag article', details: error.message });
    }

    return res.status(200).json({
      success: true,
      article: data,
      message: 'Article flagged for approval successfully'
    });

  } catch (error) {
    console.error('Error flagging article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
