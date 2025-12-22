/**
 * API endpoint to send research notes to n8n for AI summarization
 * POST /api/articles/summarize-notes
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notes, timestamp } = req.body;

    if (!notes || !notes.trim()) {
      return res.status(400).json({
        success: false,
        error: 'No notes provided',
        message: 'Please provide notes to summarize'
      });
    }

    console.log('[Summarize Notes] Sending notes to n8n...');
    console.log(`[Summarize Notes] Notes length: ${notes.length} characters`);

    // n8n webhook URL - can be overridden with N8N_WEBHOOK_URL environment variable
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL ||
      'https://edgewater.app.n8n.cloud/webhook/4e0da20e-9a6a-4b3d-9d27-d4a73ab54cda';

    // Send notes to n8n webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notes: notes,
        timestamp: timestamp || new Date().toISOString(),
        type: 'research_notes'
      })
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('[Summarize Notes] n8n webhook error:', errorText);
      return res.status(500).json({
        success: false,
        error: 'n8n webhook failed',
        details: errorText
      });
    }

    const n8nResult = await n8nResponse.json();
    console.log('[Summarize Notes] ✅ Successfully received summary from n8n');

    return res.status(200).json({
      success: true,
      summary: n8nResult.summary || n8nResult.message || n8nResult,
      message: 'Notes summarized successfully'
    });

  } catch (error) {
    console.error('[Summarize Notes] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
