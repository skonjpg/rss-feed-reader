import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { error } = await supabase
      .from('summaries')
      .delete()
      .neq('id', 0); // Delete all rows (neq with impossible condition)

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to clear summaries', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'All summaries cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing summaries:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
