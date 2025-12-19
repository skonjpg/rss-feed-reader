/**
 * Neural Network Article Scorer with Backpropagation
 * Implements a feedforward neural network from scratch for article classification
 */

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
    const text = `${article.title} ${article.description || ''}`;
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
  const text = `${article.title} ${article.description || ''}`;
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
 */
export function scoreBatchWithNeuralNet(articles, approvedArticles, junkArticles) {
  try {
    // Need sufficient training data
    if (approvedArticles.length < 2 || junkArticles.length < 2) {
      return articles.map(article => ({
        confidence: 50,
        reasoning: '[Neural Net] Insufficient training data',
        isNeuralNet: true
      }));
    }

    // Train once for the batch
    const { nn, vocabulary } = trainNeuralNetwork(approvedArticles, junkArticles, 100);

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
