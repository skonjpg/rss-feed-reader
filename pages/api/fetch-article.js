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
        // Use super mode only for Reuters/Bloomberg (high anti-bot protection)
        // Use regular mode for other sites to save credits
        const needsSuperMode = url.includes('reuters.com') || url.includes('bloomberg.com');
        const mode = needsSuperMode ? 'super=true' : 'render=true';

        console.log(`[Fetch Article] Using ScrapeDo ${needsSuperMode ? 'SUPER' : 'regular'} mode for ${url}`);

        const scrapeDoUrl = `http://api.scrape.do/?token=${process.env.SCRAPE_DO_API_KEY}&url=${encodeURIComponent(url)}&${mode}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), needsSuperMode ? 60000 : 30000);

        const response = await fetch(scrapeDoUrl, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          html = await response.text();
          usedScrapeDo = true;
          console.log(`[Fetch Article] ✅ ScrapeDo ${needsSuperMode ? 'SUPER' : 'regular'} mode success (${html.length} bytes)`);
        } else {
          const errorText = await response.text();
          console.log(`[Fetch Article] ❌ ScrapeDo failed (${response.status}): ${errorText.substring(0, 200)}`);
        }
      } catch (scrapeDoError) {
        console.log('[Fetch Article] ScrapeDo error, falling back to direct fetch:', scrapeDoError.message);
      }
    } else {
      console.log('[Fetch Article] SCRAPE_DO_API_KEY not configured, skipping ScrapeDo');
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

    // Try to extract the main content using comprehensive selectors (bookmarklet-style)
    let content = '';
    let container = null;

    // Try multiple container selectors in order of preference
    const containerSelectors = [
      'article',
      '[role="article"]',
      'main',
      '[class*="article-body"]',
      '[class*="story-body"]',
      '[class*="post-content"]',
      '.content'
    ];

    for (const selector of containerSelectors) {
      container = root.querySelector(selector);
      if (container && container.textContent.length > 500) {
        console.log(`[Fetch Article] Using container: ${selector}`);
        break;
      }
    }

    if (!container) {
      container = root;
    }

    // Extract all text elements (paragraphs, headings, lists, quotes)
    const textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

    if (textElements.length > 0) {
      const extracted = Array.from(textElements).map(el => {
        const text = el.textContent.trim();
        if (text.length < 30) return '';

        // Format headings
        if (el.tagName.match(/^H[1-6]$/)) {
          return `\n## ${text}\n`;
        }

        // Format blockquotes
        if (el.tagName === 'BLOCKQUOTE') {
          return `> ${text}`;
        }

        return text;
      }).filter(t => t.length > 0);

      // Deduplicate repeated content (navigation, ads)
      const uniqueLines = new Set();
      content = extracted.filter(line => {
        if (uniqueLines.has(line)) return false;
        uniqueLines.add(line);
        return true;
      }).join('\n\n');
    }

    // If we got good content, skip the old selectors
    if (content && content.length > 500) {
      console.log(`[Fetch Article] Extracted ${content.length} characters using comprehensive extraction`);
    }

    // Try Reuters-specific selectors
    if (!content || content.length < 200) {
      const reutersSelectors = [
        '[data-testid="paragraph"]',
        '.article-body__content__17Yit',
        '.StandardArticleBody_body',
        '[class*="ArticleBody"]',
        '[class*="article-body"]'
      ];

      for (const selector of reutersSelectors) {
        const elements = root.querySelectorAll(selector);
        if (elements.length > 0) {
          content = Array.from(elements).map(el => el.textContent.trim()).filter(t => t.length > 0).join('\n\n');
          console.log(`[Fetch Article] Found content using Reuters selector: ${selector}`);
          break;
        }
      }
    }

    // Try Bloomberg-specific selectors
    if (!content || content.length < 200) {
      const bloombergSelectors = [
        '[class*="body-content"]',
        '[class*="article-body"]',
        '.body-copy',
        '[data-component="article-body"]'
      ];

      for (const selector of bloombergSelectors) {
        const elements = root.querySelectorAll(selector);
        if (elements.length > 0) {
          content = Array.from(elements).map(el => el.textContent.trim()).filter(t => t.length > 0).join('\n\n');
          console.log(`[Fetch Article] Found content using Bloomberg selector: ${selector}`);
          break;
        }
      }
    }

    // Try common content selectors
    if (!content || content.length < 200) {
      const selectors = [
        '.article-content',
        '.story-body',
        '.article-body',
        '.post-content',
        '.entry-content',
        'main article',
        'main'
      ];

      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (element) {
          const paragraphs = element.querySelectorAll('p');
          if (paragraphs.length > 0) {
            content = Array.from(paragraphs).map(p => p.textContent.trim()).filter(t => t.length > 0).join('\n\n');
            console.log(`[Fetch Article] Found content using selector: ${selector}`);
            break;
          }
        }
      }
    }

    // If still no content, try to get all paragraphs
    if (!content || content.length < 200) {
      const paragraphs = root.querySelectorAll('p');
      if (paragraphs.length > 0) {
        content = Array.from(paragraphs)
          .map(p => p.textContent.trim())
          .filter(t => t.length > 50) // Filter out very short paragraphs (likely navigation/ads)
          .join('\n\n');
        console.log(`[Fetch Article] Found ${paragraphs.length} paragraphs as fallback`);
      }
    }

    // Clean up the content while preserving paragraph structure
    content = content
      .split('\n\n') // Split into paragraphs
      .map(para => para.replace(/\s+/g, ' ').trim()) // Clean each paragraph
      .filter(para => para.length > 0) // Remove empty paragraphs
      .join('\n\n') // Rejoin with double newlines
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
      console.log(`[Fetch Article] Failed to extract content. HTML length: ${html?.length || 0}`);
      console.log(`[Fetch Article] HTML preview: ${html?.substring(0, 500)}`);
      throw new Error('Could not extract article content');
    }

    console.log(`[Fetch Article] Successfully extracted ${content.length} characters ${usedScrapeDo ? 'via ScrapeDo super mode' : 'via direct fetch'}`);

    return res.status(200).json({
      success: true,
      title,
      content: content.substring(0, 50000), // Limit to 50k characters for full articles
      url,
      method: usedScrapeDo ? 'scrapedo' : 'direct',
      fullLength: content.length
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
