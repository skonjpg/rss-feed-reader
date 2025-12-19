-- Supabase Schema for RSS Feed Reader
-- Run this SQL in your Supabase SQL Editor

-- =====================================================
-- 1. APPROVED ARTICLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS approved_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL,
  pub_date TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL,
  source_name TEXT NOT NULL,
  approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(link) -- Prevent duplicate approvals of same article
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_approved_articles_approved_at ON approved_articles(approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_approved_articles_source ON approved_articles(source);

-- Enable Row Level Security (RLS)
ALTER TABLE approved_articles ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations
CREATE POLICY "Allow all operations on approved_articles" ON approved_articles
  FOR ALL USING (true);

-- =====================================================
-- 2. FLAGGED ARTICLES TABLE (For Review/Pending Approval)
-- =====================================================
CREATE TABLE IF NOT EXISTS flagged_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL,
  pub_date TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL,
  source_name TEXT NOT NULL,
  flagged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(link) -- Prevent duplicate flags of same article
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_flagged_articles_flagged_at ON flagged_articles(flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_flagged_articles_source ON flagged_articles(source);

-- Enable Row Level Security (RLS)
ALTER TABLE flagged_articles ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations
CREATE POLICY "Allow all operations on flagged_articles" ON flagged_articles
  FOR ALL USING (true);

-- =====================================================
-- 3. ARTICLE PREDICTIONS TABLE (ML Confidence Scores)
-- =====================================================
CREATE TABLE IF NOT EXISTS article_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  link TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  confidence_score FLOAT NOT NULL,
  reasoning TEXT,
  predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_version TEXT DEFAULT 'claude-3.5-sonnet'
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_predictions_score ON article_predictions(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_link ON article_predictions(link);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at ON article_predictions(predicted_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE article_predictions ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations
CREATE POLICY "Allow all operations on article_predictions" ON article_predictions
  FOR ALL USING (true);

-- =====================================================
-- 4. ADD ML FIELDS TO EXISTING TABLES
-- =====================================================

-- Add confidence score and auto_flagged to flagged_articles
ALTER TABLE flagged_articles
ADD COLUMN IF NOT EXISTS confidence_score FLOAT,
ADD COLUMN IF NOT EXISTS auto_flagged BOOLEAN DEFAULT false;

-- Add confidence score to approved_articles
ALTER TABLE approved_articles
ADD COLUMN IF NOT EXISTS confidence_score FLOAT;

-- =====================================================
-- 5. JUNK ARTICLES TABLE (Negative Training Examples)
-- =====================================================
CREATE TABLE IF NOT EXISTS junk_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL,
  pub_date TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL,
  source_name TEXT NOT NULL,
  junked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(link) -- Prevent duplicate junk marks of same article
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_junk_articles_junked_at ON junk_articles(junked_at DESC);
CREATE INDEX IF NOT EXISTS idx_junk_articles_source ON junk_articles(source);

-- Enable Row Level Security (RLS)
ALTER TABLE junk_articles ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations
CREATE POLICY "Allow all operations on junk_articles" ON junk_articles
  FOR ALL USING (true);

-- =====================================================
-- 6. NEURAL NETWORK MODEL TABLE (Model Persistence)
-- =====================================================
CREATE TABLE IF NOT EXISTS neural_network_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_version TEXT NOT NULL DEFAULT 'v1',
  vocabulary JSONB NOT NULL, -- Array of vocabulary words
  weights_input_hidden JSONB NOT NULL, -- 2D array of weights
  weights_hidden_output JSONB NOT NULL, -- 2D array of weights
  bias_hidden JSONB NOT NULL, -- Array of bias values
  bias_output JSONB NOT NULL, -- Array of bias values
  input_size INTEGER NOT NULL,
  hidden_size INTEGER NOT NULL,
  output_size INTEGER NOT NULL,
  learning_rate FLOAT NOT NULL DEFAULT 0.1,
  training_count INTEGER DEFAULT 0, -- Number of training iterations
  last_trained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true -- Only one active model at a time
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_nn_models_active ON neural_network_models(is_active, last_trained_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE neural_network_models ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations
CREATE POLICY "Allow all operations on neural_network_models" ON neural_network_models
  FOR ALL USING (true);
