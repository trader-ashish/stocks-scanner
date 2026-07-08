# Stock Scanner - Firebase Database + Render Hosting

This version of the Stock Scanner is rebuilt to run as a **dual-mode standalone Express server**. It combines the best of both worlds for a **100% Free, Cardless Setup**:
* **Database:** Google Firebase Firestore (runs on the free **Spark Plan** - No credit card required).
* **Hosting (Backend & Frontend):** Render.com (runs on the free web service tier - No credit card required, and allows outbound requests for live index scraping).

---

## How to Test Locally on Port 4000
1. Open the folder `d:/Stocks_scanner_firebase`.
2. Double-click the **`deploy.bat`** file.
3. Press **`2`** to start the local Express server.
4. Open your browser and go to: `http://localhost:4000`
*(This will run without conflicting with your other project on port 3000!)*

---

## How to Deploy Online (To access from your Phone/Anywhere)

### Step 1: Initialize Git Repository
1. Double-click the **`deploy.bat`** file.
2. Press **`3`** to initialize Git and commit the files.

### Step 2: Push to GitHub
1. Go to your [GitHub](https://github.com/) account and create a new public or private repository (e.g. `nifty-stocks-scanner`).
2. Open PowerShell in `d:/Stocks_scanner_firebase` and run:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy on Render.com
1. Go to [Render.com](https://render.com/) and log in (Create a free account using your GitHub account).
2. Click **New +** and select **Web Service**.
3. Connect your newly created GitHub repository (`nifty-stocks-scanner`).
4. Set the following settings:
   * **Name:** `my-nifty-scanner` (or whatever you like)
   * **Region:** Choose the closest one (e.g., Singapore or Oregon)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install && cd functions && npm install`
   * **Start Command:** `node functions/index.js`
   * **Instance Type:** `Free`
5. Click **Deploy Web Service**.

Once the build finishes (usually takes 1-2 minutes), Render will give you a public URL (e.g., `https://my-nifty-scanner.onrender.com`).

**Open that link on your phone, laptop, or anywhere, and your Stock Scanner is live!**
