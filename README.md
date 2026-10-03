# Muhammad Umar Abbas — Portfolio

A responsive, single-page personal portfolio built with semantic HTML, plain CSS, and a small inline vanilla JavaScript snippet. There are no frameworks, build tools, or runtime data requests. Google Fonts are the only external design dependency; system fallbacks are provided.

## Preview locally

Open `index.html` directly in a modern browser. All page content is hardcoded into the HTML, so it also works without a server. The Email me button opens the visitor's default email app; it does not send data to a server.

## Customize content

`resume.json` is the source of truth for portfolio content, but the browser does not load it. When `resume.json` changes, update the corresponding hardcoded text, links, dates, and lists in `index.html` as well.

Use the `EDIT` comments in `index.html` as a checklist for remaining personal assets and information:

- Replace the profile-photo placeholder with a personal image at `assets/images/profile.jpg` and update its markup.
- Add your resume PDF at `assets/images/resume.pdf` and enable the disabled hero download button.
- Add the Projects navigation link and section when you have real projects to share. Use sanitized QA artifacts (for example, a sample test plan or bug report template); do not include confidential employer details.
- Replace the `YYYY-MM` work start-date note with the actual start date when known.
- Replace the example canonical and Open Graph URLs with the deployed site URL, and add a public 1200x630 social preview image.

The Projects section is intentionally hidden until real projects are available. The canonical and Open Graph URLs and social image are placeholders until deployment.

## Customize colors and fonts

Edit the custom properties in `:root` at the top of `css/style.css` to change the palette, typefaces, spacing, radii, and content width. The dark palette is the default. The `prefers-color-scheme: light` block provides the light palette; the visitor's system preference selects the theme automatically.

Responsive layout rules are in `css/responsive.css`. Keep focus-visible styles and the reduced-motion override when adjusting effects.

## Deploy to GitHub Pages

1. Create a GitHub repository and add the portfolio files while preserving the folder structure.
2. Push the files to the repository's default branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**, choose the default branch and `/ (root)`, then save.
5. After GitHub Pages finishes publishing, open the URL shown in the Pages settings.

No compilation or dependency installation is needed. If a custom domain is used, configure it in the Pages settings and add the appropriate DNS records with the domain provider.
