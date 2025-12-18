/**
 * Fallback article scorer that uses keyword analysis from training data
 * This is used when Claude API is unavailable
 */

/**
 * Extract important words from text (removing common stopwords)
 */
function extractKeywords(text) {
  if (!text) return [];

  const stopwords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'is', 'are', 'was', 'were', 'been', 'has', 'had', 'can', 'said'
  ]);

  // Convert to lowercase, remove punctuation, split into words
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopwords.has(word));

  return words;
}

/**
 * Calculate word frequency from a list of articles
 */
function calculateWordFrequency(articles) {
  const frequency = {};
  let totalWords = 0;

  articles.forEach(article => {
    const text = `${article.title} ${article.description || ''}`;
    const words = extractKeywords(text);

    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
      totalWords++;
    });
  });

  // Convert to normalized scores (0-1)
  const normalized = {};
  for (const word in frequency) {
    normalized[word] = frequency[word] / totalWords;
  }

  return normalized;
}

/**
 * Score an article based on keyword matching with training data
 */
export function scoreArticleWithKeywords(article, approvedArticles, junkArticles) {
  try {
    // Get word frequencies from training data
    const approvedFreq = calculateWordFrequency(approvedArticles);
    const junkFreq = calculateWordFrequency(junkArticles);

    // Extract keywords from the article to score
    const articleText = `${article.title} ${article.description || ''}`;
    const articleWords = extractKeywords(articleText);

    if (articleWords.length === 0) {
      return {
        confidence: 50,
        reasoning: '[Fallback] No keywords extracted - neutral score',
        isFallback: true
      };
    }

    // Calculate scores
    let approvedScore = 0;
    let junkScore = 0;
    let matchedApprovedWords = [];
    let matchedJunkWords = [];

    articleWords.forEach(word => {
      const approvedWeight = approvedFreq[word] || 0;
      const junkWeight = junkFreq[word] || 0;

      approvedScore += approvedWeight;
      junkScore += junkWeight;

      if (approvedWeight > 0) matchedApprovedWords.push(word);
      if (junkWeight > 0) matchedJunkWords.push(word);
    });

    // Check if article ONLY has junk keywords (no approved keywords)
    const onlyJunkKeywords = matchedJunkWords.length > 0 && matchedApprovedWords.length === 0;

    // Normalize scores (0-100)
    const totalScore = approvedScore + junkScore;
    let confidence;

    if (totalScore === 0) {
      // No matches in training data - neutral score
      confidence = 50;
    } else {
      // Calculate confidence based on ratio
      confidence = Math.round((approvedScore / totalScore) * 100);
    }

    // Generate reasoning
    let reasoning = '[Fallback Scorer] ';

    if (onlyJunkKeywords) {
      // Article only matches junk keywords - auto-junk and delete
      reasoning += `🗑️ AUTO-DELETED: Only junk keywords (${matchedJunkWords.length}): ${matchedJunkWords.slice(0, 5).join(', ')}`;
      confidence = 0; // Force confidence to 0 for auto-deletion
    } else if (confidence > 70) {
      reasoning += `Article matches ${matchedApprovedWords.length} keywords from approved articles`;
      if (matchedApprovedWords.length > 0) {
        reasoning += `: ${matchedApprovedWords.slice(0, 5).join(', ')}`;
      }
    } else if (confidence < 30) {
      reasoning += `Article matches ${matchedJunkWords.length} keywords from junk articles`;
      if (matchedJunkWords.length > 0) {
        reasoning += `: ${matchedJunkWords.slice(0, 5).join(', ')}`;
      }
    } else {
      reasoning += `Mixed signals - ${matchedApprovedWords.length} approved keywords, ${matchedJunkWords.length} junk keywords`;
    }

    return {
      confidence,
      reasoning,
      isFallback: true,
      shouldAutoDelete: onlyJunkKeywords
    };

  } catch (error) {
    console.error('[Fallback Scorer] Error:', error);
    return {
      confidence: 50,
      reasoning: '[Fallback] Scoring error - neutral score',
      isFallback: true
    };
  }
}

/**
 * Score multiple articles in batch
 */
export function scoreBatchWithKeywords(articles, approvedArticles, junkArticles) {
  return articles.map(article => scoreArticleWithKeywords(article, approvedArticles, junkArticles));
}
