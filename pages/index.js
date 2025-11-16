import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [feedItems, setFeedItems] = useState([]);
  const [approvedStories, setApprovedStories] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    // Load webhook URL from localStorage
    const saved = localStorage.getItem('webhookUrl');
    if (saved) setWebhookUrl(saved);
    
    // Load feeds on mount
    loadFeeds();
  }, []);

  useEffect(() => {
    // Save webhook URL to localStorage
    localStorage.setItem('webhookUrl', webhookUrl);
  }, [webhookUrl]);

  const showStatus = (message, duration = 3000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), duration);
  };

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/feeds');
      if (!response.ok) throw new Error('Failed to fetch feeds');
      
      const data = await response.json();
      const items = data.map((item, index) => ({
        ...item,
        id: Date.now() + index,
        approved: false
      }));
      
      setFeedItems(items);
      showStatus('✅ Feeds loaded successfully!');
    } catch (error) {
      console.error('Error loading feeds:', error);
      showStatus('❌ Error loading feeds');
    } finally {
      setLoading(false);
    }
  };

  const approveStory = async (item) => {
    const updatedItems = feedItems.map(i => 
      i.id === item.id ? { ...i, approved: true } : i
    );
    setFeedItems(updatedItems);

    if (webhookUrl.trim()) {
      try {
        showStatus('📤 Sending to webhook...');
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            description: item.description,
            link: item.link,
            source: item.sourceName,
            pubDate: item.pubDate
          })
        });

        if (response.ok) {
          const result = await response.json();
          setApprovedStories([{
            ...item,
            summary: result.summary || 'Summary received',
            approvedAt: new Date()
          }, ...approvedStories]);
          showStatus('✅ Story approved and summarized!');
        } else {
          throw new Error('Webhook failed');
        }
      } catch (error) {
        setApprovedStories([{
          ...item,
          summary: 'Webhook error: ' + error.message,
          approvedAt: new Date()
        }, ...approvedStories]);
        showStatus('✅ Story approved (webhook unavailable)');
      }
    } else {
      setApprovedStories([{
        ...item,
        summary: 'Configure webhook URL for automatic summarization',
        approvedAt: new Date()
      }, ...approvedStories]);
      showStatus('✅ Story approved');
    }
  };

  const clearApproved = () => {
    if (approvedStories.length === 0) {
      showStatus('No approved stories to clear');
      return;
    }
    if (confirm('Clear all approved stories?')) {
      setApprovedStories([]);
      setFeedItems(feedItems.map(i => ({ ...i, approved: false })));
      showStatus('🗑️ Approved stories cleared');
    }
  };

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
        <div className="feed-section">
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
            <div className="webhook-config">
              <label htmlFor="webhook-url">Webhook Configuration</label>
              <input
                id="webhook-url"
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="Enter n8n webhook URL for auto-summarization"
              />
            </div>
          </div>

          <div className="feed-controls">
            <button onClick={loadFeeds} disabled={loading} className="btn-primary">
              {loading ? 'Loading...' : 'Refresh Feeds'}
            </button>
            <button onClick={clearApproved} className="btn-secondary">Clear Approved</button>
          </div>

          <div className="feed-list">
            {loading ? (
              <div className="loading">Loading feeds</div>
            ) : sortedItems.length === 0 ? (
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
                        onClick={() => approveStory(item)}
                        disabled={item.approved}
                      >
                        {item.approved ? 'Approved' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="notes-section">
          <div className="notes-header">
            <h2>Approved Stories</h2>
            <p className="notes-subtitle">{approvedStories.length} {approvedStories.length === 1 ? 'story' : 'stories'} approved</p>
          </div>
          <div className="notes-content">
            {approvedStories.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-text">
                  No approved stories yet.<br />Click "Approve" on any story to add it here.
                </div>
              </div>
            ) : (
              approvedStories.map((story, index) => (
                <div key={index} className="note-item">
                  <div className="note-title">{story.title}</div>
                  <div className="note-summary">{story.summary}</div>
                  <div className="note-meta">
                    {story.sourceName} • Approved {formatDate(story.approvedAt)}
                  </div>
                </div>
              ))
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
        }

        .feed-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
        }

        .notes-section {
          width: 420px;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          border-left: 1px solid #e5e7eb;
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

        .webhook-config {
          margin-top: 0;
        }

        .webhook-config label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 8px;
          opacity: 0.9;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .webhook-config input {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.12);
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          backdrop-filter: blur(10px);
          transition: all 0.2s;
        }

        .webhook-config input::placeholder {
          color: rgba(255,255,255,0.6);
        }

        .webhook-config input:focus {
          outline: none;
          background: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.4);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.1);
        }

        .feed-controls {
          padding: 18px 32px;
          background: #ffffff;
          border-bottom: 1px solid #e1e8ed;
          display: flex;
          gap: 12px;
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
          background: #002855;
          color: white;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .feed-source.reuters {
          background: #d97706;
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
          background: #94a3b8;
          cursor: not-allowed;
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

        .note-item {
          background: white;
          border: 1px solid #e1e8ed;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0,40,85,0.06);
        }

        .note-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 12px;
          color: #0f172a;
          line-height: 1.5;
          letter-spacing: -0.1px;
        }

        .note-summary {
          font-size: 13px;
          color: #475569;
          line-height: 1.7;
          white-space: pre-wrap;
        }

        .note-meta {
          font-size: 12px;
          color: #64748b;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e1e8ed;
          font-weight: 500;
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
