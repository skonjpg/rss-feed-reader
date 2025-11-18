import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all approved articles, ordered by approval date (newest first)
    const { data, error } = await supabase
      .from('approved_articles')
      .select('*')
      .order('approved_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch approved articles', details: error.message });
    }

    // Transform the data to match the frontend format
    const articles = data.map(article => ({
      id: article.article_id,
      title: article.title,
      description: article.description,
      link: article.link,
      pubDate: article.pub_date,
      source: article.source,
      sourceName: article.source_name,
      approved: true,
      approvedAt: article.approved_at,
      dbId: article.id // Keep the database ID for reference
    }));

    return res.status(200).json({
      success: true,
      articles,
      count: articles.length
    });

  } catch (error) {
    console.error('Error fetching approved articles:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
