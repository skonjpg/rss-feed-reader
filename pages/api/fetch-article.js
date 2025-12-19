import { parse } from 'node-html-parser';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`[Fetch Article] Fetching content from: ${url}`);

    let html;
    let usedScrapeDo = false;

    // Try ScrapeDo first if API key is configured
    if (process.env.SCRAPE_DO_API_KEY) {
      try {
        console.log('[Fetch Article] Using ScrapeDo proxy service...');

        const scrapeDoUrl = `http://api.scrape.do/?token=${process.env.SCRAPE_DO_API_KEY}&url=${encodeURIComponent(url)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for ScrapeDo

        const response = await fetch(scrapeDoUrl, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          html = await response.text();
          usedScrapeDo = true;
          console.log('[Fetch Article] Successfully fetched via ScrapeDo');
        } else {
          console.log(`[Fetch Article] ScrapeDo failed with status ${response.status}, falling back to direct fetch`);
        }
      } catch (scrapeDoError) {
        console.log('[Fetch Article] ScrapeDo error, falling back to direct fetch:', scrapeDoError.message);
      }
    }

    // Fallback to direct fetch if ScrapeDo not configured or failed
    if (!html) {
      console.log('[Fetch Article] Using direct fetch...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      html = await response.text();
    }

    const root = parse(html);

    // Try to extract the main content using common article selectors
    let content = '';

    // Try article tag first
    const article = root.querySelector('article');
    if (article) {
      content = article.textContent;
    }

    // Try common content selectors
    if (!content) {
      const selectors = [
        '.article-content',
        '.story-body',
        '.article-body',
        '.post-content',
        '.entry-content',
        'main',
        '.content'
      ];

      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (element && element.textContent.length > 200) {
          content = element.textContent;
          break;
        }
      }
    }

    // If still no content, try to get all paragraphs
    if (!content) {
      const paragraphs = root.querySelectorAll('p');
      content = paragraphs.map(p => p.textContent).join('\n\n');
    }

    // Clean up the content
    content = content
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace multiple newlines with double newline
      .trim();

    // Get the title
    let title = '';
    const titleTag = root.querySelector('title');
    const h1Tag = root.querySelector('h1');

    if (h1Tag && h1Tag.textContent) {
      title = h1Tag.textContent.trim();
    } else if (titleTag && titleTag.textContent) {
      title = titleTag.textContent.trim();
    }

    if (!content || content.length < 100) {
      throw new Error('Could not extract article content');
    }

    console.log(`[Fetch Article] Successfully extracted ${content.length} characters ${usedScrapeDo ? 'via ScrapeDo' : 'via direct fetch'}`);

    return res.status(200).json({
      success: true,
      title,
      content: content.substring(0, 10000), // Limit to 10k characters
      url,
      method: usedScrapeDo ? 'scrapedo' : 'direct'
    });

  } catch (error) {
    console.error('[Fetch Article] Error:', error.message);

    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout' });
    }

    return res.status(500).json({
      error: error.message || 'Failed to fetch article content'
    });
  }
}
