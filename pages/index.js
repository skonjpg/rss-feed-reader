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
        <title>RSS Feed Reader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {statusMessage && (
        <div className="status-message show">{statusMessage}</div>
      )}

      <div className="container">
        <div className="feed-section">
          <div className="header">
            <h1>📰 RSS Feed Reader</h1>
            <div className="webhook-config">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="Enter n8n webhook URL for auto-summarization"
              />
            </div>
          </div>

          <div className="feed-controls">
            <button onClick={loadFeeds} disabled={loading}>
              🔄 {loading ? 'Loading...' : 'Refresh Feeds'}
            </button>
            <button onClick={clearApproved}>🗑️ Clear Approved</button>
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
                        🔗 Visit
                      </button>
                      <button
                        className={`btn-approve ${item.approved ? 'approved' : ''}`}
                        onClick={() => approveStory(item)}
                        disabled={item.approved}
                      >
                        {item.approved ? '✓ Approved' : '✓ Approve'}
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
            <h2>✅ Approved Stories</h2>
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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #ffffff;
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
          padding: 24px 28px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .header h1 {
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        }

        .webhook-config {
          margin-top: 12px;
        }

        .webhook-config input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.15);
          color: white;
          border-radius: 6px;
          font-size: 13px;
          backdrop-filter: blur(10px);
          transition: all 0.2s;
        }

        .webhook-config input::placeholder {
          color: rgba(255,255,255,0.7);
        }

        .webhook-config input:focus {
          outline: none;
          background: rgba(255,255,255,0.25);
          border-color: rgba(255,255,255,0.5);
        }

        .feed-controls {
          padding: 16px 28px;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          gap: 10px;
        }

        .feed-controls button {
          padding: 9px 18px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .feed-controls button:hover:not(:disabled) {
          background: #5568d3;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transform: translateY(-1px);
        }

        .feed-controls button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .feed-list {
          flex: 1;
          overflow-y: auto;
          padding: 20px 28px;
        }

        .feed-list::-webkit-scrollbar {
          width: 8px;
        }

        .feed-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .feed-list::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }

        .feed-item {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 16px;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }

        .feed-item:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          border-color: #667eea;
          transform: translateY(-2px);
        }

        .feed-item.approved {
          border-left: 4px solid #10b981;
          background: #f0fdf4;
        }

        .feed-source {
          display: inline-block;
          padding: 5px 10px;
          background: #667eea;
          color: white;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 10px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .feed-source.reuters {
          background: #f97316;
        }

        .feed-title {
          font-size: 17px;
          font-weight: 600;
          margin-bottom: 10px;
          color: #111827;
          line-height: 1.4;
        }

        .feed-description {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 10px;
          line-height: 1.6;
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
          padding: 7px 14px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-approve:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-1px);
        }

        .btn-approve.approved {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .btn-visit {
          padding: 7px 14px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-visit:hover {
          background: #2563eb;
          transform: translateY(-1px);
        }

        .notes-header {
          padding: 24px 28px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .notes-header h2 {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .notes-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px 28px;
        }

        .notes-content::-webkit-scrollbar {
          width: 8px;
        }

        .notes-content::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }

        .note-item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 18px;
          margin-bottom: 14px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }

        .note-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 10px;
          color: #111827;
          line-height: 1.4;
        }

        .note-summary {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .note-meta {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #f3f4f6;
          font-weight: 500;
        }

        .loading {
          text-align: center;
          padding: 60px 20px;
          color: #9ca3af;
          font-size: 15px;
        }

        .loading::before {
          content: "⏳ ";
          font-size: 24px;
          display: block;
          margin-bottom: 10px;
        }

        .status-message {
          position: fixed;
          top: 24px;
          right: 24px;
          padding: 14px 22px;
          background: #10b981;
          color: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 1000;
          font-weight: 500;
          font-size: 14px;
        }

        .status-message.show {
          opacity: 1;
        }

        .empty-state {
          text-align: center;
          padding: 60px 40px;
          color: #9ca3af;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state-text {
          font-size: 15px;
          line-height: 1.6;
        }
      `}</style>
    </>
  );
}
