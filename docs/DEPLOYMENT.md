# 🚀 LibraryOS Zero-Cost Deployment Guide

Follow these exact steps to get your project live on the internet for free using **Aiven** (Database), **Render** (Backend), and **Vercel** (Frontend).

---

## Step 1: Set Up Your Free Database (Aiven)
1. Go to [Aiven.io](https://aiven.io) and sign up for a free account.
2. Click **Create Service** and select **MySQL** (make sure you pick the "Free Plan").
3. Once the database provisions, look for your **Connection Parameters**:
   - `Host`
   - `Port`
   - `User`
   - `Password`
   - `Database Name` (Usually `defaultdb`)
4. Construct your **DB_URL** in this exact format:
   `jdbc:mysql://<Host>:<Port>/<Database Name>?ssl-mode=REQUIRED`

> [!IMPORTANT]
> Save this `DB_URL`, `User`, and `Password`. You will need them in Step 2.

---

## Step 2: Set Up Google OAuth (Google Cloud Console)
1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Go to **APIs & Services > Credentials** and create an **OAuth Client ID**.
3. Under **Authorized redirect URIs**, you need to add your future Render URL. If you don't know it yet, you can use a placeholder and come back here later, but it will look like: 
   `https://YOUR_RENDER_APP_NAME.onrender.com/login/oauth2/code/google`
4. Copy the **Client ID** and **Client Secret**.

---

## Step 3: Deploy the Backend (Render)
1. Go to [Render.com](https://render.com) and create a free account.
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub account and select your `Library-management-system` repository.
4. Render will automatically detect the `render.yaml` file in your repository and prompt you to fill in Environment Variables.
5. Fill them in:
   - `DB_URL`: The URL you created in Step 1.
   - `DB_USERNAME`: Your Aiven user.
   - `DB_PASSWORD`: Your Aiven password.
   - `JWT_SECRET`: A random long string (e.g., `my-super-secret-jwt-key-that-is-very-long`).
   - `GOOGLE_CLIENT_ID`: From Step 2.
   - `GOOGLE_CLIENT_SECRET`: From Step 2.
   - `FRONTEND_URL`: Put `https://your-future-vercel-url.vercel.app` (you can update this later once Vercel gives you a URL).
6. Click **Apply**. Render will automatically build the Docker container and start the Spring Boot app. Flyway will automatically run your migrations!
7. **Copy the backend URL** Render gives you (e.g., `https://library-api-123.onrender.com`).

---

## Step 4: Deploy the Frontend (Vercel)
1. Go to [Vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New > Project** and select your `Library-management-system` repository.
3. Vercel will automatically detect that it is a Next.js app.
4. Open the **Environment Variables** section before hitting deploy.
5. Add the following variable:
   - Name: `BACKEND_API_URL`
   - Value: The URL you copied from Render (e.g., `https://library-api-123.onrender.com`)
6. Click **Deploy**. Vercel will build the frontend.
7. **Copy the frontend URL** Vercel gives you.

---

## Step 5: The Final Connection
1. Go back to **Render > Dashboard > Environment Variables**.
2. Update the `FRONTEND_URL` variable to exactly match your new Vercel URL. (This tells Spring Boot to allow CORS traffic from your Vercel site).
3. Restart the Render web service.

> [!TIP]
> **You're Done!** Visit your Vercel URL. You can now register, log in with Google, and use the entire application completely free of charge!
