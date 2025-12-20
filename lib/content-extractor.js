/**
 * Content Extraction Service
 * Uses Mozilla Readability to extract clean article content from URLs
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Extract clean article content from a URL
 * @param {string} url - The article URL to extract content from
 * @returns {Promise<Object>} - Extracted content with title, byline, text, and excerpt
 */
export async function extractArticleContent(url) {
  try {
    console.log(`[Content Extractor] Fetching: ${url}`);

    // Fetch the HTML content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000 // 15 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse HTML with JSDOM
    const dom = new JSDOM(html, { url });

    // Use Readability to extract the main content
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Could not extract article content - page may not be an article');
    }

    console.log(`[Content Extractor] Successfully extracted: ${article.title}`);

    return {
      success: true,
      title: article.title,
      byline: article.byline || '',
      content: article.textContent, // Plain text content
      htmlContent: article.content, // HTML content
      excerpt: article.excerpt || '',
      length: article.length || 0,
      siteName: article.siteName || ''
    };

  } catch (error) {
    console.error(`[Content Extractor] Error extracting from ${url}:`, error.message);
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

/**
 * Format extracted content for research notes
 * @param {Object} extractedContent - The extracted content object
 * @returns {string} - Formatted markdown content for research notes
 */
export function formatForResearchNotes(extractedContent) {
  if (!extractedContent.success) {
    return `# Extraction Failed\n\nError: ${extractedContent.error}`;
  }

  const parts = [];

  // Add title
  if (extractedContent.title) {
    parts.push(`# ${extractedContent.title}\n`);
  }

  // Add byline/author
  if (extractedContent.byline) {
    parts.push(`**By:** ${extractedContent.byline}\n`);
  }

  // Add site name
  if (extractedContent.siteName) {
    parts.push(`**Source:** ${extractedContent.siteName}\n`);
  }

  // Add separator
  parts.push('---\n');

  // Add main content
  if (extractedContent.content) {
    parts.push(extractedContent.content);
  }

  return parts.join('\n');
}

/**
 * Extract content and format for research notes in one step
 * @param {string} url - The article URL
 * @returns {Promise<string>} - Formatted research notes content
 */
export async function extractAndFormat(url) {
  const extracted = await extractArticleContent(url);
  return formatForResearchNotes(extracted);
}
