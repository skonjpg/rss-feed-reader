import { getApprovedExamples, getJunkExamples } from '../../../lib/ml-service';
import { scoreBatchWithNeuralNet } from '../../../lib/neural-network-scorer';

/**
 * Test endpoint to verify neural network is working
 * GET /api/ml/test
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Test API] Testing neural network...');

    // Fetch training data
    const approvedExamples = await getApprovedExamples();
    const junkExamples = await getJunkExamples();

    console.log(`[Test API] Fetched ${approvedExamples.length} approved, ${junkExamples.length} junk`);

    // Check if we have enough data
    if (approvedExamples.length < 2 || junkExamples.length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Insufficient training data',
        approved: approvedExamples.length,
        junk: junkExamples.length,
        required: { approved: 2, junk: 2 }
      });
    }

    // Create a test article (use first approved article as template)
    const testArticle = {
      title: 'Test Article for Neural Network',
      description: 'This is a test to verify the neural network is working correctly',
      sourceName: 'Test Source'
    };

    // Score the test article
    const result = scoreBatchWithNeuralNet([testArticle], approvedExamples, junkExamples);

    return res.status(200).json({
      success: true,
      message: 'Neural network is working!',
      trainingData: {
        approved: approvedExamples.length,
        junk: junkExamples.length
      },
      testResult: result[0],
      sampleApproved: approvedExamples.slice(0, 3).map(a => a.title),
      sampleJunk: junkExamples.slice(0, 3).map(j => j.title)
    });

  } catch (error) {
    console.error('[Test API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
