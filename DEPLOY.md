You can deploy this application for **100% FREE** using **Vercel** or **Netlify**. 
Both services offer generous "Hobby" tiers that are perfect for personal business tools. You will **NOT** be charged.

## Option 1: Vercel (Recommended)

1.  **Create a GitHub Repository**:
    *   Initialize a git repo in this folder if you haven't already:
        ```bash
        git init
        git add .
        git commit -m "Initial commit"
        ```
    *   Push this code to your GitHub account (create a new private repo called `vishnu-business`).

2.  **Deploy on Vercel**:
    *   Go to [vercel.com](https://vercel.com) and sign up/login.
    *   Click "Add New..." -> "Project".
    *   Import your `vishnu-business` repository.
    *   **Environment Variables**:
        *   In the "Environment Variables" section, add the values from your `.env` file:
            *   `VITE_SUPABASE_URL`: (Your URL)
            *   `VITE_SUPABASE_ANON_KEY`: (Your Key)
    *   Click **Deploy**.

3.  **Done!**
    *   Vercel will give you a public URL. Share this link to open the app on your mobile easily.

## Option 2: Netlify (Drag & Drop)

1.  **Build the Project**:
    *   Run this command in your terminal:
        ```bash
        npm run build
        ```
    *   This will create a `dist` folder.

2.  **Deploy**:
    *   Go to [app.netlify.com/drop](https://app.netlify.com/drop).
    *   Drag and drop the `dist` folder onto the page.
    *   **Important**: Netlify might not handle "Environment Variables" automatically with drag-and-drop. You might need to create a `_redirects` file or duplicate `.env` logic manually, so Option 1 is safer.

For best results, use **Vercel**.
