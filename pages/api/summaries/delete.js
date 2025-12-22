import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Summary ID is required' });
    }

    const { error } = await supabase
      .from('summaries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to delete summary', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Summary deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting summary:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
