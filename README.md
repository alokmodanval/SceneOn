# ⚡ FriendsClub (by Tools4Genz)

> **"Aaj ka scene kya hai? Zero-Login Vibe Matching & Live Voice Pods."**  
> Target Production Domain: `friendsclub.tools4genz.com`  
> 100% Free Forever • Zero-Login Architecture • WebRTC Audio Mesh • Web Audio API Voice Filters

---

## ☁️ Cloudflare Pages Production Deployment

### Method 1: Git-Connected Deploy (Recommended)
1. Push this repository to GitHub/GitLab.
2. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages > Create application > Pages > Connect to Git**.
3. Select your repository.
4. Set Build Settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**.

### Method 2: Instant CLI Deploy with Wrangler
```bash
# 1. Build the production bundle
npm run build

# 2. Deploy directly to Cloudflare Pages
npx wrangler pages deploy dist --project-name=friendsclub
```

---

## 🌐 Connecting `friendsclub.tools4genz.com` on Cloudflare

1. In Cloudflare Pages, go to your project (`friendsclub`) -> **Custom domains** tab.
2. Click **Set up a custom domain**.
3. Type `friendsclub.tools4genz.com` and click **Continue**.
4. Click **Activate domain**. Cloudflare will automatically configure DNS and issue SSL!
5. Your app is live at:
   👉 **`https://friendsclub.tools4genz.com`**

---

## 💻 Local Development

```bash
# Run local development server
npm run dev

# Test production build
npm run build
```
