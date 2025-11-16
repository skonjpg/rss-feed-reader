# RSS Feed Reader - Vercel Ready

A modern RSS feed reader for Bloomberg Tech and Reuters Technology with n8n webhook integration. **Fully ready to deploy on Vercel!**

## 🚀 Quick Deploy to Vercel

### Option 1: Deploy via Vercel Dashboard (Easiest)

1. **Create a GitHub repository** and push this code
2. **Go to [Vercel](https://vercel.com)**
3. **Click "Add New Project"**
4. **Import your GitHub repository**
5. **Click "Deploy"** - That's it! ✅

Vercel will automatically:
- Detect it's a Next.js app
- Install dependencies
- Build and deploy
- Give you a live URL (e.g., `your-app.vercel.app`)

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Navigate to project directory
cd rss-feed-app

# Deploy
vercel

# Follow the prompts and you're done!
```

## 🎯 Features

✅ **No CORS Issues** - Uses Next.js API routes (serverless functions)  
✅ **Vercel Ready** - Optimized for Vercel deployment  
✅ **RSS Feeds** - Bloomberg Tech & Reuters Technology  
✅ **n8n Webhook** - Automatic story summarization  
✅ **Modern UI** - Clean, responsive design  
✅ **LocalStorage** - Saves your webhook URL  

## 📁 Project Structure

```
rss-feed-app/
├── pages/
│   ├── index.js          # Main UI (React component)
│   └── api/
│       └── feeds.js      # API route (serverless function)
├── package.json          # Dependencies
├── vercel.json          # Vercel configuration
└── README.md            # This file
```

## 🔧 How It Works

1. **Frontend** (`pages/index.js`) - React component with the UI
2. **API Route** (`pages/api/feeds.js`) - Serverless function that fetches RSS feeds
3. **Deployment** - Vercel turns the API route into a serverless function automatically

The API route runs server-side, so there are **NO CORS issues**!

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser to http://localhost:3000
```

## 🌐 After Deployment

Once deployed, your app will be live at `https://your-app.vercel.app`

### Configure n8n Webhook

1. Enter your n8n webhook URL in the input field
2. Click "Approve" on any story
3. The story data will be sent to your webhook

**Webhook Payload:**
```json
{
  "title": "Article title",
  "description": "Article description",
  "link": "https://article-url.com",
  "source": "Bloomberg Tech or Reuters Technology",
  "pubDate": "2024-01-15T10:30:00Z"
}
```

**Expected Response:**
```json
{
  "summary": "Your AI-generated summary here"
}
```

## 📦 Dependencies

- `next` - React framework with serverless functions
- `react` & `react-dom` - UI library
- `rss-parser` - Parse RSS feeds server-side

## 🔒 Environment Variables

This app doesn't require any environment variables! Just deploy and it works.

## 🐛 Troubleshooting

### "Failed to fetch feeds"
- Make sure you're accessing the site via HTTPS (Vercel provides this automatically)
- Check Vercel function logs in your dashboard

### Webhook not working
- Verify your webhook URL is correct and accessible
- Ensure your n8n workflow is active
- Check that your webhook returns JSON with a `summary` field

## 📱 Mobile Responsive

The app works great on mobile devices too!

## 🎨 Customization

### Change Feed Sources

Edit `pages/api/feeds.js`:

```javascript
const FEEDS = {
  bloomberg: 'https://feeds.bloomberg.com/technology/news.rss',
  reuters: 'https://feeds.reuters.com/reuters/technologyNews',
  yourfeed: 'https://your-rss-feed-url.com/feed.rss' // Add more!
};
```

### Modify Styling

All styles are in `pages/index.js` inside the `<style jsx global>` tag.

## 📄 License

Free to use and modify!

---

## 🎉 That's It!

You now have a fully functional, deployable RSS feed reader with no CORS issues that works on Vercel!

**Live Preview:** After deployment, your app will look exactly like the local version but accessible from anywhere.
