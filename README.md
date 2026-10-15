# Announcement Bar for EmDash

A bar at the top or bottom of every page with a message and a link. Start and end dates, close button, your colours.

- **One message, one link**: write it in the admin, switch it on, done. Changes reach the site within a minute.
- **Schedule**: show from a date, until a date, or both. Perfect for sales and holiday notices.
- **Close button**: visitors can dismiss it, and the choice sticks on that device until the message changes.
- **Your colours**: background and text as hex codes. Top or bottom, optionally sticky. Every page, home page only, or one section of the site.

One-time setup: paste the short block from the Setup tab into the head of your base layout.

Built by DesiDash Lab. MIT licensed.

## Development

```
pnpm install
pnpm test
pnpm build
```

`src/visitor-script.js` is the code that runs on the site. `scripts/embed.mjs` embeds it into the plugin before build and test.
