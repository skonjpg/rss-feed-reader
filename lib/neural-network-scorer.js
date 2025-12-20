/**
 * Neural Network Article Scorer with Backpropagation
 * Implements a feedforward neural network from scratch for article classification
 * NOW WITH PERSISTENCE: Saves and loads model state for continued training
 */

import { supabase } from './supabase';

/**
 * Sigmoid activation function
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Sigmoid derivative for backpropagation
 */
function sigmoidDerivative(x) {
  return x * (1 - x);
}

/**
 * Extract stopwords set
 */
const STOPWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'is', 'are', 'was', 'were', 'been', 'has', 'had', 'can', 'said'
]);

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !STOPWORDS.has(word));
}

/**
 * Build vocabulary from training articles
 */
function buildVocabulary(articles, maxFeatures = 100) {
  const wordFreq = {};

  articles.forEach(article => {
    // Include research notes for richer vocabulary if available
    const text = `${article.title} ${article.description || ''} ${article.research_notes || ''}`;
    const words = extractKeywords(text);

    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
  });

  // Sort by frequency and take top N words
  const sortedWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFeatures)
    .map(([word]) => word);

  return sortedWords;
}

/**
 * Convert article text to feature vector (TF-IDF style)
 */
function articleToFeatureVector(article, vocabulary) {
  // Include research notes for richer features if available
  const text = `${article.title} ${article.description || ''} ${article.research_notes || ''}`;
  const words = extractKeywords(text);
  const wordCount = {};

  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Create feature vector based on vocabulary
  const features = vocabulary.map(word => {
    const tf = wordCount[word] || 0;
    return tf > 0 ? 1 : 0; // Binary presence
  });

  return features;
}

/**
 * Neural Network Class
 */
class NeuralNetwork {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    // Initialize weights with random values (-1 to 1)
    this.weightsInputHidden = this.randomMatrix(inputSize, hiddenSize);
    this.weightsHiddenOutput = this.randomMatrix(hiddenSize, outputSize);

    // Biases
    this.biasHidden = new Array(hiddenSize).fill(0).map(() => Math.random() * 2 - 1);
    this.biasOutput = new Array(outputSize).fill(0).map(() => Math.random() * 2 - 1);

    // Learning rate
    this.learningRate = 0.1;
  }

  randomMatrix(rows, cols) {
    const matrix = [];
    for (let i = 0; i < rows; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols; j++) {
        matrix[i][j] = Math.random() * 2 - 1; // Random between -1 and 1
      }
    }
    return matrix;
  }

  /**
   * Forward propagation
   */
  forward(inputs) {
    // Input to hidden layer
    const hidden = new Array(this.hiddenSize).fill(0);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.biasHidden[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += inputs[i] * this.weightsInputHidden[i][j];
      }
      hidden[j] = sigmoid(sum);
    }

    // Hidden to output layer
    const output = new Array(this.outputSize).fill(0);
    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.biasOutput[j];
      for (let i = 0; i < this.hiddenSize; i++) {
        sum += hidden[i] * this.weightsHiddenOutput[i][j];
      }
      output[j] = sigmoid(sum);
    }

    return { hidden, output };
  }

  /**
   * Backpropagation training
   */
  train(inputs, targetOutput) {
    // Forward pass
    const { hidden, output } = this.forward(inputs);

    // Calculate output layer error
    const outputError = new Array(this.outputSize);
    const outputDelta = new Array(this.outputSize);
    for (let i = 0; i < this.outputSize; i++) {
      outputError[i] = targetOutput[i] - output[i];
      outputDelta[i] = outputError[i] * sigmoidDerivative(output[i]);
    }

    // Calculate hidden layer error
    const hiddenError = new Array(this.hiddenSize).fill(0);
    const hiddenDelta = new Array(this.hiddenSize);
    for (let i = 0; i < this.hiddenSize; i++) {
      let error = 0;
      for (let j = 0; j < this.outputSize; j++) {
        error += outputDelta[j] * this.weightsHiddenOutput[i][j];
      }
      hiddenError[i] = error;
      hiddenDelta[i] = error * sigmoidDerivative(hidden[i]);
    }

    // Update weights: hidden to output
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.outputSize; j++) {
        this.weightsHiddenOutput[i][j] += this.learningRate * outputDelta[j] * hidden[i];
      }
    }

    // Update weights: input to hidden
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.weightsInputHidden[i][j] += this.learningRate * hiddenDelta[j] * inputs[i];
      }
    }

    // Update biases
    for (let i = 0; i < this.outputSize; i++) {
      this.biasOutput[i] += this.learningRate * outputDelta[i];
    }
    for (let i = 0; i < this.hiddenSize; i++) {
      this.biasHidden[i] += this.learningRate * hiddenDelta[i];
    }
  }

  /**
   * Predict output for given inputs
   */
  predict(inputs) {
    const { output } = this.forward(inputs);
    return output[0]; // Binary classification, return single output
  }

  /**
   * Export model state for persistence
   */
  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      weightsInputHidden: this.weightsInputHidden,
      weightsHiddenOutput: this.weightsHiddenOutput,
      biasHidden: this.biasHidden,
      biasOutput: this.biasOutput,
      learningRate: this.learningRate
    };
  }

  /**
   * Load model state from saved data
   */
  static fromJSON(data) {
    const nn = new NeuralNetwork(data.inputSize, data.hiddenSize, data.outputSize);
    nn.weightsInputHidden = data.weightsInputHidden;
    nn.weightsHiddenOutput = data.weightsHiddenOutput;
    nn.biasHidden = data.biasHidden;
    nn.biasOutput = data.biasOutput;
    nn.learningRate = data.learningRate || 0.1;
    return nn;
  }
}

/**
 * Save model to database for persistence
 */
async function saveModelToDatabase(nn, vocabulary, trainingCount = 0) {
  try {
    // First, deactivate all existing models
    await supabase
      .from('neural_network_models')
      .update({ is_active: false })
      .eq('is_active', true);

    // Save the new model
    const modelData = nn.toJSON();
    const { data, error } = await supabase
      .from('neural_network_models')
      .insert([{
        vocabulary: vocabulary,
        weights_input_hidden: modelData.weightsInputHidden,
        weights_hidden_output: modelData.weightsHiddenOutput,
        bias_hidden: modelData.biasHidden,
        bias_output: modelData.biasOutput,
        input_size: modelData.inputSize,
        hidden_size: modelData.hiddenSize,
        output_size: modelData.outputSize,
        learning_rate: modelData.learningRate,
        training_count: trainingCount,
        is_active: true
      }])
      .select()
      .single();

    if (error) {
      console.error('[Neural Network] Error saving model:', error);
      return false;
    }

    console.log('[Neural Network] Model saved successfully');
    return true;
  } catch (error) {
    console.error('[Neural Network] Error in saveModelToDatabase:', error);
    return false;
  }
}

/**
 * Load model from database
 */
async function loadModelFromDatabase() {
  try {
    const { data, error } = await supabase
      .from('neural_network_models')
      .select('*')
      .eq('is_active', true)
      .order('last_trained_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.log('[Neural Network] No saved model found, will train from scratch');
      return null;
    }

    // Reconstruct the neural network
    const nn = NeuralNetwork.fromJSON({
      inputSize: data.input_size,
      hiddenSize: data.hidden_size,
      outputSize: data.output_size,
      weightsInputHidden: data.weights_input_hidden,
      weightsHiddenOutput: data.weights_hidden_output,
      biasHidden: data.bias_hidden,
      biasOutput: data.bias_output,
      learningRate: data.learning_rate
    });

    console.log(`[Neural Network] Loaded model (${data.training_count} training iterations)`);
    return {
      nn,
      vocabulary: data.vocabulary,
      trainingCount: data.training_count
    };
  } catch (error) {
    console.error('[Neural Network] Error loading model:', error);
    return null;
  }
}

/**
 * Train neural network on article dataset
 */
function trainNeuralNetwork(approvedArticles, junkArticles, epochs = 100) {
  console.log('[Neural Network] Building vocabulary from training data...');

  // Build vocabulary from all articles
  const allArticles = [...approvedArticles, ...junkArticles];
  const vocabulary = buildVocabulary(allArticles, 100);

  console.log(`[Neural Network] Vocabulary size: ${vocabulary.length}`);

  // Create neural network: input size = vocabulary size, hidden layer = 20 neurons, output = 1
  const nn = new NeuralNetwork(vocabulary.length, 20, 1);

  // Prepare training data
  const trainingData = [];

  approvedArticles.forEach(article => {
    trainingData.push({
      input: articleToFeatureVector(article, vocabulary),
      output: [1] // Approved = 1
    });
  });

  junkArticles.forEach(article => {
    trainingData.push({
      input: articleToFeatureVector(article, vocabulary),
      output: [0] // Junk = 0
    });
  });

  console.log(`[Neural Network] Training on ${trainingData.length} examples for ${epochs} epochs...`);

  // Training loop with backpropagation
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle training data
    for (let i = trainingData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [trainingData[i], trainingData[j]] = [trainingData[j], trainingData[i]];
    }

    // Train on each example
    let totalError = 0;
    trainingData.forEach(({ input, output }) => {
      nn.train(input, output);

      // Calculate error for monitoring
      const prediction = nn.predict(input);
      totalError += Math.abs(output[0] - prediction);
    });

    const avgError = totalError / trainingData.length;

    // Log progress every 20 epochs
    if (epoch % 20 === 0) {
      console.log(`[Neural Network] Epoch ${epoch}/${epochs}, Avg Error: ${avgError.toFixed(4)}`);
    }
  }

  console.log('[Neural Network] Training complete!');

  return { nn, vocabulary };
}

/**
 * Incremental training - continue training existing model with new data
 * This is called when users approve or junk new articles
 */
export async function incrementalTraining(newApprovedArticles = [], newJunkArticles = [], epochs = 20) {
  try {
    console.log('[Neural Network] Starting incremental training...');
    console.log(`[Neural Network] New data: ${newApprovedArticles.length} approved, ${newJunkArticles.length} junk`);

    // Load existing model
    const savedModel = await loadModelFromDatabase();

    if (!savedModel) {
      console.log('[Neural Network] No existing model - performing full training');
      // Get all training data for full training
      return await fullModelRetrain();
    }

    const { nn, vocabulary, trainingCount } = savedModel;

    // Prepare new training data
    const trainingData = [];

    newApprovedArticles.forEach(article => {
      trainingData.push({
        input: articleToFeatureVector(article, vocabulary),
        output: [1] // Approved = 1
      });
    });

    newJunkArticles.forEach(article => {
      trainingData.push({
        input: articleToFeatureVector(article, vocabulary),
        output: [0] // Junk = 0
      });
    });

    if (trainingData.length === 0) {
      console.log('[Neural Network] No new training data');
      return false;
    }

    console.log(`[Neural Network] Incremental training on ${trainingData.length} new examples for ${epochs} epochs...`);

    // Continue training with new data
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle training data
      for (let i = trainingData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trainingData[i], trainingData[j]] = [trainingData[j], trainingData[i]];
      }

      // Train on each example
      trainingData.forEach(({ input, output }) => {
        nn.train(input, output);
      });
    }

    // Save updated model
    const newTrainingCount = trainingCount + (trainingData.length * epochs);
    await saveModelToDatabase(nn, vocabulary, newTrainingCount);

    console.log('[Neural Network] Incremental training complete!');
    return true;

  } catch (error) {
    console.error('[Neural Network] Error in incremental training:', error);
    return false;
  }
}

/**
 * Full model retrain - train from scratch on all data
 */
export async function fullModelRetrain() {
  try {
    console.log('[Neural Network] Starting full model retrain...');

    // Import here to avoid circular dependency
    const { getApprovedExamples, getJunkExamples } = await import('./ml-service');

    const approvedArticles = await getApprovedExamples();
    const junkArticles = await getJunkExamples();

    if (approvedArticles.length < 2 || junkArticles.length < 2) {
      console.log('[Neural Network] Insufficient training data');
      return false;
    }

    // Build vocabulary from all articles
    const allArticles = [...approvedArticles, ...junkArticles];
    const vocabulary = buildVocabulary(allArticles, 100);

    console.log(`[Neural Network] Vocabulary size: ${vocabulary.length}`);

    // Create new neural network
    const nn = new NeuralNetwork(vocabulary.length, 20, 1);

    // Prepare training data
    const trainingData = [];

    approvedArticles.forEach(article => {
      trainingData.push({
        input: articleToFeatureVector(article, vocabulary),
        output: [1]
      });
    });

    junkArticles.forEach(article => {
      trainingData.push({
        input: articleToFeatureVector(article, vocabulary),
        output: [0]
      });
    });

    console.log(`[Neural Network] Full training on ${trainingData.length} examples for 100 epochs...`);

    // Training loop
    const epochs = 100;
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle training data
      for (let i = trainingData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trainingData[i], trainingData[j]] = [trainingData[j], trainingData[i]];
      }

      // Train on each example
      trainingData.forEach(({ input, output }) => {
        nn.train(input, output);
      });

      if (epoch % 20 === 0) {
        console.log(`[Neural Network] Epoch ${epoch}/${epochs}`);
      }
    }

    // Save model
    const trainingCount = trainingData.length * epochs;
    await saveModelToDatabase(nn, vocabulary, trainingCount);

    console.log('[Neural Network] Full retrain complete!');
    return true;

  } catch (error) {
    console.error('[Neural Network] Error in full retrain:', error);
    return false;
  }
}

/**
 * Score article using trained neural network
 */
export function scoreArticleWithNeuralNet(article, approvedArticles, junkArticles) {
  try {
    // Need at least some training data
    if (approvedArticles.length < 2 || junkArticles.length < 2) {
      return {
        confidence: 50,
        reasoning: '[Neural Net] Insufficient training data - need at least 2 approved and 2 junk articles',
        isNeuralNet: true
      };
    }

    // Train neural network
    const { nn, vocabulary } = trainNeuralNetwork(approvedArticles, junkArticles, 100);

    // Convert article to feature vector
    const features = articleToFeatureVector(article, vocabulary);

    // Predict
    const prediction = nn.predict(features);

    // Convert to confidence score (0-100)
    const confidence = Math.round(prediction * 100);

    // Check for auto-delete (very low confidence)
    const shouldAutoDelete = confidence < 5;

    // Generate reasoning
    let reasoning = `[Neural Network] Confidence: ${confidence}% `;
    if (confidence > 80) {
      reasoning += '- Strong match with approved articles';
    } else if (confidence > 60) {
      reasoning += '- Likely relevant article';
    } else if (confidence > 40) {
      reasoning += '- Mixed signals, needs review';
    } else if (confidence > 20) {
      reasoning += '- Likely junk article';
    } else {
      reasoning += '- Strong match with junk articles';
    }

    if (shouldAutoDelete) {
      reasoning += ' 🗑️ AUTO-DELETED';
    }

    return {
      confidence: shouldAutoDelete ? 0 : confidence,
      reasoning,
      isNeuralNet: true,
      shouldAutoDelete
    };

  } catch (error) {
    console.error('[Neural Network] Error:', error);
    return {
      confidence: 50,
      reasoning: '[Neural Net] Scoring error - neutral score',
      isNeuralNet: true
    };
  }
}

/**
 * Score multiple articles in batch
 * NOW USES PERSISTED MODEL for faster scoring and continued learning
 */
export async function scoreBatchWithNeuralNet(articles, approvedArticles, junkArticles) {
  try {
    // Need sufficient training data
    if (approvedArticles.length < 2 || junkArticles.length < 2) {
      return articles.map(article => ({
        confidence: 50,
        reasoning: '[Neural Net] Insufficient training data',
        isNeuralNet: true
      }));
    }

    // Try to load saved model first
    let nn, vocabulary;
    const savedModel = await loadModelFromDatabase();

    if (savedModel) {
      console.log('[Neural Network] Using saved model for scoring');
      nn = savedModel.nn;
      vocabulary = savedModel.vocabulary;
    } else {
      console.log('[Neural Network] No saved model - training new model');
      // Train new model and save it
      const trained = trainNeuralNetwork(approvedArticles, junkArticles, 100);
      nn = trained.nn;
      vocabulary = trained.vocabulary;

      // Save the newly trained model
      const trainingData = approvedArticles.length + junkArticles.length;
      await saveModelToDatabase(nn, vocabulary, trainingData * 100);
    }

    // Score all articles
    return articles.map(article => {
      const features = articleToFeatureVector(article, vocabulary);
      const prediction = nn.predict(features);
      const confidence = Math.round(prediction * 100);
      const shouldAutoDelete = confidence < 5;

      let reasoning = `[Neural Network] Confidence: ${confidence}%`;
      if (shouldAutoDelete) reasoning += ' 🗑️ AUTO-DELETED';

      return {
        confidence: shouldAutoDelete ? 0 : confidence,
        reasoning,
        isNeuralNet: true,
        shouldAutoDelete
      };
    });

  } catch (error) {
    console.error('[Neural Network] Batch scoring error:', error);
    return articles.map(() => ({
      confidence: 50,
      reasoning: '[Neural Net] Scoring error',
      isNeuralNet: true
    }));
  }
}
