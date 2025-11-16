import Parser from 'rss-parser';

const parser = new Parser();

const FEEDS = {
  bloomberg: 'https://feeds.bloomberg.com/technology/news.rss',
  reuters: 'https://feeds.reuters.com/reuters/technologyNews',
  digitimes: 'https://www.digitimes.com/rss/asia.xml'
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const results = [];

    // Fetch Bloomberg feed
    try {
      const bloombergFeed = await parser.parseURL(FEEDS.bloomberg);
      bloombergFeed.items.forEach(item => {
        results.push({
          title: item.title || 'No title',
          description: item.contentSnippet || item.content || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          source: 'bloomberg',
          sourceName: 'Bloomberg Tech'
        });
      });
    } catch (error) {
      console.error('Error fetching Bloomberg feed:', error);
    }

    // Fetch Reuters feed
    try {
      const reutersFeed = await parser.parseURL(FEEDS.reuters);
      reutersFeed.items.forEach(item => {
        results.push({
          title: item.title || 'No title',
          description: item.contentSnippet || item.content || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          source: 'reuters',
          sourceName: 'Reuters Technology'
        });
      });
    } catch (error) {
      console.error('Error fetching Reuters feed:', error);
    }

    // Fetch DigiTimes Asia feed
    try {
      const digitimesFeed = await parser.parseURL(FEEDS.digitimes);
      digitimesFeed.items.forEach(item => {
        results.push({
          title: item.title || 'No title',
          description: item.contentSnippet || item.content || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          source: 'digitimes',
          sourceName: 'DigiTimes Asia'
        });
      });
    } catch (error) {
      console.error('Error fetching DigiTimes feed:', error);
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('Error in API route:', error);
    res.status(500).json({ error: 'Failed to fetch feeds' });
  }
}
