import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [feedItems, setFeedItems] = useState([]);
  const [approvedArticles, setApprovedArticles] = useState([]);
  const [flaggedArticles, setFlaggedArticles] = useState([]);
  const [junkArticles, setJunkArticles] = useState([]);
  const [notes, setNotes] = useState('');
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [dividerPosition, setDividerPosition] = useState(60); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'flagged', 'approved', or 'junk'
  const [confidenceScores, setConfidenceScores] = useState({}); // Map of link -> {confidence, reasoning}
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [manualArticleUrl, setManualArticleUrl] = useState('');
  const [addingManualArticle, setAddingManualArticle] = useState(false);

  // Load auto-refresh pause preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('autoRefreshPaused');
    if (saved !== null) {
      setAutoRefreshPaused(saved === 'true');
    }
  }, []);

  useEffect(() => {
    // Load feeds, flagged, approved, and junk articles on mount
    const loadAll = async () => {
      console.log('[Initial Load] Starting automatic feed load on mount...');

      // Clean up old articles first
      console.log('[Initial Load] Cleaning up old articles...');
      await fetch('/api/cleanup/old-articles', { method: 'POST' });

      // Load all article lists and predictions
      console.log('[Initial Load] Loading predictions and article lists...');
      const predictions = await loadPredictions();
      await Promise.all([
        loadFlaggedArticles(),
        loadApprovedArticles(),
        loadJunkArticles()
      ]);

      // Then load feeds with all the data
      console.log('[Initial Load] Loading feeds...');
      loadFeeds(predictions);
    };
    loadAll();
  }, []);

  const showStatus = (message, duration = 3000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), duration);
  };

  const loadApprovedArticles = async () => {
    try {
      const response = await fetch('/api/articles/approved');
      if (!response.ok) throw new Error('Failed to fetch approved articles');

      const data = await response.json();
      setApprovedArticles(data.articles || []);
    } catch (error) {
      console.error('Error loading approved articles:', error);
      // Don't show error to user, just log it
    }
  };

  const loadFlaggedArticles = async () => {
    try {
      const response = await fetch('/api/articles/flagged');
      if (!response.ok) throw new Error('Failed to fetch flagged articles');

      const data = await response.json();
      setFlaggedArticles(data.articles || []);
    } catch (error) {
      console.error('Error loading flagged articles:', error);
      // Don't show error to user, just log it
    }
  };

  const loadJunkArticles = async () => {
    try {
      const response = await fetch('/api/articles/junked');
      if (!response.ok) throw new Error('Failed to fetch junk articles');

      const data = await response.json();
      setJunkArticles(data.articles || []);
    } catch (error) {
      console.error('Error loading junk articles:', error);
      // Don't show error to user, just log it
    }
  };

  const loadPredictions = async () => {
    try {
      const response = await fetch('/api/articles/predictions');
      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      const predictions = data.predictions || {};
      console.log(`Loaded ${Object.keys(predictions).length} predictions from database`);
      setConfidenceScores(predictions);
      return predictions; // Return predictions so caller can use them immediately
    } catch (error) {
      console.error('Error loading predictions:', error);
      // Don't show error to user, just log it
      return {}; // Return empty object on error
    }
  };

  const loadFeeds = async (existingPredictions = null, forceReloadLists = false) => {
    setLoading(true);
    try {
      // If called from Refresh button, run cleanup and reload all lists first
      if (forceReloadLists) {
        await fetch('/api/cleanup/old-articles', { method: 'POST' });
        await Promise.all([
          loadFlaggedArticles(),
          loadApprovedArticles(),
          loadJunkArticles()
        ]);
      }

      const response = await fetch('/api/feeds');
      if (!response.ok) throw new Error('Failed to fetch feeds');

      const data = await response.json();
      const items = data.map((item, index) => ({
        ...item,
        id: Date.now() + index,
      }));

      setFeedItems(items);
      showStatus('✅ Feeds loaded successfully!');

      // Use existingPredictions if provided (from initial load), otherwise use state
      const scoresToCheck = existingPredictions !== null ? existingPredictions : confidenceScores;
      console.log(`Checking against ${Object.keys(scoresToCheck).length} existing scores`);

      // Score only NEW articles that:
      // 1. Are not in approved, flagged, or junk tabs
      // 2. Don't already have a confidence score
      // 3. Prioritize newest articles (sort by date, most recent first)
      // 4. Limit to 20 articles per batch to avoid timeout
      const newArticles = items
        .filter(item => {
          const isApproved = approvedArticles.some(a => a.link === item.link);
          const isFlagged = flaggedArticles.some(f => f.link === item.link);
          const isJunked = junkArticles.some(j => j.link === item.link);
          const hasScore = scoresToCheck[item.link] !== undefined;
          return !isApproved && !isFlagged && !isJunked && !hasScore;
        })
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .slice(0, 20); // Only score 20 at a time

      console.log(`Found ${newArticles.length} unscored articles (after filtering and limiting to 20)`);

      if (newArticles.length > 0) {
        scoreArticlesWithML(newArticles);
      }
    } catch (error) {
      console.error('Error loading feeds:', error);
      showStatus('❌ Error loading feeds');
    } finally {
      setLoading(false);
    }
  };

  const scoreArticlesWithML = async (articles) => {
    if (articles.length === 0 || scoringInProgress) return;

    setScoringInProgress(true);
    try {
      showStatus('🤖 Claude is analyzing articles...', 10000);

      // Add timeout to the fetch request (45 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch('/api/ml/score-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 504) {
          showStatus('⏱️ Scoring timed out - too many articles', 4000);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Map confidence scores
        const scores = {};
        data.articles.forEach(article => {
          scores[article.link] = {
            confidence: article.confidence,
            reasoning: article.reasoning
          };
        });
        // Merge with existing scores instead of replacing them
        setConfidenceScores(prevScores => ({
          ...prevScores,
          ...scores
        }));

        // Reload lists if articles were auto-flagged or auto-junked
        if (data.autoFlagged > 0) {
          loadFlaggedArticles();
        }
        if (data.autoJunked > 0) {
          loadJunkArticles();
        }

        // Show status message
        if (data.autoFlagged > 0 && data.autoJunked > 0) {
          showStatus(`✨ Auto-flagged ${data.autoFlagged}, auto-junked ${data.autoJunked} articles!`, 5000);
        } else if (data.autoFlagged > 0) {
          showStatus(`✨ Auto-flagged ${data.autoFlagged} high-confidence articles!`, 5000);
        } else if (data.autoJunked > 0) {
          showStatus(`🗑️ Auto-junked ${data.autoJunked} low-confidence articles!`, 5000);
        } else {
          const scoreMessage = data.total > data.scored
            ? `✅ Analyzed ${data.scored} of ${data.total} most recent articles`
            : `✅ Analyzed ${data.scored} articles with Claude`;
          showStatus(scoreMessage, 10000);
        }
      }
    } catch (error) {
      console.error('ML scoring error:', error);
      if (error.name === 'AbortError') {
        showStatus('⏱️ Scoring timed out - try again later', 4000);
      }
      // Don't show other errors to user, scoring is optional
    } finally {
      setScoringInProgress(false);
    }
  };

  const toggleApproval = async (item) => {
    const isCurrentlyApproved = item.approved;
    const isCurrentlyFlagged = item.flagged || flaggedArticles.some(f => f.link === item.link);

    // Optimistically update UI - match by link instead of id
    const updatedItems = feedItems.map(i =>
      i.link === item.link ? { ...i, approved: !isCurrentlyApproved, flagged: isCurrentlyApproved ? i.flagged : false } : i
    );
    setFeedItems(updatedItems);

    try {
      if (isCurrentlyApproved) {
        // Unapprove the article
        const response = await fetch('/api/articles/unapprove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ link: item.link })
        });

        if (response.ok) {
          showStatus('✅ Article unapproved');
          // Remove from approved articles list
          setApprovedArticles(approvedArticles.filter(a => a.link !== item.link));
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to unapprove article');
        }
      } else {
        // Approve the article
        const response = await fetch('/api/articles/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article: item })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('✅ Story approved globally');
          // Add to approved articles list
          setApprovedArticles([data.article, ...approvedArticles]);

          // Remove confidence score since article is now training data
          setConfidenceScores(prevScores => {
            const newScores = { ...prevScores };
            delete newScores[item.link];
            return newScores;
          });

          // If the article was flagged, automatically unflag it
          if (isCurrentlyFlagged) {
            const unflagResponse = await fetch('/api/articles/unflag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ link: item.link })
            });

            if (unflagResponse.ok) {
              setFlaggedArticles(flaggedArticles.filter(a => a.link !== item.link));
            }
          }
        } else if (response.status === 409) {
          // Already approved
          showStatus('ℹ️ Article already approved');
        } else {
          throw new Error(data.error || 'Failed to approve article');
        }
      }
    } catch (error) {
      console.error('Error toggling approval:', error);
      showStatus('❌ Error: ' + error.message);
      // Revert optimistic update on error - match by link
      const revertedItems = feedItems.map(i =>
        i.link === item.link ? { ...i, approved: isCurrentlyApproved } : i
      );
      setFeedItems(revertedItems);
    }
  };

  const toggleFlag = async (item) => {
    const isCurrentlyFlagged = item.flagged;

    // Optimistically update UI - match by link instead of id
    const updatedItems = feedItems.map(i =>
      i.link === item.link ? { ...i, flagged: !isCurrentlyFlagged } : i
    );
    setFeedItems(updatedItems);

    try {
      if (isCurrentlyFlagged) {
        // Unflag the article
        const response = await fetch('/api/articles/unflag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ link: item.link })
        });

        if (response.ok) {
          showStatus('✅ Article unflagged');
          // Remove from flagged articles list
          setFlaggedArticles(flaggedArticles.filter(a => a.link !== item.link));
          // Remove confidence score to prevent auto-junking
          setConfidenceScores(prevScores => {
            const newScores = { ...prevScores };
            delete newScores[item.link];
            return newScores;
          });
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to unflag article');
        }
      } else {
        // Flag the article
        const response = await fetch('/api/articles/flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article: item })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('🚩 Article flagged for approval');
          // Add to flagged articles list
          setFlaggedArticles([data.article, ...flaggedArticles]);
        } else if (response.status === 409) {
          // Already flagged
          showStatus('ℹ️ Article already flagged');
        } else {
          throw new Error(data.error || 'Failed to flag article');
        }
      }
    } catch (error) {
      console.error('Error toggling flag:', error);
      showStatus('❌ Error: ' + error.message);
      // Revert optimistic update on error - match by link
      const revertedItems = feedItems.map(i =>
        i.link === item.link ? { ...i, flagged: isCurrentlyFlagged } : i
      );
      setFeedItems(revertedItems);
    }
  };

  const toggleJunk = async (item) => {
    const isCurrentlyJunk = item.junked || junkArticles.some(j => j.link === item.link);
    const isCurrentlyFlagged = item.flagged || flaggedArticles.some(f => f.link === item.link);
    const isCurrentlyApproved = item.approved || approvedArticles.some(a => a.link === item.link);

    // Optimistically update UI - match by link instead of id
    const updatedItems = feedItems.map(i =>
      i.link === item.link ? { ...i, junked: !isCurrentlyJunk, flagged: false, approved: false } : i
    );
    setFeedItems(updatedItems);

    try {
      if (isCurrentlyJunk) {
        // Remove from junk
        const response = await fetch('/api/articles/unjunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ link: item.link })
        });

        if (response.ok) {
          showStatus('✅ Article removed from junk');
          // Remove from junk articles list
          setJunkArticles(junkArticles.filter(a => a.link !== item.link));
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to remove article from junk');
        }
      } else {
        // Mark as junk
        const response = await fetch('/api/articles/junk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article: item })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('🗑️ Article marked as junk');
          // Add to junk articles list
          setJunkArticles([data.article, ...junkArticles]);

          // Remove confidence score since article is now training data
          setConfidenceScores(prevScores => {
            const newScores = { ...prevScores };
            delete newScores[item.link];
            return newScores;
          });

          // If the article was flagged, automatically unflag it
          if (isCurrentlyFlagged) {
            const unflagResponse = await fetch('/api/articles/unflag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ link: item.link })
            });

            if (unflagResponse.ok) {
              setFlaggedArticles(flaggedArticles.filter(a => a.link !== item.link));
            }
          }

          // If the article was approved, automatically unapprove it
          if (isCurrentlyApproved) {
            const unapproveResponse = await fetch('/api/articles/unapprove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ link: item.link })
            });

            if (unapproveResponse.ok) {
              setApprovedArticles(approvedArticles.filter(a => a.link !== item.link));
            }
          }
        } else if (response.status === 409) {
          // Already junked
          showStatus('ℹ️ Article already marked as junk');
        } else {
          throw new Error(data.error || 'Failed to mark article as junk');
        }
      }
    } catch (error) {
      console.error('Error toggling junk:', error);
      showStatus('❌ Error: ' + error.message);
      // Revert optimistic update on error - match by link
      const revertedItems = feedItems.map(i =>
        i.link === item.link ? { ...i, junked: isCurrentlyJunk } : i
      );
      setFeedItems(revertedItems);
    }
  };

  const hideArticle = async (item) => {
    try {
      const response = await fetch('/api/articles/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: item.link })
      });

      if (response.ok) {
        showStatus('👁️ Article hidden');
        // Update the flagged article to mark as hidden
        setFlaggedArticles(flaggedArticles.map(a =>
          a.link === item.link ? { ...a, hidden: true } : a
        ));
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to hide article');
      }
    } catch (error) {
      console.error('Error hiding article:', error);
      showStatus('❌ Error: ' + error.message);
    }
  };

  const unhideArticle = async (item) => {
    try {
      const response = await fetch('/api/articles/unhide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: item.link })
      });

      if (response.ok) {
        showStatus('👁️ Article unhidden');
        // Update the flagged article to mark as not hidden
        setFlaggedArticles(flaggedArticles.map(a =>
          a.link === item.link ? { ...a, hidden: false } : a
        ));
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unhide article');
      }
    } catch (error) {
      console.error('Error unhiding article:', error);
      showStatus('❌ Error: ' + error.message);
    }
  };

  const publishArticle = async (item) => {
    try {
      const response = await fetch('/api/articles/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: item.link })
      });

      if (response.ok) {
        showStatus('📤 Article published');
        // Update the approved article to mark as published
        setApprovedArticles(approvedArticles.map(a =>
          a.link === item.link ? { ...a, published: true } : a
        ));
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to publish article');
      }
    } catch (error) {
      console.error('Error publishing article:', error);
      showStatus('❌ Error: ' + error.message);
    }
  };

  const unpublishArticle = async (item) => {
    try {
      const response = await fetch('/api/articles/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: item.link })
      });

      if (response.ok) {
        showStatus('📥 Article unpublished');
        // Update the approved article to mark as not published
        setApprovedArticles(approvedArticles.map(a =>
          a.link === item.link ? { ...a, published: false } : a
        ));
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unpublish article');
      }
    } catch (error) {
      console.error('Error unpublishing article:', error);
      showStatus('❌ Error: ' + error.message);
    }
  };

  const addManualArticle = async () => {
    if (!manualArticleUrl.trim()) {
      showStatus('⚠️ Please enter a URL');
      return;
    }

    setAddingManualArticle(true);
    try {
      showStatus('🔍 Fetching article information...');

      let article;

      // First check if article is already in our feed items
      const existingArticle = feedItems.find(item => item.link === manualArticleUrl.trim());

      if (existingArticle) {
        // Use the existing article data from RSS feed
        article = { ...existingArticle };
        showStatus('✓ Found article in feed');
      } else {
        // Try to fetch metadata from the URL
        const metadataResponse = await fetch('/api/articles/fetch-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: manualArticleUrl.trim() })
        });

        if (!metadataResponse.ok) {
          const errorData = await metadataResponse.json();
          throw new Error(errorData.error || 'Failed to fetch article metadata');
        }

        const metadataResult = await metadataResponse.json();
        article = metadataResult.article;
      }

      // Add to flagged articles
      const flagResponse = await fetch('/api/articles/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: {
            ...article,
            id: Date.now().toString()
          }
        })
      });

      if (!flagResponse.ok) {
        const errorData = await flagResponse.json();
        if (flagResponse.status === 409) {
          showStatus('ℹ️ Article already flagged');
          setManualArticleUrl('');
          return;
        }
        throw new Error(errorData.error || 'Failed to flag article');
      }

      const flagData = await flagResponse.json();
      setFlaggedArticles([flagData.article, ...flaggedArticles]);
      setManualArticleUrl('');

      // Score the article with ML
      showStatus('🤖 Scoring article with Claude...');
      const scoreResponse = await fetch('/api/ml/score-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: [article] })
      });

      if (scoreResponse.ok) {
        const scoreData = await scoreResponse.json();
        if (scoreData.success && scoreData.articles.length > 0) {
          const scored = scoreData.articles[0];
          setConfidenceScores(prevScores => ({
            ...prevScores,
            [scored.link]: {
              confidence: scored.confidence,
              reasoning: scored.reasoning
            }
          }));
        }
      }

      showStatus('✅ Article added to flagged!');
    } catch (error) {
      console.error('Error adding manual article:', error);
      showStatus(`❌ ${error.message}`);
    } finally {
      setAddingManualArticle(false);
    }
  };

  const summarizeWithAI = async () => {
    if (!notes.trim()) {
      showStatus('⚠️ Please enter some notes to summarize');
      return;
    }

    setSummarizing(true);
    try {
      showStatus('🤖 Summarizing with AI...');

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });

      if (response.ok) {
        const result = await response.json();
        const newSummary = {
          text: result.summary || 'No summary returned',
          timestamp: new Date(),
          id: Date.now()
        };
        setSummaries([newSummary, ...summaries]);
        showStatus('✅ Summary generated!');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }
    } catch (error) {
      showStatus('❌ Error: ' + error.message);
      const errorSummary = {
        text: 'Error generating summary: ' + error.message,
        timestamp: new Date(),
        id: Date.now(),
        isError: true
      };
      setSummaries([errorSummary, ...summaries]);
    } finally {
      setSummarizing(false);
    }
  };

  const clearNotes = () => {
    if (!notes.trim() && summaries.length === 0) {
      showStatus('Notes are already empty');
      return;
    }
    if (confirm('Clear all notes and summaries?')) {
      setNotes('');
      setSummaries([]);
      showStatus('🗑️ Notes cleared');
    }
  };

  const toggleAutoRefresh = () => {
    const newValue = !autoRefreshPaused;
    setAutoRefreshPaused(newValue);
    localStorage.setItem('autoRefreshPaused', newValue.toString());
    showStatus(newValue ? '⏸️ Auto-refresh paused' : '▶️ Auto-refresh resumed');
  };

  const fetchArticleContent = async (article) => {
    try {
      showStatus('📄 Fetching article content...', 5000);

      const response = await fetch('/api/fetch-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.link })
      });

      if (response.ok) {
        const data = await response.json();

        // Add article content to notes
        const articleNote = `\n--- ${article.title} ---\nSource: ${article.sourceName}\nURL: ${article.link}\n\n${data.content}\n---\n`;
        setNotes(prevNotes => prevNotes + articleNote);

        showStatus('✅ Full article content added to notes!');
      } else {
        // Fallback: open article in new tab if fetch fails
        console.log('Article fetch failed, opening in new tab');
        window.open(article.link, '_blank', 'noopener,noreferrer');
        showStatus('⚠️ Content unavailable - opened in new tab');
      }

    } catch (error) {
      console.error('Error fetching article:', error);

      // Fallback: open article in new tab
      window.open(article.link, '_blank', 'noopener,noreferrer');
      showStatus('⚠️ Could not fetch content - opened in new tab');
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newPosition = (e.clientX / window.innerWidth) * 100;
    if (newPosition > 30 && newPosition < 80) {
      setDividerPosition(newPosition);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Fast auto-refresh for scoring unscored articles (every 15 seconds)
  useEffect(() => {
    // If auto-refresh is paused, clear any existing interval
    if (autoRefreshPaused) {
      if (autoRefreshInterval) {
        console.log('[Fast Refresh] Paused by user, clearing interval');
        clearInterval(autoRefreshInterval);
        setAutoRefreshInterval(null);
      }
      return;
    }

    // Calculate unscored articles
    const allArticles = [...feedItems]
      .map(item => ({
        ...item,
        approved: approvedArticles.some(a => a.link === item.link),
        flagged: flaggedArticles.some(f => f.link === item.link),
        junked: junkArticles.some(j => j.link === item.link)
      }))
      .filter(item => !item.approved && !item.flagged && !item.junked);

    const scoredCount = allArticles.filter(item => confidenceScores[item.link] !== undefined).length;
    const totalCount = allArticles.length;

    console.log(`[Fast Refresh Check] Total: ${totalCount}, Scored: ${scoredCount}, Scoring: ${scoringInProgress}, Paused: ${autoRefreshPaused}, Interval exists: ${!!autoRefreshInterval}`);

    // If there are unscored articles, set up fast refresh for scoring
    if (totalCount > 0 && scoredCount < totalCount && !scoringInProgress) {
      if (!autoRefreshInterval) {
        console.log(`[Fast Refresh] Setting up interval: ${scoredCount}/${totalCount} scored`);
        const interval = setInterval(() => {
          console.log('[Fast Refresh] Triggering refresh to score articles...');
          loadFeeds(null, true);
        }, 15000); // 15 seconds
        setAutoRefreshInterval(interval);
      }
    } else if (scoredCount === totalCount && totalCount > 0) {
      // All articles are scored, clear the interval
      if (autoRefreshInterval) {
        console.log('[Fast Refresh] All articles scored, clearing interval');
        clearInterval(autoRefreshInterval);
        setAutoRefreshInterval(null);
      }
    }

    // Cleanup on unmount
    return () => {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }
    };
  }, [feedItems, approvedArticles, flaggedArticles, junkArticles, confidenceScores, scoringInProgress, autoRefreshPaused]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown date';

    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const decodeHtmlEntities = (text) => {
    if (!text) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const cleanDescription = (desc) => {
    if (!desc) return '';
    const cleaned = desc.replace(/<[^>]*>/g, '').trim();
    const decoded = decodeHtmlEntities(cleaned);
    return decoded.length > 200 ? decoded.substring(0, 200) + '...' : decoded;
  };

  // Compute approved/flagged/junked status dynamically based on current state
  // Filter out approved, flagged, and junked articles from "All Articles" tab
  const sortedItems = [...feedItems]
    .map(item => ({
      ...item,
      approved: approvedArticles.some(a => a.link === item.link),
      flagged: flaggedArticles.some(f => f.link === item.link),
      junked: junkArticles.some(j => j.link === item.link)
    }))
    .filter(item => !item.approved && !item.flagged && !item.junked)
    .sort((a, b) =>
      new Date(b.pubDate) - new Date(a.pubDate)
    );

  // Count scored articles in All Articles tab only
  const scoredInAllArticles = sortedItems.filter(item => confidenceScores[item.link] !== undefined).length;

  return (
    <>
      <Head>
        <title>Edgewater Research - Feed Monitor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      {statusMessage && (
        <div className="status-message show">{statusMessage}</div>
      )}

      <div className="container">
        <div className="feed-section" style={{ width: `${dividerPosition}%` }}>
          <div className="header">
            <div className="brand-header">
              <div className="brand-logo">
                <div className="brand-text">
                  <h1>Edgewater Research</h1>
                  <p className="brand-tagline">Digest Streamliner</p>
                </div>
              </div>
            </div>
          </div>

          <div className="feed-controls">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All Articles ({sortedItems.length})
              </button>
              <button
                className={`tab ${activeTab === 'flagged' ? 'active' : ''}`}
                onClick={() => setActiveTab('flagged')}
              >
                Flagged ({flaggedArticles.length})
              </button>
              <button
                className={`tab ${activeTab === 'approved' ? 'active' : ''}`}
                onClick={() => setActiveTab('approved')}
              >
                Approved ({approvedArticles.length})
              </button>
              <button
                className={`tab ${activeTab === 'junk' ? 'active' : ''}`}
                onClick={() => setActiveTab('junk')}
              >
                Junk ({junkArticles.length})
              </button>
            </div>
            <div className="ml-stats">
              <span className="ml-stats-icon">🤖</span>
              <span className="ml-stats-text">{scoredInAllArticles} Scored</span>
            </div>
            <div className="refresh-controls">
              <button onClick={() => loadFeeds(null, true)} disabled={loading} className="btn-primary">
                {loading ? 'Loading...' : 'Refresh Feeds'}
              </button>
              <button
                onClick={toggleAutoRefresh}
                className={`btn-icon ${autoRefreshPaused ? 'paused' : 'active'}`}
                title={autoRefreshPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
              >
                {autoRefreshPaused ? '▶️' : '⏸️'}
              </button>
            </div>
          </div>

          <div className="feed-list">
            {loading ? (
              <div className="loading">Loading feeds</div>
            ) : activeTab === 'all' ? (
              sortedItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-text">No feed items found.<br />Auto-refresh will check for new articles shortly...</div>
                </div>
              ) : (
                sortedItems.map((item) => {
                  const scoreData = confidenceScores[item.link];
                  const confidence = scoreData?.confidence;
                  const getConfidenceLevel = (score) => {
                    if (score >= 80) return 'high';
                    if (score >= 60) return 'medium';
                    return 'low';
                  };

                  return (
                    <div key={item.id} className={`feed-item ${item.approved ? 'approved' : ''} ${item.flagged ? 'flagged' : ''}`}>
                      <div className="feed-item-header">
                        <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                        {confidence !== undefined && (
                          <span
                            className={`confidence-badge confidence-${getConfidenceLevel(confidence)}`}
                            title={scoreData.reasoning || 'AI confidence score'}
                          >
                            {confidence >= 80 ? '🎯' : confidence >= 60 ? '👍' : '📊'} {confidence}%
                          </span>
                        )}
                      </div>
                      <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                      <div className="feed-description">{cleanDescription(item.description)}</div>
                      <div className="feed-meta">
                        <span className="feed-date">{formatDate(item.pubDate)}</span>
                        <div className="feed-actions">
                        <button
                          className="btn-visit"
                          onClick={() => fetchArticleContent(item)}
                          title="Add article content to research notes"
                        >
                          View Article
                        </button>
                        <button
                          className={`btn-flag ${item.flagged ? 'flagged' : ''}`}
                          onClick={() => toggleFlag(item)}
                        >
                          {item.flagged ? 'Unflag' : 'Flag'}
                        </button>
                        <button
                          className={`btn-approve ${item.approved ? 'approved' : ''}`}
                          onClick={() => toggleApproval(item)}
                        >
                          {item.approved ? 'Unapprove' : 'Approve'}
                        </button>
                        <button
                          className="btn-junk"
                          onClick={() => toggleJunk(item)}
                        >
                          Junk
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )
            ) : activeTab === 'flagged' ? (
              <>
                <div className="manual-article-input">
                  <input
                    type="url"
                    placeholder="Paste article URL to add manually..."
                    value={manualArticleUrl}
                    onChange={(e) => setManualArticleUrl(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !addingManualArticle) {
                        addManualArticle();
                      }
                    }}
                    disabled={addingManualArticle}
                    className="manual-article-url-input"
                  />
                  <button
                    onClick={addManualArticle}
                    disabled={addingManualArticle || !manualArticleUrl.trim()}
                    className="btn-add-manual"
                  >
                    {addingManualArticle ? 'Adding...' : 'Add Article'}
                  </button>
                </div>
                {flaggedArticles.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🚩</div>
                    <div className="empty-state-text">No flagged articles yet.<br />Add manually above or switch to "All Articles" tab.</div>
                  </div>
                ) : (
                  <>
                    {/* Visible flagged articles */}
                    {flaggedArticles.filter(item => !item.hidden).map((item) => {
                    const scoreData = confidenceScores[item.link];
                    const confidence = scoreData?.confidence;
                    const getConfidenceLevel = (score) => {
                      if (score >= 80) return 'high';
                      if (score >= 60) return 'medium';
                      return 'low';
                    };

                    return (
                      <div key={item.dbId || item.id} className="feed-item flagged">
                        <div className="feed-item-header">
                          <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                          {confidence !== undefined && (
                            <span
                              className={`confidence-badge confidence-${getConfidenceLevel(confidence)}`}
                              title={scoreData.reasoning || 'AI confidence score'}
                            >
                              {confidence >= 80 ? '🎯' : confidence >= 60 ? '👍' : '📊'} {confidence}%
                            </span>
                          )}
                        </div>
                        <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                        <div className="feed-description">{cleanDescription(item.description)}</div>
                        <div className="feed-meta">
                          <span className="feed-date">{formatDate(item.pubDate)}</span>
                      <div className="feed-actions">
                        <button
                          className="btn-visit"
                          onClick={() => fetchArticleContent(item)}
                          title="Add article content to research notes"
                        >
                          View Article
                        </button>
                        <button
                          className="btn-flag"
                          onClick={() => hideArticle(item)}
                        >
                          Hide
                        </button>
                        <button
                          className="btn-approve"
                          onClick={() => {
                            const tempItem = { ...item, id: item.dbId, flagged: true };
                            toggleApproval(tempItem);
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-junk"
                          onClick={() => {
                            const tempItem = { ...item, id: item.dbId, flagged: true };
                            toggleJunk(tempItem);
                          }}
                        >
                          Junk
                        </button>
                      </div>
                    </div>
                  </div>
                    );
                    })}

                    {/* Divider if there are hidden articles */}
                    {flaggedArticles.filter(item => item.hidden).length > 0 && (
                      <div className="hidden-divider">
                        <span>Hidden Articles ({flaggedArticles.filter(item => item.hidden).length})</span>
                      </div>
                    )}

                    {/* Hidden flagged articles */}
                    {flaggedArticles.filter(item => item.hidden).map((item) => {
                      const scoreData = confidenceScores[item.link];
                      const confidence = scoreData?.confidence;
                      const getConfidenceLevel = (score) => {
                        if (score >= 80) return 'high';
                        if (score >= 60) return 'medium';
                        return 'low';
                      };

                      return (
                        <div key={item.dbId || item.id} className="feed-item flagged hidden-article">
                          <div className="feed-item-header">
                            <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                            {confidence !== undefined && (
                              <span
                                className={`confidence-badge confidence-${getConfidenceLevel(confidence)}`}
                                title={scoreData.reasoning || 'AI confidence score'}
                              >
                                {confidence >= 80 ? '🎯' : confidence >= 60 ? '👍' : '📊'} {confidence}%
                              </span>
                            )}
                          </div>
                          <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                          <div className="feed-description">{cleanDescription(item.description)}</div>
                          <div className="feed-meta">
                            <span className="feed-date">{formatDate(item.pubDate)}</span>
                            <div className="feed-actions">
                              <button
                                className="btn-visit"
                                onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
                              >
                                View Article
                              </button>
                              <button
                                className="btn-flag"
                                onClick={() => unhideArticle(item)}
                              >
                                Unhide
                              </button>
                              <button
                                className="btn-approve"
                                onClick={() => {
                                  const tempItem = { ...item, id: item.dbId, flagged: true };
                                  toggleApproval(tempItem);
                                }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn-junk"
                                onClick={() => {
                                  const tempItem = { ...item, id: item.dbId, flagged: true };
                                  toggleJunk(tempItem);
                                }}
                              >
                                Junk
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            ) : activeTab === 'approved' ? (
              approvedArticles.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✓</div>
                  <div className="empty-state-text">No approved articles yet.<br />Switch to "All Articles" tab to approve some.</div>
                </div>
              ) : (
                <>
                  {/* Unpublished approved articles */}
                  {approvedArticles.filter(item => !item.published).map((item) => (
                    <div key={item.dbId || item.id} className="feed-item approved">
                      <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                      <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                      <div className="feed-description">{cleanDescription(item.description)}</div>
                      <div className="feed-meta">
                        <span className="feed-date">{formatDate(item.pubDate)}</span>
                        <div className="feed-actions">
                          <button
                            className="btn-visit"
                            onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
                          >
                            View Article
                          </button>
                          <button
                            className="btn-approve approved"
                            onClick={() => {
                              const tempItem = { ...item, id: item.dbId, approved: true };
                              toggleApproval(tempItem);
                            }}
                          >
                            Unapprove
                          </button>
                          <button
                            className="btn-publish"
                            onClick={() => publishArticle(item)}
                          >
                            Publish
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Divider if there are published articles */}
                  {approvedArticles.filter(item => item.published).length > 0 && (
                    <div className="hidden-divider">
                      <span>Published Articles ({approvedArticles.filter(item => item.published).length})</span>
                    </div>
                  )}

                  {/* Published approved articles */}
                  {approvedArticles.filter(item => item.published).map((item) => (
                    <div key={item.dbId || item.id} className="feed-item approved published-article">
                      <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                      <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                      <div className="feed-description">{cleanDescription(item.description)}</div>
                      <div className="feed-meta">
                        <span className="feed-date">{formatDate(item.pubDate)}</span>
                        <div className="feed-actions">
                          <button
                            className="btn-visit"
                            onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
                          >
                            View Article
                          </button>
                          <button
                            className="btn-approve approved"
                            onClick={() => {
                              const tempItem = { ...item, id: item.dbId, approved: true };
                              toggleApproval(tempItem);
                            }}
                          >
                            Unapprove
                          </button>
                          <button
                            className="btn-publish published"
                            onClick={() => unpublishArticle(item)}
                          >
                            Unpublish
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )
            ) : (
              junkArticles.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🗑️</div>
                  <div className="empty-state-text">No junk articles yet.<br />Mark articles as junk to train the ML system.</div>
                </div>
              ) : (
                junkArticles.map((item) => (
                  <div key={item.dbId || item.id} className="feed-item">
                    <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                    <div className="feed-title">{decodeHtmlEntities(item.title)}</div>
                    <div className="feed-description">{cleanDescription(item.description)}</div>
                    <div className="feed-meta">
                      <span className="feed-date">{formatDate(item.pubDate)}</span>
                      <div className="feed-actions">
                        <button
                          className="btn-visit"
                          onClick={() => fetchArticleContent(item)}
                          title="Add article content to research notes"
                        >
                          View Article
                        </button>
                        <button
                          className="btn-junk junked"
                          onClick={() => {
                            const tempItem = { ...item, id: item.dbId, junked: true };
                            toggleJunk(tempItem);
                          }}
                        >
                          Remove from Junk
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        <div className="divider" onMouseDown={handleMouseDown}></div>

        <div className="notes-section" style={{ width: `${100 - dividerPosition}%` }}>
          <div className="notes-header">
            <h2>Research Notes</h2>
            <p className="notes-subtitle">Write your notes and summarize with AI</p>
          </div>
          <div className="notes-content">
            <div className="notes-editor">
              <textarea
                className="notes-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write your research notes here...&#10;&#10;You can add thoughts, observations, and key points from the articles you're reviewing."
              />
              <div className="notes-actions">
                <button
                  onClick={summarizeWithAI}
                  disabled={summarizing || !notes.trim()}
                  className="btn-ai"
                >
                  {summarizing ? '🤖 Summarizing...' : '🤖 Summarize with AI'}
                </button>
                <button
                  onClick={clearNotes}
                  className="btn-clear"
                >
                  Clear Notes
                </button>
              </div>
            </div>
            {summaries.length > 0 && (
              <div className="summaries-list">
                {summaries.map((summary) => (
                  <div key={summary.id} className={`summary-section ${summary.isError ? 'error' : ''}`}>
                    <div className="summary-header">
                      <h3 className="summary-title">AI Summary</h3>
                      <span className="summary-time">{formatDate(summary.timestamp)}</span>
                    </div>
                    <div className="summary-content">{summary.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #f5f7fa;
          height: 100vh;
          overflow: hidden;
        }

        .container {
          display: flex;
          height: 100vh;
          position: relative;
        }

        .feed-section {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          overflow: hidden;
        }

        .divider {
          width: 4px;
          background: #e5e7eb;
          cursor: col-resize;
          position: relative;
          transition: background 0.2s;
        }

        .divider:hover {
          background: #002855;
        }

        .divider:active {
          background: #002855;
        }

        .notes-section {
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .header {
          padding: 28px 32px;
          background: linear-gradient(135deg, #002855 0%, #003d82 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(0,40,85,0.15);
        }

        .brand-header {
          margin-bottom: 20px;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-text h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.3px;
        }

        .brand-tagline {
          font-size: 13px;
          font-weight: 400;
          opacity: 0.85;
          margin-top: 4px;
          letter-spacing: 0.2px;
        }

        .feed-controls {
          padding: 18px 32px;
          background: #ffffff;
          border-bottom: 1px solid #e1e8ed;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .tabs {
          display: flex;
          gap: 8px;
        }

        .tab {
          padding: 10px 20px;
          background: transparent;
          color: #64748b;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .tab:hover {
          border-color: #002855;
          color: #002855;
        }

        .tab.active {
          background: #002855;
          color: white;
          border-color: #002855;
        }

        .ml-stats {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          border-radius: 8px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 2px 4px rgba(139, 92, 246, 0.25);
        }

        .ml-stats-icon {
          font-size: 16px;
        }

        .ml-stats-text {
          letter-spacing: 0.3px;
        }

        .btn-primary {
          padding: 10px 20px;
          background: #002855;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(0,40,85,0.15);
        }

        .btn-primary:hover:not(:disabled) {
          background: #003d82;
          box-shadow: 0 4px 8px rgba(0,40,85,0.25);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .refresh-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .btn-icon {
          padding: 10px 14px;
          background: transparent;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
        }

        .btn-icon:hover {
          border-color: #002855;
          background: #f8fafc;
        }

        .btn-icon.active {
          border-color: #10b981;
          background: #ecfdf5;
        }

        .btn-icon.active:hover {
          border-color: #059669;
          background: #d1fae5;
        }

        .btn-icon.paused {
          border-color: #f59e0b;
          background: #fef3c7;
        }

        .btn-icon.paused:hover {
          border-color: #d97706;
          background: #fde68a;
        }

        .btn-secondary {
          padding: 10px 20px;
          background: transparent;
          color: #002855;
          border: 2px solid #002855;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #002855;
          color: white;
          transform: translateY(-1px);
        }

        .feed-list {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          background: #f5f7fa;
        }

        .feed-list::-webkit-scrollbar {
          width: 10px;
        }

        .feed-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .feed-list::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .feed-list::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .manual-article-input {
          display: flex;
          gap: 12px;
          padding: 20px;
          background: white;
          border: 2px solid #e1e8ed;
          border-radius: 12px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,40,85,0.06);
        }

        .manual-article-url-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          color: #0f172a;
          transition: all 0.2s;
        }

        .manual-article-url-input:focus {
          outline: none;
          border-color: #002855;
          box-shadow: 0 0 0 3px rgba(0, 40, 85, 0.1);
        }

        .manual-article-url-input:disabled {
          background: #f9fafb;
          cursor: not-allowed;
        }

        .manual-article-url-input::placeholder {
          color: #94a3b8;
        }

        .btn-add-manual {
          padding: 12px 24px;
          background: #f59e0b;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-add-manual:hover:not(:disabled) {
          background: #d97706;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(245,158,11,0.25);
        }

        .btn-add-manual:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .feed-item {
          background: #ffffff;
          border: 1px solid #e1e8ed;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 18px;
          transition: all 0.25s ease;
          box-shadow: 0 1px 3px rgba(0,40,85,0.06);
        }

        .feed-item:hover {
          box-shadow: 0 8px 20px rgba(0,40,85,0.12);
          border-color: #002855;
          transform: translateY(-2px);
        }

        .feed-item.approved {
          border-left: 4px solid #059669;
          background: #f0fdf4;
        }

        .feed-item.flagged {
          border-left: 4px solid #f59e0b;
          background: #fffbeb;
        }

        .hidden-article {
          opacity: 0.6;
        }

        .hidden-divider {
          margin: 24px 0;
          padding: 12px 0;
          text-align: center;
          border-top: 2px solid #e5e7eb;
          border-bottom: 2px solid #e5e7eb;
          background: #f9fafb;
        }

        .hidden-divider span {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .feed-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .feed-source {
          display: inline-block;
          padding: 6px 12px;
          background: #000000;
          color: white;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .feed-source.bloomberg {
          background: #000000;
        }

        .feed-source.reuters {
          background: #d97706;
        }

        .feed-source.digitimes {
          background: #7c3aed;
        }

        .confidence-badge {
          padding: 6px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          cursor: help;
          transition: all 0.2s;
        }

        .confidence-badge:hover {
          transform: scale(1.05);
        }

        .confidence-high {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
        }

        .confidence-medium {
          background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
          color: white;
          box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
        }

        .confidence-low {
          background: #e2e8f0;
          color: #64748b;
        }

        .feed-title {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 12px;
          color: #0f172a;
          line-height: 1.5;
          letter-spacing: -0.2px;
        }

        .feed-description {
          font-size: 14px;
          color: #475569;
          margin-bottom: 12px;
          line-height: 1.7;
        }

        .feed-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #f3f4f6;
        }

        .feed-date {
          font-size: 13px;
          color: #9ca3af;
          font-weight: 500;
        }

        .feed-actions {
          display: flex;
          gap: 8px;
        }

        .btn-approve {
          padding: 8px 16px;
          background: #059669;
          color: white;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-approve:hover:not(:disabled) {
          background: #047857;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(5,150,105,0.3);
        }

        .btn-approve.approved {
          background: #dc2626;
          cursor: pointer;
        }

        .btn-approve.approved:hover {
          background: #b91c1c;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(220,38,38,0.3);
        }

        .btn-flag {
          padding: 8px 16px;
          background: #f59e0b;
          color: white;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-flag:hover:not(:disabled) {
          background: #d97706;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(245,158,11,0.3);
        }

        .btn-flag.flagged {
          background: #94a3b8;
          cursor: pointer;
        }

        .btn-flag.flagged:hover {
          background: #64748b;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(148,163,184,0.3);
        }

        .btn-visit {
          padding: 8px 16px;
          background: transparent;
          color: #002855;
          border: 2px solid #002855;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-visit:hover {
          background: #002855;
          color: white;
          transform: translateY(-1px);
        }

        .btn-junk {
          padding: 8px 16px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-junk:hover:not(:disabled) {
          background: #b91c1c;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(220,38,38,0.3);
        }

        .btn-junk.junked {
          background: #ef4444;
          cursor: pointer;
        }

        .btn-junk.junked:hover {
          background: #dc2626;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(220,38,38,0.3);
        }

        .btn-publish {
          padding: 8px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-publish:hover:not(:disabled) {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(37,99,235,0.3);
        }

        .btn-publish.published {
          background: #94a3b8;
          cursor: pointer;
        }

        .btn-publish.published:hover {
          background: #64748b;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(148,163,184,0.3);
        }

        .published-article {
          opacity: 0.6;
        }

        .notes-header {
          padding: 28px 32px;
          background: linear-gradient(135deg, #002855 0%, #003d82 100%);
          color: white;
          box-shadow: 0 2px 8px rgba(0,40,85,0.15);
        }

        .notes-header h2 {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin-bottom: 6px;
        }

        .notes-subtitle {
          font-size: 12px;
          opacity: 0.85;
          font-weight: 500;
          letter-spacing: 0.3px;
        }

        .notes-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .notes-content::-webkit-scrollbar {
          width: 10px;
        }

        .notes-content::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 5px;
        }

        .notes-content::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .notes-editor {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .notes-textarea {
          width: 100%;
          min-height: 500px;
          padding: 16px;
          border: 2px solid #e1e8ed;
          border-radius: 12px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          line-height: 1.7;
          color: #0f172a;
          background: white;
          resize: vertical;
          transition: all 0.2s;
        }

        .notes-textarea::placeholder {
          color: #94a3b8;
        }

        .notes-textarea:focus {
          outline: none;
          border-color: #002855;
          box-shadow: 0 0 0 3px rgba(0, 40, 85, 0.1);
        }

        .notes-actions {
          display: flex;
          gap: 12px;
        }

        .btn-ai {
          flex: 1;
          padding: 12px 24px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
        }

        .btn-ai:hover:not(:disabled) {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
          transform: translateY(-1px);
        }

        .btn-ai:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .btn-clear {
          padding: 12px 24px;
          background: transparent;
          color: #64748b;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }

        .btn-clear:hover {
          border-color: #dc2626;
          color: #dc2626;
          background: #fef2f2;
        }

        .summaries-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .summary-section {
          background: white;
          border: 2px solid #8b5cf6;
          border-radius: 12px;
          padding: 20px;
          animation: fadeIn 0.3s ease;
        }

        .summary-section.error {
          border-color: #dc2626;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .summary-title {
          font-size: 14px;
          font-weight: 700;
          color: #8b5cf6;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .summary-section.error .summary-title {
          color: #dc2626;
        }

        .summary-time {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }

        .summary-content {
          font-size: 14px;
          color: #0f172a;
          line-height: 1.7;
          white-space: pre-wrap;
        }

        .loading {
          text-align: center;
          padding: 80px 20px;
          color: #64748b;
          font-size: 15px;
          font-weight: 500;
        }

        .loading::before {
          content: "";
          display: inline-block;
          width: 40px;
          height: 40px;
          margin-bottom: 16px;
          border: 4px solid #e1e8ed;
          border-top-color: #002855;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .status-message {
          position: fixed;
          top: 28px;
          right: 28px;
          padding: 16px 24px;
          background: #059669;
          color: white;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(5,150,105,0.25);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 1000;
          font-weight: 600;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
        }

        .status-message.show {
          opacity: 1;
        }

        .empty-state {
          text-align: center;
          padding: 80px 40px;
          color: #94a3b8;
        }

        .empty-state-icon {
          font-size: 56px;
          margin-bottom: 20px;
          opacity: 0.4;
        }

        .empty-state-text {
          font-size: 15px;
          line-height: 1.7;
          color: #64748b;
          font-weight: 500;
        }
      `}</style>
    </>
  );
}
