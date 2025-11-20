import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link } = req.body;

    if (!link) {
      return res.status(400).json({ error: 'Missing article link' });
    }

    // Update the approved article to set published = true
    const { data, error } = await supabase
      .from('approved_articles')
      .update({ published: true })
      .eq('link', link)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to publish article', details: error.message });
    }

    return res.status(200).json({
      success: true,
      article: data,
      message: 'Article published successfully'
    });

  } catch (error) {
    console.error('Error publishing article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
