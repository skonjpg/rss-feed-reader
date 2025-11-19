import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Get approved articles to use as training examples
 */
export async function getApprovedExamples() {
  const { data: approved, error } = await supabase
    .from('approved_articles')
    .select('title, description, source_name')
    .order('approved_at', { ascending: false })
    .limit(20); // Use most recent 20 approved articles

  if (error) {
    console.error('Error fetching approved articles:', error);
    return [];
  }

  return approved || [];
}

/**
 * Use Claude to score an article based on approved examples
 * Returns confidence score (0-100) and reasoning
 */
export async function scoreArticleWithClaude(article, approvedExamples = null) {
  // Get approved examples if not provided
  if (!approvedExamples) {
    approvedExamples = await getApprovedExamples();
  }

  // If no approved articles yet, return neutral score
  if (approvedExamples.length === 0) {
    return {
      confidence: 50,
      reasoning: 'No approved articles yet - insufficient training data',
      shouldAutoFlag: false
    };
  }

  // Build prompt with approved examples
  const examplesText = approvedExamples
    .map((ex, i) => `${i + 1}. Title: ${ex.title}\n   Source: ${ex.source_name}\n   Description: ${ex.description || 'N/A'}`)
    .join('\n\n');

  const prompt = `You are an AI that predicts whether a user will approve an article based on their past preferences.

APPROVED ARTICLES (User's preferences):
${examplesText}

NEW ARTICLE TO EVALUATE:
Title: ${article.title}
Source: ${article.sourceName || article.source_name}
Description: ${article.description || 'N/A'}

Based on the approved articles above, analyze this new article and provide:
1. A confidence score (0-100) indicating how likely the user is to approve this article
2. Brief reasoning for your score (2-3 sentences max)

Consider:
- Topic similarity to approved articles
- Source preference patterns
- Content style and tone
- Relevance to apparent interests

Respond in this exact JSON format:
{
  "confidence": <number 0-100>,
  "reasoning": "<your reasoning>",
  "shouldAutoFlag": <true if confidence > 80, false otherwise>
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Parse Claude's response
    const responseText = message.content[0].text;

    // Extract JSON from response (handle cases where Claude adds explanation)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Claude response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate result
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 100) {
      throw new Error('Invalid confidence score from Claude');
    }

    return {
      confidence: Math.round(result.confidence),
      reasoning: result.reasoning || 'No reasoning provided',
      shouldAutoFlag: result.confidence > 80
    };

  } catch (error) {
    console.error('Claude scoring error:', error);
    return {
      confidence: 50,
      reasoning: `Error scoring article: ${error.message}`,
      shouldAutoFlag: false
    };
  }
}

/**
 * Score multiple articles in batch
 * Processes ALL articles in batches of 10 for efficiency
 */
export async function scoreBatchArticles(articles) {
  const approvedExamples = await getApprovedExamples();

  // If no approved articles, return neutral scores
  if (approvedExamples.length === 0) {
    return articles.map(article => ({
      ...article,
      confidence: 50,
      reasoning: 'No training data yet',
      shouldAutoFlag: false
    }));
  }

  // Build examples text once
  const examplesText = approvedExamples
    .map((ex, i) => `${i + 1}. Title: ${ex.title}\n   Source: ${ex.source_name}`)
    .join('\n');

  // Process articles in batches of 10
  const BATCH_SIZE = 10;
  const allScoredArticles = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    // Build articles to score for this batch
    const articlesText = batch
      .map((article, idx) => `Article ${idx + 1}:\nTitle: ${article.title}\nSource: ${article.sourceName || article.source_name}`)
      .join('\n\n');

    const prompt = `You are an AI that predicts whether a user will approve articles based on their past preferences.

APPROVED ARTICLES (User's preferences):
${examplesText}

NEW ARTICLES TO EVALUATE:
${articlesText}

For each article, provide a confidence score (0-100) indicating how likely the user is to approve it.

Respond in this exact JSON format (array):
[
  {"articleIndex": 1, "confidence": <number>, "reasoning": "<brief reason>"},
  {"articleIndex": 2, "confidence": <number>, "reasoning": "<brief reason>"},
  ...
]`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const responseText = message.content[0].text;
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        // Fallback: score individually for this batch
        const fallbackScores = await Promise.all(
          batch.map(article => scoreArticleWithClaude(article, approvedExamples)
            .then(score => ({ ...article, ...score }))
          )
        );
        allScoredArticles.push(...fallbackScores);
        continue;
      }

      const results = JSON.parse(jsonMatch[0]);

      // Map results back to articles for this batch
      const scoredBatch = batch.map((article, index) => {
        const result = results.find(r => r.articleIndex === index + 1);

        return {
          ...article,
          confidence: result ? Math.round(result.confidence) : 50,
          reasoning: result?.reasoning || 'No reasoning provided',
          shouldAutoFlag: (result?.confidence || 0) > 80
        };
      });

      allScoredArticles.push(...scoredBatch);

    } catch (error) {
      console.error(`Batch scoring error for batch starting at index ${i}:`, error);
      // Fallback: score individually for this batch
      const fallbackScores = await Promise.all(
        batch.map(article =>
          scoreArticleWithClaude(article, approvedExamples)
            .then(score => ({ ...article, ...score }))
            .catch(err => {
              console.error(`Error scoring article ${article.title}:`, err);
              return {
                ...article,
                confidence: 50,
                reasoning: 'Error scoring article',
                shouldAutoFlag: false
              };
            })
        )
      );
      allScoredArticles.push(...fallbackScores);
    }
  }

  return allScoredArticles;
}
