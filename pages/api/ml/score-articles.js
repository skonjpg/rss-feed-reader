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

    // Frontend already filters, sorts, and limits to 40 articles
    // Just score what we receive
    console.log(`Scoring ${articles.length} articles with Neural Network...`);

    // Score articles using Neural Network
    const scoredArticles = await scoreBatchArticles(articles);

    // Auto-flag high confidence articles and auto-junk low confidence articles
    const autoFlagged = [];
    const autoJunked = [];
    const autoDeleted = [];

    for (const article of scoredArticles) {
      // Check if article should be auto-deleted (only junk keywords)
      if (article.shouldAutoDelete) {
        console.log(`[Auto-Delete] Article "${article.title}" - only junk keywords`);

        // Add to junk articles table
        await supabase
          .from('junk_articles')
          .upsert({
            article_id: article.id?.toString() || '',
            title: article.title,
            description: article.description || '',
            link: article.link,
            pub_date: article.pubDate,
            source: article.source || 'unknown',
            source_name: article.sourceName || 'Unknown'
          }, {
            onConflict: 'link',
            ignoreDuplicates: true
          });

        autoDeleted.push({
          title: article.title,
          keywords: article.reasoning
        });

        // Skip storing prediction for deleted articles
        continue;
      }

      // Store prediction in article_predictions table
      const { error: predError } = await supabase
        .from('article_predictions')
        .upsert({
          link: article.link,
          title: article.title,
          description: article.description,
          confidence_score: article.confidence,
          reasoning: article.reasoning,
          model_version: 'neural-network-v1'
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

      // Auto-junk if confidence <= 20%
      if (article.confidence <= 20) {
        const { error: junkError } = await supabase
          .from('junk_articles')
          .upsert({
            article_id: article.id?.toString() || '',
            title: article.title,
            description: article.description || '',
            link: article.link,
            pub_date: article.pubDate,
            source: article.source || 'unknown',
            source_name: article.sourceName || 'Unknown'
          }, {
            onConflict: 'link',
            ignoreDuplicates: true
          });

        if (!junkError) {
          autoJunked.push({
            title: article.title,
            confidence: article.confidence
          });
        }
      }
    }

    console.log(`Scored ${scoredArticles.length} articles, auto-flagged ${autoFlagged.length}, auto-junked ${autoJunked.length}, auto-deleted ${autoDeleted.length}`);

    return res.status(200).json({
      success: true,
      scored: scoredArticles.length,
      total: articles.length,
      autoFlagged: autoFlagged.length,
      autoJunked: autoJunked.length,
      autoDeleted: autoDeleted.length,
      autoFlaggedArticles: autoFlagged,
      autoJunkedArticles: autoJunked,
      autoDeletedArticles: autoDeleted,
      articles: scoredArticles.map(a => ({
        link: a.link,
        title: a.title,
        confidence: a.confidence,
        reasoning: a.reasoning,
        shouldAutoDelete: a.shouldAutoDelete || false
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
