# Joboo — concept sites

Public preview of concept websites built for independent restaurants.

**These are unofficial concept previews.** Each page shows one restaurant owner
what a website for them could look like. It is not their live website and is not
affiliated with them. Photos are Unsplash stock unless the site states otherwise;
menus and prices are illustrative placeholders.

If you run one of the restaurants listed here and want your page removed, open an
issue or email and it comes down the same day.

## What's here

- `index.html` — links to every preview
- `<business-slug>/index.html` — one site's preview

## Running it

GitHub Pages serves the `main` branch root. After the first push:

    gh api -X POST repos/:owner/:repo/pages \
      -f source[branch]=main -f source[path]=/

Then the previews are at `https://<user>.github.io/joboo-sites/`.

## Built with

The Dot Caf&eacute; layout, ported per business with the owner's own name,
address, phone, currency and language, plus verified Google Maps rating and
price band where available.
