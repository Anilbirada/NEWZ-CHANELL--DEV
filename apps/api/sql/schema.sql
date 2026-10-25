CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  original_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  detected_mime TEXT NOT NULL,
  original_format TEXT NOT NULL,
  original_width INTEGER NOT NULL,
  original_height INTEGER NOT NULL,
  original_size_bytes BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed','archived')),
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  photographer_credit TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  focal_x NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (focal_x BETWEEN 0 AND 1),
  focal_y NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (focal_y BETWEEN 0 AND 1),
  crop_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  preset TEXT NOT NULL,
  format TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, preset, format)
);
CREATE INDEX IF NOT EXISTS idx_media_assets_status_created ON media_assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_variants_asset ON media_variants(asset_id);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL DEFAULT '',
  title_kn TEXT NOT NULL DEFAULT '',
  subtitle_en TEXT NOT NULL DEFAULT '',
  subtitle_kn TEXT NOT NULL DEFAULT '',
  summary_en TEXT NOT NULL DEFAULT '',
  summary_kn TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_kn TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK (language IN ('English','Kannada','Bilingual')) DEFAULT 'English',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  category_label TEXT NOT NULL DEFAULT 'Karnataka',
  author_name TEXT NOT NULL DEFAULT '',
  featured_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','published','archived')),
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_comment TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_articles_status_updated ON articles(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);

CREATE TABLE IF NOT EXISTS article_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, revision_number)
);

CREATE TABLE IF NOT EXISTS editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('English','Kannada','Bilingual')),
  publication_date DATE NOT NULL,
  creation_method TEXT NOT NULL CHECK (creation_method IN ('pdf_upload','page_composer')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','published','archived')),
  source_pdf_key TEXT,
  exported_pdf_key TEXT,
  cover_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  page_size JSONB NOT NULL DEFAULT '{"width":297,"height":420,"unit":"mm"}'::jsonb,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_comment TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(language, publication_date, title)
);
CREATE INDEX IF NOT EXISTS idx_editions_public_archive ON editions(status, publication_date DESC);

CREATE TABLE IF NOT EXISTS edition_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  print_pdf_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(edition_id, page_number)
);

CREATE TABLE IF NOT EXISTS advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  advertiser_name TEXT NOT NULL,
  creative_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  destination_url TEXT,
  placement TEXT NOT NULL CHECK (placement IN ('homepage_banner','article_sidebar','in_feed','epaper_cover','footer_banner')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','expired')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_ads_schedule ON advertisements(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS ad_events (
  id BIGSERIAL PRIMARY KEY,
  advertisement_id UUID NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','click')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_events_ad_type_date ON ad_events(advertisement_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);

INSERT INTO categories (slug, name_en, name_kn, sort_order) VALUES
  ('karnataka','Karnataka','ಕರ್ನಾಟಕ',1),
  ('politics','Politics','ರಾಜಕೀಯ',2),
  ('agriculture','Agriculture','ಕೃಷಿ',3),
  ('education','Education','ಶಿಕ್ಷಣ',4),
  ('city','City','ನಗರ ಸುದ್ದಿ',5),
  ('health','Health','ಆರೋಗ್ಯ',6),
  ('culture','Culture','ಸಂಸ್ಕೃತಿ',7),
  ('sports','Sports','ಕ್ರೀಡೆ',8)
ON CONFLICT (slug) DO NOTHING;
