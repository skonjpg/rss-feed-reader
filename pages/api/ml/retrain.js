import { fullModelRetrain } from '../../../lib/neural-network-scorer';

/**
 * API endpoint to manually retrain the neural network from scratch
 * This will rebuild the model using all approved and junk articles
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Retrain API] Manual retrain requested');

    // Perform full model retrain
    const success = await fullModelRetrain();

    if (success) {
      return res.status(200).json({
        success: true,
        message: 'Neural network retrained successfully with all training data'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Retraining failed - insufficient training data or error occurred'
      });
    }

  } catch (error) {
    console.error('[Retrain API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during retraining',
      details: error.message
    });
  }
}
