import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase';
import { scoreBatchWithNeuralNet } from './neural-network-scorer';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Get approved articles to use as positive training examples
 */
export async function getApprovedExamples() {
  const { data: approved, error } = await supabase
    .from('approved_articles')
    .select('title, description, source_name, research_notes')
    .order('approved_at', { ascending: false })
    .limit(50); // Use most recent 50 approved articles

  if (error) {
    console.error('[ML Service] Error fetching approved articles:', error);
    return [];
  }

  console.log(`[ML Service] ✅ Fetched ${approved?.length || 0} approved articles for training`);
  return approved || [];
}

/**
 * Get junk articles to use as negative training examples
 */
export async function getJunkExamples() {
  const { data: junk, error } = await supabase
    .from('junk_articles')
    .select('title, description, source_name')
    .order('junked_at', { ascending: false })
    .limit(200); // Use most recent 200 junk articles - more negative examples help ML learn what to avoid

  if (error) {
    console.error('[ML Service] Error fetching junk articles:', error);
    return [];
  }

  console.log(`[ML Service] ✅ Fetched ${junk?.length || 0} junk articles for training`);
  return junk || [];
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
 * Score multiple articles in batch using Neural Network
 * PRIMARY SCORER - Uses custom neural network with backpropagation
 * Fast, free, and works offline. No API calls needed.
 * Uses both approved (positive) and junk (negative) examples for better accuracy
 */
export async function scoreBatchArticles(articles) {
  const approvedExamples = await getApprovedExamples();
  const junkExamples = await getJunkExamples();

  // If no training data, return neutral scores
  if (approvedExamples.length === 0 && junkExamples.length === 0) {
    return articles.map(article => ({
      ...article,
      confidence: 50,
      reasoning: 'No training data yet - approve or junk some articles to train the neural network',
      shouldAutoFlag: false,
      isNeuralNet: true
    }));
  }

  console.log('[ML Service] Using Neural Network as primary scorer');
  console.log(`[ML Service] Training data: ${approvedExamples.length} approved, ${junkExamples.length} junk`);

  // Get list of junk article links to avoid auto-flagging them
  const { data: allJunk } = await supabase
    .from('junk_articles')
    .select('link');
  const junkLinks = new Set((allJunk || []).map(j => j.link));

  // Use Neural Network directly - fast, free, no API calls
  console.log(`[ML Service] Scoring ${articles.length} articles with Neural Network...`);
  const neuralNetScores = await scoreBatchWithNeuralNet(articles, approvedExamples, junkExamples);

  const scoredArticles = articles.map((article, index) => {
    const score = neuralNetScores[index];
    const isJunk = junkLinks.has(article.link);

    return {
      ...article,
      confidence: score.confidence,
      reasoning: score.reasoning,
      shouldAutoFlag: !isJunk && score.confidence > 80,
      shouldAutoDelete: score.shouldAutoDelete || false,
      isNeuralNet: true
    };
  });

  console.log(`[ML Service] ✅ Neural Network scored ${scoredArticles.length} articles`);
  return scoredArticles;
}
