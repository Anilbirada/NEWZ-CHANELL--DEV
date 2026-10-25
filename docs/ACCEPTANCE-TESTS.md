# Acceptance test checklist

Use this list with a running database and backend. Record the date, environment, actual result, and evidence for every test. A requirement is not passed just because the screen exists.

## Setup and access

- [ ] `GET /api/health` returns `status: ok` after PostgreSQL is available.
- [ ] Initial administrator and editor accounts are seeded only when the configured email is absent.
- [ ] Wrong password is rejected without revealing whether an unrelated account exists.
- [ ] Public routes do not expose drafts, submitted stories, rejected stories, private assets, or unpublished PDFs.
- [ ] Editor cannot approve/publish content by calling an administrator-only API directly.

## Articles

- [ ] Editor creates a Kannada story and an English story.
- [ ] Drafts persist after browser refresh.
- [ ] Editor submits a draft; status and reviewer metadata persist.
- [ ] Administrator can reject with a reason and can publish submitted/approved content.
- [ ] Published stories appear in the public list and detail routes; non-published stories do not.
- [ ] Invalid body/schema/status updates return useful 4xx errors.

## Image processing

- [ ] Valid JPEG, PNG, WebP and AVIF uploads are accepted when supported by the installed codec.
- [ ] Renamed text files, damaged images, disallowed formats, files over the configured limit, and excessive pixel images are rejected.
- [ ] Processing applies EXIF orientation and generated variants do not preserve unwanted GPS metadata.
- [ ] Original asset remains preserved while variants are generated.
- [ ] Required configured presets output aspect-ratio-correct dimensions and format metadata.
- [ ] Processing failure is represented as `failed`, logged, and can be retried.
- [ ] Preview token expires and cannot be used to retrieve a different asset/preset.
- [ ] An unpublished/private media asset cannot be downloaded through the public media route.
- [ ] After article publish, the intended referenced media becomes publicly accessible as policy allows.
- [ ] Image crop/focal-point edits do not stretch or overwrite the original file.

## Editions and print

- [ ] Valid PDF upload is verified as a PDF, opens with PDF-Lib and records correct page count.
- [ ] Corrupted or non-PDF content renamed `.pdf` is rejected.
- [ ] PDF source is protected before publication and public PDF route refuses unpublished editions.
- [ ] Page-based edition saves page dimensions and ordered page blocks.
- [ ] PDF export shows low-resolution and missing-asset warnings and requires explicit confirmation where applicable.
- [ ] Kannada text export is blocked when a suitable licensed Kannada font is not configured; with a configured font, verify glyph rendering visually.
- [ ] Test EXIF-rotated source images and manually selected focal points in exported PDFs.
- [ ] PDF export downloads and opens with correct page count and image placement.
- [ ] Publishing follows editor submission and administrator approval.

## Advertisements

- [ ] Create/edit campaign persists to PostgreSQL.
- [ ] Unsupported URL schemes and production localhost destinations are rejected.
- [ ] End date must be after start date.
- [ ] Paused, expired and future-scheduled campaigns are not returned by the public endpoint.
- [ ] Impression/click events record against active campaigns only.
- [ ] Creative media must be ready and public before public campaign delivery.

## Responsive/accessibility/performance

- [ ] Verify 360px mobile, 768px tablet, laptop, and wide desktop.
- [ ] Keyboard-focus state works for navigation, modal dialogs, controls and PDF toolbar.
- [ ] Kannada matras/conjuncts, mixed-language headlines and font fallback render correctly.
- [ ] Below-the-fold images load lazily and images have explicit dimensions/aspect ratios.
- [ ] Large image processing does not block the API health endpoint.
- [ ] Test restore from a PostgreSQL backup plus the corresponding original/variant storage backup.
