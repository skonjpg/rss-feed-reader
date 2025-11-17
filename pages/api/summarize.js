const WEBHOOK_URL = 'https://edgewater.app.n8n.cloud/webhook/4e0da20e-9a6a-4b3d-9d27-d4a73ab54cda';

// Helper function to extract clean text from complex nested structures
function extractCleanText(data) {
  // Handle null/undefined
  if (!data) return '';

  // If it's a string, return it
  if (typeof data === 'string') return data;

  // If it's an array, process each item
  if (Array.isArray(data)) {
    return data.map(item => {
      // Handle objects with type/text structure like [{"type":"text","text":"..."}]
      if (item && typeof item === 'object') {
        if (item.text) return item.text;
        if (item.content) return extractCleanText(item.content);
        if (item.value) return item.value;
      }
      // Handle plain strings in array
      if (typeof item === 'string') return item;
      return '';
    }).filter(Boolean).join(' ');
  }

  // If it's an object, try to extract text
  if (typeof data === 'object') {
    // Check common text fields
    if (data.text) return extractCleanText(data.text);
    if (data.content) return extractCleanText(data.content);
    if (data.message) return extractCleanText(data.message);
    if (data.summary) return extractCleanText(data.summary);
    if (data.output) return extractCleanText(data.output);
    if (data.response) return extractCleanText(data.response);
    if (data.value) return extractCleanText(data.value);

    // Check for nested data
    if (data.data) return extractCleanText(data.data);
  }

  // Fallback - return empty string instead of JSON
  return '';
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notes } = req.body;

    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    console.log('Sending notes to webhook...');

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: notes,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Webhook response:', JSON.stringify(result, null, 2));

    // Extract clean text from the response
    let summaryText = extractCleanText(result);

    // If we couldn't extract anything, provide a helpful message
    if (!summaryText || summaryText.trim().length === 0) {
      summaryText = 'No summary text could be extracted from the response.';
      console.warn('Could not extract text from webhook response:', result);
    }

    console.log('Extracted summary:', summaryText);

    res.status(200).json({ summary: summaryText });
  } catch (error) {
    console.error('Error in summarize API:', error);
    res.status(500).json({ error: error.message || 'Failed to generate summary' });
  }
}
