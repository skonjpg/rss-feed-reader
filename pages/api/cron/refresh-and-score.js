import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { scoreBatchArticles } from '../../../lib/ml-service';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)',
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// RSS feed sources
const feeds = [
  {
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    source: 'bloomberg',
    sourceName: 'Bloomberg'
  },
  {
    url: 'https://www.digitimes.com/rss/totalrss.asp',
    source: 'digitimes',
    sourceName: 'DigiTimes'
  },
  {
    url: 'https://www.reuters.com/rssFeed/businessNews',
    source: 'reuters_business',
    sourceName: 'Reuters Business'
  }
];

async function fetchFeeds() {
  console.log('[Cron] Starting feed fetch...');
  const allArticles = [];
  const twelveHoursAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);

  for (const feedConfig of feeds) {
    try {
      console.log(`[Cron] Fetching ${feedConfig.sourceName}...`);
      const feed = await parser.parseURL(feedConfig.url);
      const articles = feed.items
        .filter(item => {
          const pubDate = new Date(item.pubDate || item.isoDate);
          return pubDate >= twelveHoursAgo;
        })
        .map(item => ({
          title: item.title,
          description: item.contentSnippet || item.content || '',
          link: item.link,
          pubDate: item.pubDate || item.isoDate,
          source: feedConfig.source,
          sourceName: feedConfig.sourceName
        }));

      allArticles.push(...articles);
      console.log(`[Cron] Fetched ${articles.length} articles from ${feedConfig.sourceName}`);
    } catch (error) {
      console.error(`[Cron] Error fetching ${feedConfig.sourceName}:`, error.message);
    }
  }

  return allArticles;
}

async function getUnscoredArticles(articles) {
  console.log('[Cron] Checking for unscored articles...');

  // Get existing predictions
  const { data: existingPredictions } = await supabase
    .from('article_predictions')
    .select('link');

  const existingLinks = new Set((existingPredictions || []).map(p => p.link));

  // Get approved, flagged, and junk articles
  const [approvedRes, flaggedRes, junkRes] = await Promise.all([
    supabase.from('approved_articles').select('link'),
    supabase.from('flagged_articles').select('link'),
    supabase.from('junked_articles').select('link')
  ]);

  const approvedLinks = new Set((approvedRes.data || []).map(a => a.link));
  const flaggedLinks = new Set((flaggedRes.data || []).map(f => f.link));
  const junkLinks = new Set((junkRes.data || []).map(j => j.link));

  // Filter to only unscored articles (no prediction and not in any list)
  const unscored = articles.filter(article =>
    !existingLinks.has(article.link) &&
    !approvedLinks.has(article.link) &&
    !flaggedLinks.has(article.link) &&
    !junkLinks.has(article.link)
  );

  console.log(`[Cron] Found ${unscored.length} unscored articles out of ${articles.length} total`);
  return unscored;
}

async function scoreArticles(articles) {
  if (articles.length === 0) {
    console.log('[Cron] No articles to score');
    return { scored: 0, autoFlagged: 0, autoJunked: 0 };
  }

  console.log(`[Cron] Starting to score ${articles.length} articles...`);

  try {
    const predictions = await scoreBatchArticles(articles);
    console.log(`[Cron] Received ${predictions.length} predictions`);

    let autoFlagged = 0;
    let autoJunked = 0;

    // Store predictions and auto-flag/junk
    for (let i = 0; i < predictions.length; i++) {
      const article = articles[i];
      const prediction = predictions[i];

      // Store prediction
      await supabase
        .from('article_predictions')
        .upsert({
          link: article.link,
          title: article.title,
          confidence: prediction.confidence,
          reasoning: prediction.reasoning,
          created_at: new Date().toISOString()
        }, { onConflict: 'link' });

      // Auto-flag high confidence articles (>80%)
      if (prediction.confidence > 80) {
        await supabase
          .from('flagged_articles')
          .upsert({
            ...article,
            created_at: new Date().toISOString()
          }, { onConflict: 'link' });
        autoFlagged++;
        console.log(`[Cron] Auto-flagged: ${article.title} (${prediction.confidence}%)`);
      }
      // Auto-junk low confidence articles (<=20%)
      else if (prediction.confidence <= 20) {
        await supabase
          .from('junked_articles')
          .upsert({
            ...article,
            created_at: new Date().toISOString()
          }, { onConflict: 'link' });
        autoJunked++;
        console.log(`[Cron] Auto-junked: ${article.title} (${prediction.confidence}%)`);
      }
    }

    return { scored: predictions.length, autoFlagged, autoJunked };
  } catch (error) {
    console.error('[Cron] Error scoring articles:', error);
    throw error;
  }
}

async function cleanupOldArticles() {
  console.log('[Cron] Cleaning up old articles...');
  const twelveHoursAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Get approved and junked article links (keep these forever)
    const [approvedRes, junkRes] = await Promise.all([
      supabase.from('approved_articles').select('link'),
      supabase.from('junked_articles').select('link')
    ]);

    const keepLinks = new Set([
      ...(approvedRes.data || []).map(a => a.link),
      ...(junkRes.data || []).map(j => j.link)
    ]);

    // Delete old predictions
    const { data: oldPredictions } = await supabase
      .from('article_predictions')
      .select('link, created_at')
      .lt('created_at', twelveHoursAgo);

    if (oldPredictions && oldPredictions.length > 0) {
      const linksToDelete = oldPredictions
        .filter(p => !keepLinks.has(p.link))
        .map(p => p.link);

      if (linksToDelete.length > 0) {
        await supabase
          .from('article_predictions')
          .delete()
          .in('link', linksToDelete);
        console.log(`[Cron] Deleted ${linksToDelete.length} old predictions`);
      }
    }

    // Delete old flagged articles (but not if they're also approved/junked)
    const { data: oldFlagged } = await supabase
      .from('flagged_articles')
      .select('link, created_at')
      .lt('created_at', twelveHoursAgo);

    if (oldFlagged && oldFlagged.length > 0) {
      const flaggedToDelete = oldFlagged
        .filter(f => !keepLinks.has(f.link))
        .map(f => f.link);

      if (flaggedToDelete.length > 0) {
        await supabase
          .from('flagged_articles')
          .delete()
          .in('link', flaggedToDelete);
        console.log(`[Cron] Deleted ${flaggedToDelete.length} old flagged articles`);
      }
    }

    console.log('[Cron] Cleanup complete');
  } catch (error) {
    console.error('[Cron] Error during cleanup:', error);
  }
}

export default async function handler(req, res) {
  // Verify this is a legitimate cron request
  const authHeader = req.headers.authorization;

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[Cron] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[Cron] ========== Starting automated feed refresh ==========');
  const startTime = Date.now();

  try {
    // Step 1: Fetch all feeds
    const articles = await fetchFeeds();

    // Step 2: Find unscored articles
    const unscoredArticles = await getUnscoredArticles(articles);

    // Step 3: Score articles (limit to 20 at a time to avoid timeouts)
    const articlesToScore = unscoredArticles.slice(0, 20);
    const scoringResults = await scoreArticles(articlesToScore);

    // Step 4: Cleanup old articles
    await cleanupOldArticles();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      stats: {
        totalArticles: articles.length,
        unscoredArticles: unscoredArticles.length,
        ...scoringResults
      }
    };

    console.log('[Cron] ========== Feed refresh complete ==========');
    console.log('[Cron] Results:', JSON.stringify(result, null, 2));

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
