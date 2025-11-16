# 🚀 Vercel Deployment Guide - Step by Step

## Prerequisites
- A GitHub account
- A Vercel account (free) - sign up at https://vercel.com

## Method 1: Deploy via GitHub (Recommended)

### Step 1: Create GitHub Repository

1. Go to https://github.com and click "New repository"
2. Name it something like `rss-feed-reader`
3. Make it Public or Private (your choice)
4. Click "Create repository"

### Step 2: Push Your Code to GitHub

Open your terminal in the `rss-feed-app` folder and run:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - RSS Feed Reader"

# Add your GitHub repository as remote
# Replace YOUR_USERNAME and YOUR_REPO with your actual GitHub username and repo name
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 3: Deploy on Vercel

1. Go to https://vercel.com and sign in
2. Click "Add New..." → "Project"
3. Click "Import" next to your GitHub repository
4. Vercel will auto-detect it's a Next.js project
5. Click "Deploy"
6. Wait 1-2 minutes for deployment to complete
7. You'll get a live URL like `https://rss-feed-reader-abc123.vercel.app`

**That's it!** Your site is live! 🎉

### Step 4: Test Your Deployment

1. Visit your Vercel URL
2. Click "Refresh Feeds"
3. You should see RSS articles from Bloomberg and Reuters
4. No CORS errors!

## Method 2: Deploy via Vercel CLI

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Navigate to Project

```bash
cd rss-feed-app
```

### Step 3: Deploy

```bash
vercel
```

Follow the prompts:
- "Set up and deploy?" → Yes
- "Which scope?" → Select your account
- "Link to existing project?" → No
- "What's your project's name?" → rss-feed-reader (or your choice)
- "In which directory is your code located?" → ./

Vercel will build and deploy. You'll get a URL immediately!

### Step 4: Deploy to Production

```bash
vercel --prod
```

This deploys to your production domain.

## Method 3: Drag and Drop (Simplest)

1. Zip your `rss-feed-app` folder
2. Go to https://vercel.com
3. Drag and drop the ZIP file onto the Vercel dashboard
4. Vercel will deploy it automatically!

## After Deployment

### Set Up Custom Domain (Optional)

1. Go to your project in Vercel dashboard
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions

### Configure n8n Webhook

1. Visit your deployed site
2. Enter your n8n webhook URL in the input field
3. Click any "Approve" button to test
4. Check your n8n workflow to see the data arrive!

## Common Issues & Solutions

### Issue: "Build failed"
**Solution:** Make sure all dependencies are in `package.json`

### Issue: "API route not working"
**Solution:** 
- Check the API route is in `pages/api/feeds.js`
- Verify the route at `https://your-site.vercel.app/api/feeds`

### Issue: "No feeds showing"
**Solution:**
- Click "Refresh Feeds" button
- Check browser console for errors
- Verify the API route is responding

### Issue: "Environment variables needed"
**Solution:** This app doesn't need any! It should work out of the box.

## Updating Your Deployment

### If using GitHub:
1. Make changes to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Updated features"
   git push
   ```
3. Vercel automatically redeploys! (takes 1-2 minutes)

### If using Vercel CLI:
```bash
vercel --prod
```

## Monitoring Your App

1. Go to Vercel dashboard
2. Click on your project
3. View:
   - Deployment history
   - Analytics
   - Function logs (for debugging API routes)
   - Performance metrics

## Testing the API Route Directly

Visit: `https://your-site.vercel.app/api/feeds`

You should see JSON with RSS feed items.

## 🎉 Success!

Your RSS feed reader is now:
- ✅ Live on the internet
- ✅ No CORS issues
- ✅ Serverless (auto-scales)
- ✅ Free hosting (Vercel free tier)
- ✅ HTTPS enabled
- ✅ Fast global CDN

Enjoy your live RSS feed reader!
