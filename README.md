# AJ Street Photography

An independent photography portfolio using the Larz visual palette: near-black `#080909`, warm white `#f2f1ed`, muted gray `#a6a8a5`, and beige `#c1b399`. This repository has no dependency on the Larz site.

## Run the backend

Use Node 24.13 or newer and pnpm. Run `pnpm install`, then `pnpm start`. The preview runs at `http://127.0.0.1:4321`. Persistent SQLite records and optimized images live in ignored `data/`. Back up this directory if retaining editable drafts is important. Originals remain in the supplied archive, outside the published site.

The public gallery starts at `/`; `GET /api/portfolio` returns published photos and settings. `GET /api/health` checks readiness.

## Content rules

- Names, locations, descriptions, alternative text, and collections are optional and come only from supplied values. Source filenames never become captions.
- A provided date takes precedence. Otherwise only EXIF `DateTimeOriginal` or camera `CreateDate` may supply a date. File modification times, import dates, GPS, and filenames are never used to infer captions.
- No date appears when capture metadata is missing or invalid. Dates preserve the camera's calendar day, without timezone conversion.
- Missing captions are omitted entirely. Generic button labels remain available for keyboard and screen reader navigation.
- Images are auto-oriented, resized, and re-encoded as WebP. Public images do not retain EXIF, GPS, camera serial numbers, or source filenames.
- New imports are drafts unless explicitly published.

## Add and edit photographs

```sh
pnpm content import "/path/to/photo.jpg"
pnpm content import "/path/to/photo.jpg" --name "Disconnected" --publish
pnpm content list
pnpm content update PHOTO_ID --location "User-provided location" --date 2026-10-10
pnpm content publish PHOTO_ID
pnpm content unpublish PHOTO_ID
pnpm content update PHOTO_ID --name "" --date ""
pnpm content settings --instagram "https://www.instagram.com/aj.street.photography/"
pnpm content export
pnpm build
```

`export` writes only published photographs to `public/media/` and a sanitized catalog to `content/gallery.json`. Commit these along with settings and code. `build` generates `dist/` from that snapshot, so GitHub does not require the local database or credentials. Unpublish, export again, and commit to remove a photo from the hosted portfolio.

## Protected administration API

Copy `.env.example` to `.env` and set a random `ADMIN_TOKEN` of at least 32 characters. Without it all admin routes are disabled. Keep it out of Git and out of public JavaScript. Requests require `Authorization: Bearer <token>`.

- `GET /api/admin/photos`: include drafts.
- `POST /api/admin/photos`: multipart `file`, optional `name`, `location`, `description`, `alt`, `collection`, and `date`. Creates a draft.
- `PATCH /api/admin/photos/:id`: update optional text, explicit date, `published` boolean, or `position` integer. Empty strings clear text/date fields.
- `PATCH /api/admin/settings`: update `title`, `name`, `intro`, `instagram`, or local `logo` path.

Uploads are limited to 40 MB and 120 million input pixels. Multi-page files and arbitrary uploads are rejected. The server binds only to this computer by default. There is no remote admin dashboard yet; use the local commands or API. For a future hosted administration service, provision persistent storage, HTTPS, and a deployment-specific secret before exposing it remotely.

## GitHub Pages

The included Actions workflow builds the committed catalog and publishes `dist/` after pushes to `main`. In repository Settings → Pages select **GitHub Actions**. Paths are relative, so the site works under its repository URL. GitHub Pages hosts the exported portfolio; the editable backend runs locally, since Pages does not run server processes.

`pnpm test` verifies capture-date extraction, optional captions, draft isolation, image processing, persistence, and authenticated API behavior.

Photographs and logo are supplied by the owner; no reuse license is granted by this repository.
