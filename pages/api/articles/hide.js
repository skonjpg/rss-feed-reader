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

    // Update the flagged article to set hidden = true
    const { data, error } = await supabase
      .from('flagged_articles')
      .update({ hidden: true })
      .eq('link', link)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to hide article', details: error.message });
    }

    return res.status(200).json({
      success: true,
      article: data,
      message: 'Article hidden successfully'
    });

  } catch (error) {
    console.error('Error hiding article:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
