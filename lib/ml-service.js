import { supabase } from './supabase';
import { scoreBatchWithNeuralNet } from './neural-network-scorer';

/**
 * Get approved articles to use as positive training examples
 */
export async function getApprovedExamples() {
  const { data: approved, error } = await supabase
    .from('approved_articles')
    .select('title, description, source_name')
    .order('approved_at', { ascending: false });
    // No limit - use all approved articles for maximum training data

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
    .limit(1000); // Use most recent 1000 junk articles - more negative examples help neural network learn what to avoid

  if (error) {
    console.error('[ML Service] Error fetching junk articles:', error);
    return [];
  }

  console.log(`[ML Service] ✅ Fetched ${junk?.length || 0} junk articles for training`);
  return junk || [];
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
