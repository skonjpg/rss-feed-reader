import { scoreBatchArticles } from '../../../lib/ml-service';
import { supabase } from '../../../lib/supabase';

// Increase timeout for this API route (in seconds)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
  maxDuration: 60, // 60 seconds for serverless function
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { articles } = req.body;

    if (!articles || !Array.isArray(articles)) {
      return res.status(400).json({ error: 'Articles array required' });
    }

    // Frontend already filters, sorts, and limits to 20 articles
    // Just score what we receive
    console.log(`Scoring ${articles.length} articles with Claude...`);

    // Score articles using Claude
    const scoredArticles = await scoreBatchArticles(articles);

    // Auto-flag articles with high confidence
    const autoFlagged = [];

    for (const article of scoredArticles) {
      // Store prediction in article_predictions table
      const { error: predError } = await supabase
        .from('article_predictions')
        .upsert({
          link: article.link,
          title: article.title,
          description: article.description,
          confidence_score: article.confidence,
          reasoning: article.reasoning,
          model_version: 'claude-3.5-sonnet'
        }, {
          onConflict: 'link'
        });

      if (predError) {
        console.error('Error storing prediction:', predError);
      }

      // Auto-flag if confidence > 80%
      if (article.shouldAutoFlag && article.confidence > 80) {
        const { error: flagError } = await supabase
          .from('flagged_articles')
          .upsert({
            article_id: article.id?.toString() || '',
            title: article.title,
            description: article.description || '',
            link: article.link,
            pub_date: article.pubDate,
            source: article.source || 'unknown',
            source_name: article.sourceName || 'Unknown',
            confidence_score: article.confidence,
            auto_flagged: true
          }, {
            onConflict: 'link',
            ignoreDuplicates: true
          });

        if (!flagError) {
          autoFlagged.push({
            title: article.title,
            confidence: article.confidence
          });
        }
      }
    }

    console.log(`Scored ${scoredArticles.length} articles, auto-flagged ${autoFlagged.length}`);

    return res.status(200).json({
      success: true,
      scored: scoredArticles.length,
      total: articles.length,
      autoFlagged: autoFlagged.length,
      autoFlaggedArticles: autoFlagged,
      articles: scoredArticles.map(a => ({
        link: a.link,
        title: a.title,
        confidence: a.confidence,
        reasoning: a.reasoning
      }))
    });

  } catch (error) {
    console.error('ML scoring error:', error);
    return res.status(500).json({
      error: 'Failed to score articles',
      details: error.message
    });
  }
}
