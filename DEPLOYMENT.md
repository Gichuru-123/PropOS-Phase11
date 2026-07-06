# PropOS Deployment Guide

## Deploy to Netlify

### Option 1: Drag & Drop (Easiest)

1. Go to [app.netlify.com](https://app.netlify.com)
2. Sign in or create an account
3. Click "Add new site" → "Deploy manually"
4. Drag and drop the entire `PropOS-Phase11` folder into the upload area
5. Wait for deployment to complete
6. Your site will be live at a random Netlify URL (e.g., `https://random-name.netlify.app`)

### Option 2: Git Integration (Recommended)

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [app.netlify.com](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect your Git provider
5. Select the repository
6. Configure build settings:
   - **Build command**: (leave empty)
   - **Publish directory**: `.`
   - **Branch**: `main` or `master`
7. Click "Deploy site"

### Option 3: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize
cd "c:\Users\hp\Desktop\Application Docs\PropOS-Phase11"
netlify init

# Deploy
netlify deploy --prod
```

## Post-Deployment Checklist

### Firebase Configuration
- [ ] Ensure Firebase config in `js/firebase-config.js` is correct
- [ ] Firestore rules allow read/write for authenticated users
- [ ] Storage rules allow read/write for authenticated users
- [ ] CORS is configured for Firebase Storage (if using documents)

### Domain Configuration (Optional)
- [ ] Add custom domain in Netlify settings
- [ ] Update DNS records at domain registrar
- [ ] Enable HTTPS (automatic on Netlify)

### Environment Variables (Optional)
If you need environment variables:
1. Go to Site settings → Environment variables
2. Add any required variables
3. Redeploy the site

## Firebase Storage CORS Fix

If documents upload fails with CORS error:

1. Create a file named `cors.json`:
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

2. Install gsutil and run:
```bash
gsutil cors set cors.json gs://propos-app-55227.firebasestorage.app
```

Or configure in Firebase Console:
1. Go to Firebase Console → Storage → Rules
2. Update rules to allow your domain

## Testing After Deployment

- [ ] Open the deployed URL
- [ ] Test login functionality
- [ ] Test all core features
- [ ] Test document upload (if enabled)
- [ ] Test on mobile devices
- [ ] Check browser console for errors

## Troubleshooting

### 404 Errors
- Ensure `netlify.toml` is in the root directory
- Check redirect rules in `netlify.toml`

### Firebase Connection Issues
- Verify Firebase config is correct
- Check Firebase Console for any service suspensions
- Ensure authentication is enabled in Firebase Console

### Documents Not Uploading
- Check Firebase Storage CORS configuration
- Verify Storage rules allow uploads
- Check browser console for specific error messages

### Build Failures
- Check Netlify deploy logs
- Ensure all files are included in the deployment
- Verify no syntax errors in JavaScript files

## Production Considerations

### Security
- [ ] Enable Firebase Authentication with strong passwords
- [ ] Review Firestore security rules
- [ ] Review Storage security rules
- [ ] Enable 2FA on Firebase account
- [ ] Regular backups of Firebase data

### Performance
- [ ] Monitor Firebase usage
- [ ] Optimize large queries
- [ ] Consider Firebase index for complex queries

### Monitoring
- [ ] Set up Firebase Crashlytics (optional)
- [ ] Monitor Firebase Analytics (optional)
- [ ] Check Netlify analytics
