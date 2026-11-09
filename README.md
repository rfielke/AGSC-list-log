# AGSC Surgical List Log (phone web app)

An offline phone app for logging each operating list at the end of the session. Everything is stored on the phone (in the browser's IndexedDB). Nothing is sent anywhere.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The app's single screen: Log, Summary, Lists and Data tabs |
| `app.js` | Form, storage, summary, CSV export, backup and restore |
| `styles.css` | Look and dark mode |
| `sw.js` | Service worker: caches the app so it opens with no signal |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |

## Putting it online (once)

The app has to be served over HTTPS before an iPhone will install it. It holds no patient data, so any static host works:

- **GitHub Pages**: put these files in a repository, then Settings → Pages → deploy from the main branch.
- **Netlify or Cloudflare Pages**: drag this folder onto the site's deploy page.

## Installing on the iPhone

1. Open the app's web address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the home-screen icon from then on. Data saved in the installed app stays separate from Safari tabs.

## Using it

- **Log**: fill in at the end of the list. Use the **Now** buttons for the times.
- **Summary**: list time used, late starts, on-day cancellations, robotic share, gap-cap cases and day cases, over 90 days, 6 months, 12 months or all time.
- **Data**: **Export CSV** for the 6-monthly review. **Save backup** writes a JSON file; keep it in iCloud Drive. **Restore backup** merges a backup back in, keeping the newer copy of each list.

The app reminds you on the Log tab when there is no backup or the last one is more than 30 days old.

## Updating the app

After changing any file, raise `VERSION` in `sw.js` (and in `app.js`) so phones pick up the new version the next time they open it online. Data is not affected.
