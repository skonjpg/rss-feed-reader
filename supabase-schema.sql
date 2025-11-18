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
