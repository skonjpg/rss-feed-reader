import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [feedItems, setFeedItems] = useState([]);
  const [approvedArticles, setApprovedArticles] = useState([]);
  const [notes, setNotes] = useState('');
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [dividerPosition, setDividerPosition] = useState(60); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' or 'approved'

  useEffect(() => {
    // Load feeds and approved articles on mount
    loadFeeds();
    loadApprovedArticles();
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

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/feeds');
      if (!response.ok) throw new Error('Failed to fetch feeds');

      const data = await response.json();
      const items = data.map((item, index) => {
        // Check if this article is already approved (match by link)
        const isApproved = approvedArticles.some(approved => approved.link === item.link);
        return {
          ...item,
          id: Date.now() + index,
          approved: isApproved
        };
      });

      setFeedItems(items);
      showStatus('✅ Feeds loaded successfully!');
    } catch (error) {
      console.error('Error loading feeds:', error);
      showStatus('❌ Error loading feeds');
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = async (item) => {
    const isCurrentlyApproved = item.approved;

    // Optimistically update UI
    const updatedItems = feedItems.map(i =>
      i.id === item.id ? { ...i, approved: !isCurrentlyApproved } : i
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
      // Revert optimistic update on error
      const revertedItems = feedItems.map(i =>
        i.id === item.id ? { ...i, approved: isCurrentlyApproved } : i
      );
      setFeedItems(revertedItems);
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

  const cleanDescription = (desc) => {
    if (!desc) return '';
    const cleaned = desc.replace(/<[^>]*>/g, '').trim();
    return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;
  };

  const sortedItems = [...feedItems].sort((a, b) => 
    new Date(b.pubDate) - new Date(a.pubDate)
  );

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
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="4" fill="white" fillOpacity="0.15"/>
                  <path d="M8 12h16M8 16h16M8 20h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <div className="brand-text">
                  <h1>Edgewater Research</h1>
                  <p className="brand-tagline">Market Intelligence Feed Monitor</p>
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
                className={`tab ${activeTab === 'approved' ? 'active' : ''}`}
                onClick={() => setActiveTab('approved')}
              >
                Approved ({approvedArticles.length})
              </button>
            </div>
            <button onClick={loadFeeds} disabled={loading} className="btn-primary">
              {loading ? 'Loading...' : 'Refresh Feeds'}
            </button>
          </div>

          <div className="feed-list">
            {loading ? (
              <div className="loading">Loading feeds</div>
            ) : activeTab === 'all' ? (
              sortedItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-text">No feed items found.<br />Click "Refresh Feeds" to load.</div>
                </div>
              ) : (
                sortedItems.map((item) => (
                  <div key={item.id} className={`feed-item ${item.approved ? 'approved' : ''}`}>
                    <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                    <div className="feed-title">{item.title}</div>
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
                          className={`btn-approve ${item.approved ? 'approved' : ''}`}
                          onClick={() => toggleApproval(item)}
                        >
                          {item.approved ? 'Unapprove' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              approvedArticles.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✓</div>
                  <div className="empty-state-text">No approved articles yet.<br />Switch to "All Articles" tab to approve some.</div>
                </div>
              ) : (
                approvedArticles.map((item) => (
                  <div key={item.dbId || item.id} className="feed-item approved">
                    <span className={`feed-source ${item.source}`}>{item.sourceName}</span>
                    <div className="feed-title">{item.title}</div>
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
                            // Create a temporary item for unapproval
                            const tempItem = { ...item, id: item.dbId, approved: true };
                            toggleApproval(tempItem);
                          }}
                        >
                          Unapprove
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

        .feed-source {
          display: inline-block;
          padding: 6px 12px;
          background: #000000;
          color: white;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 12px;
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
          min-height: 200px;
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
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(139, 92, 246, 0.25);
        }

        .btn-ai:hover:not(:disabled) {
          background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
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
