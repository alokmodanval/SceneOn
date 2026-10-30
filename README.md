# ⚡ SceneOn (by Tools4Genz)

> **"Aaj ka scene kya hai? Zero-Login Vibe Matching & Live Voice Scenes."**  
> Target Production Domain: `scene.tools4genz.com`  
> 100% Free Forever • Zero-Login Architecture • WebRTC Audio Mesh • Web Audio API Voice Filters

---

## ☁️ Cloudflare Pages Production Deployment (Primary)

Cloudflare Pages is the ideal host for SceneOn: **100% Free Forever, Unlimited Bandwidth, Global Edge CDN, and Instant Automatic SSL**.

### Method 1: Git-Connected Deploy (Recommended)
1. Push this repository to GitHub/GitLab.
2. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages > Create application > Pages > Connect to Git**.
3. Select your repository.
4. Set Build Settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variables (Optional):**
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
5. Click **Save and Deploy**. Cloudflare will build and serve your app globally.

### Method 2: Instant CLI Deploy with Wrangler
If you prefer deploying directly from your terminal:
```bash
# 1. Build the production bundle
npm run build

# 2. Deploy directly to Cloudflare Pages
npx wrangler pages deploy dist --project-name=sceneon
```

---

## 🌐 Connecting `scene.tools4genz.com` on Cloudflare

If `tools4genz.com` is already managed in your Cloudflare account:
1. In Cloudflare Pages, go to your project (`sceneon`) -> **Custom domains** tab.
2. Click **Set up a custom domain**.
3. Type `scene.tools4genz.com` and click **Continue**.
4. Cloudflare will automatically detect the DNS zone for `tools4genz.com` and create the CNAME record for you with **zero manual configuration**!
5. Within 30 seconds, your app will be live at:
   👉 **`https://scene.tools4genz.com`**

*(If `tools4genz.com` DNS is managed elsewhere like GoDaddy or Namecheap, Cloudflare will display a CNAME target like `<project-name>.pages.dev` to paste into your DNS provider's records).*

---

## 🗄️ Supabase Setup (Optional for cloud sync)

SceneOn operates immediately in **Zero-Cost Local P2P Mode** with realistic interactive rooms and active seed profiles even without Supabase! To sync globally:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard and run `supabase/schema.sql`.
3. Add your credentials in `.env` (or in Cloudflare Pages Environment Variables):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
4. SceneOn will automatically connect and publish realtime updates!

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Test production build
npm run build
```
