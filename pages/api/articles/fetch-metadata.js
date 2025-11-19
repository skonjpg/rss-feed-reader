import { parse } from 'node-html-parser';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: ${response.statusText}` });
    }

    const html = await response.text();
    const root = parse(html);

    // Extract metadata using various methods
    const getMetaContent = (property) => {
      // Try Open Graph tags
      let meta = root.querySelector(`meta[property="${property}"]`);
      if (meta) return meta.getAttribute('content');

      // Try Twitter Card tags
      meta = root.querySelector(`meta[name="${property.replace('og:', 'twitter:')}"]`);
      if (meta) return meta.getAttribute('content');

      // Try standard meta tags
      meta = root.querySelector(`meta[name="${property.replace('og:', '')}"]`);
      if (meta) return meta.getAttribute('content');

      return null;
    };

    // Extract title
    let title = getMetaContent('og:title') ||
                getMetaContent('twitter:title') ||
                root.querySelector('title')?.text ||
                'No title available';

    // Extract description
    let description = getMetaContent('og:description') ||
                      getMetaContent('description') ||
                      getMetaContent('twitter:description') ||
                      '';

    // Extract publish date
    let pubDate = getMetaContent('article:published_time') ||
                  getMetaContent('og:published_time') ||
                  getMetaContent('published_time') ||
                  new Date().toISOString();

    // Extract source from domain
    const sourceName = validUrl.hostname.replace('www.', '').split('.')[0];
    const sourceNameFormatted = sourceName.charAt(0).toUpperCase() + sourceName.slice(1);

    // Clean up the data
    title = title.trim();
    description = description.trim();

    return res.status(200).json({
      success: true,
      article: {
        title,
        description,
        link: url,
        pubDate,
        source: sourceName.toLowerCase(),
        sourceName: sourceNameFormatted
      }
    });

  } catch (error) {
    console.error('Error fetching article metadata:', error);
    return res.status(500).json({
      error: 'Failed to fetch article metadata',
      details: error.message
    });
  }
}
