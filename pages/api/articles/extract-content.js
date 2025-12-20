import { extractArticleContent, formatForResearchNotes } from '../../../lib/content-extractor';

/**
 * API endpoint to extract article content from a URL
 * POST /api/articles/extract-content
 * Body: { url: string }
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[Extract API] Extracting content from: ${url}`);

    // Extract content
    const extracted = await extractArticleContent(url);

    if (!extracted.success) {
      return res.status(400).json({
        success: false,
        error: extracted.error,
        message: 'Failed to extract article content'
      });
    }

    // Format for research notes
    const researchNotes = formatForResearchNotes(extracted);

    return res.status(200).json({
      success: true,
      extracted: {
        title: extracted.title,
        byline: extracted.byline,
        excerpt: extracted.excerpt,
        length: extracted.length,
        siteName: extracted.siteName
      },
      researchNotes,
      message: 'Content extracted successfully'
    });

  } catch (error) {
    console.error('[Extract API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
