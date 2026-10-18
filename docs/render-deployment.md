# Render Deployment Guide / Render पर Deploy कैसे करें

This guide explains how to deploy the **Yashaswi MoU Management System** on [Render.com](https://render.com).

The application consists of 3 components:
1. **PostgreSQL Database**
2. **Backend API Web Service** (Express Node.js / Docker)
3. **Frontend Web App** (Vite React SPA / Static Site)

---

## 🚀 Quick Step-by-Step Deployment (Free Tier)

### Step 1: Push code to your GitHub (Already Done! ✅)
Your code is ready on [github.com/anishs-k/ysf-mou-mng-system](https://github.com/anishs-k/ysf-mou-mng-system).

---

### Step 2: Create PostgreSQL Database on Render
1. Open [dashboard.render.com](https://dashboard.render.com) and log in.
2. Click **New +** > **PostgreSQL**.
3. Fill details:
   - **Name:** `ysf-mou-db`
   - **Database:** `mou_mng_system`
   - **User:** `postgres`
   - **Region:** Choose closest (e.g., Singapore / Frankfurt)
   - **Plan:** Free
4. Click **Create Database**.
5. Once created, copy the **Internal Database URL** (or External Database URL if deploying frontend/api separately).

---

### Step 3: Create Backend Web Service (`@mou/api`)
1. Click **New +** > **Web Service**.
2. Connect your GitHub repository: `anishs-k/ysf-mou-mng-system`.
3. Configure the service:
   - **Name:** `ysf-mou-api`
   - **Region:** Same as database
   - **Branch:** `master`
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `src/api/Dockerfile`
   - **Docker Context:** `.` (root directory)
   - **Instance Type:** `Free`
4. Expand **Advanced** > **Environment Variables** and add:
   | Key | Value | Description |
   |---|---|---|
   | `DATABASE_URL` | *(Paste Internal Database URL from Step 2)* | Postgres connection string |
   | `ADMIN_USERNAME` | `admin` | Initial admin username |
   | `ADMIN_EMAIL` | `admin@ysf.com` | Initial admin email |
   | `ADMIN_PASSWORD` | *(Set a strong password)* | Initial admin login password |
   | `SESSION_COOKIE_SAMESITE` | `none` | Required for cross-domain cookie on Render |
   | `WEB_ORIGIN` | `https://ysf-mou-web.onrender.com` | (Update after creating Frontend in Step 4) |
   | `NODE_ENV` | `production` | Production mode |
5. Click **Create Web Service**.
6. The container will automatically:
   - Run migrations (`node dist/db/migrate.js`)
   - Seed initial zones and admin user (`node dist/db/seed/index.js`)
   - Start the server on the assigned port.
7. Copy your API service URL once deployed (e.g., `https://ysf-mou-api.onrender.com`).

---

### Step 4: Create Frontend (`@mou/web`) as a Static Site (100% Free & Fast)
Render Static Sites are **100% free**, served via Global CDN, and never spin down!

1. Click **New +** > **Static Site**.
2. Connect your GitHub repository: `anishs-k/ysf-mou-mng-system`.
3. Configure:
   - **Name:** `ysf-mou-web`
   - **Branch:** `master`
   - **Build Command:**
     ```bash
     npm ci && npm run build --workspace=@mou/domain && npm run build --workspace=@mou/web
     ```
   - **Publish Directory:**
     ```bash
     src/web/dist
     ```
4. Expand **Advanced** > **Environment Variables**:
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://ysf-mou-api.onrender.com` *(Your API URL from Step 3)* |
5. In **Redirects / Rewrites** tab:
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`
   *(This ensures client-side routing like `/login`, `/dashboard`, etc. work without 404 errors)*
6. Click **Create Static Site**.

---

### Step 5: Link Frontend URL to Backend CORS
1. Copy your newly created Frontend URL (e.g., `https://ysf-mou-web.onrender.com`).
2. Go back to your Backend Web Service (`ysf-mou-api`) on Render.
3. Go to **Environment** tab.
4. Set or update `WEB_ORIGIN`:
   ```
   WEB_ORIGIN = https://ysf-mou-web.onrender.com
   ```
5. Click **Save Changes** (Render will automatically re-deploy the API with the updated origin).

---

## 🔑 Default Login Credentials
Once both services are deployed, open your frontend URL:
- **Username:** `admin` (or whatever set in `ADMIN_USERNAME`)
- **Password:** The password you set in `ADMIN_PASSWORD`
