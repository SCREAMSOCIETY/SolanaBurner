# Deploy Solburnt to Render.com

## 📋 Prerequisites

1. GitHub account with your Solburnt repository
2. Render.com account (free tier works!)
3. Your API keys ready:
   - `HELIUS_API_KEY`
   - `QUICKNODE_RPC_URL`
   - `SOLSCAN_API_KEY`

---

## 🚀 Step-by-Step Deployment

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Click "Get Started" or "Sign Up"
3. Sign up with your GitHub account (recommended)

### Step 2: Connect GitHub Repository
1. Once logged in, click "New +" → "Web Service"
2. Click "Connect account" to link your GitHub
3. Find and select your Solburnt repository
4. Click "Connect"

### Step 3: Configure Service
Render will auto-detect your `render.yaml` file. Verify these settings:

**Basic Settings:**
- **Name:** `solburnt` (or your preferred name)
- **Region:** Oregon (or closest to your users)
- **Branch:** `main` (or `next` if you prefer)
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

**Advanced Settings:**
- **Health Check Path:** `/health`
- **Auto-Deploy:** Yes (deploys automatically on git push)

### Step 4: Add Environment Variables
Click "Advanced" → "Add Environment Variable" and add these **three secrets**:

1. **HELIUS_API_KEY**
   - Value: [Your Helius API key]

2. **QUICKNODE_RPC_URL**
   - Value: [Your QuickNode RPC endpoint]

3. **SOLSCAN_API_KEY**
   - Value: [Your Solscan API key]

> **Important:** Don't forget to add these! The app won't work without them.

### Step 5: Deploy!
1. Click "Create Web Service"
2. Render will start building your app
3. Watch the build logs (takes 3-5 minutes first time)
4. Wait for "Your service is live" message

---

## 🌐 After Deployment

### Your Live URL
Render will give you a URL like: `https://solburnt.onrender.com`

### Update DNS for solburnt.com
1. Go to your domain registrar (e.g., Cloudflare)
2. Add a CNAME record:
   - **Name:** `@` or `solburnt`
   - **Target:** `solburnt.onrender.com` (your Render URL)
3. Wait for DNS to propagate (5-30 minutes)

### Custom Domain on Render
1. In Render dashboard, go to your service
2. Click "Settings" → "Custom Domains"
3. Click "Add Custom Domain"
4. Enter `solburnt.com`
5. Follow Render's instructions to verify domain

---

## ✅ Verify Deployment

Visit these URLs to confirm everything works:

- **Health Check:** `https://solburnt.onrender.com/health`
  - Should return: `{"status":"ok","timestamp":"...","uptime":...}`

- **Main Site:** `https://solburnt.onrender.com`
  - Should load your Solburnt app

---

## 🔄 Auto-Deploy

Every time you push to GitHub `main` branch:
1. Render automatically detects the change
2. Runs `npm install && npm run build`
3. Restarts with `npm start`
4. Your site updates in ~3-5 minutes

---

## 💰 Pricing

**Free Tier:**
- 750 hours/month free
- App sleeps after 15 min of inactivity
- ~30 second cold start when waking up

**Paid Tier ($7/month):**
- Always-on (no sleeping)
- Instant response times
- Better for production

Start with free tier, upgrade if you get traffic!

---

## 🐛 Troubleshooting

### Build Fails
- Check build logs for errors
- Verify `package.json` has all dependencies
- Make sure Node.js version >= 18

### App Won't Start
- Check environment variables are set
- Verify health check at `/health` returns 200 OK
- Check start logs for errors

### Still Issues?
- Read build logs carefully
- Check Render's status page
- Contact Render support (very responsive!)

---

## 📝 Next Steps

After successful deployment:
1. ✅ Test all features (wallet connect, burning, etc.)
2. ✅ Monitor logs for errors
3. ✅ Set up custom domain
4. ✅ Consider upgrading to paid tier for production
5. ✅ Purge Cloudflare cache if using CDN
