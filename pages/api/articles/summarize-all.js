import { supabase } from '../../../lib/supabase';

/**
 * API endpoint to send all approved articles with research notes to n8n for summarization
 * POST /api/articles/summarize-all
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Summarize All] Fetching approved articles with research notes...');

    // Fetch all approved articles that have research notes
    const { data: articles, error } = await supabase
      .from('approved_articles')
      .select('id, title, description, link, source_name, research_notes, approved_at')
      .not('research_notes', 'is', null)
      .order('approved_at', { ascending: false });

    if (error) {
      console.error('[Summarize All] Error fetching articles:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch articles',
        details: error.message
      });
    }

    if (!articles || articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No articles with research notes found',
        message: 'Please add research notes to approved articles before summarizing'
      });
    }

    console.log(`[Summarize All] Found ${articles.length} articles with research notes`);

    // Get n8n webhook URL from environment variable
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

    if (!n8nWebhookUrl) {
      console.error('[Summarize All] N8N_WEBHOOK_URL not configured');
      return res.status(500).json({
        success: false,
        error: 'N8N webhook URL not configured',
        message: 'Please set N8N_WEBHOOK_URL in environment variables'
      });
    }

    // Prepare articles for n8n
    const articlesPayload = articles.map(article => ({
      id: article.id,
      title: article.title,
      description: article.description,
      link: article.link,
      source: article.source_name,
      researchNotes: article.research_notes,
      approvedAt: article.approved_at
    }));

    console.log(`[Summarize All] Sending ${articlesPayload.length} articles to n8n...`);

    // Send to n8n webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        articles: articlesPayload,
        totalCount: articlesPayload.length,
        timestamp: new Date().toISOString()
      })
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('[Summarize All] n8n webhook error:', errorText);
      return res.status(500).json({
        success: false,
        error: 'n8n webhook failed',
        details: errorText
      });
    }

    const n8nResult = await n8nResponse.json();
    console.log('[Summarize All] ✅ Successfully received summary from n8n');

    return res.status(200).json({
      success: true,
      summary: n8nResult.summary || n8nResult,
      articleCount: articlesPayload.length,
      message: 'Articles summarized successfully'
    });

  } catch (error) {
    console.error('[Summarize All] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
