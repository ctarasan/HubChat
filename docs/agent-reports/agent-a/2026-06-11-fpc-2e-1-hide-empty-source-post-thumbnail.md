# Agent Report — FPC-2E.1 Hide Empty Source Post Thumbnail

## Problem

After FPC-2E, `source_post_context.post_snippet` displays correctly but `post_thumbnail_url` is null. Dashboard Source Post card still rendered an empty thumbnail placeholder box.

## Fix

UI/model only: render post thumbnail `<img>` only when `isSafePostThumbnailUrl` passes. Removed empty placeholder branch from `SourcePostContextCard`.

## Out of scope

API bridge, ingest, worker fallback, LINE-EVT-1, migrations.
