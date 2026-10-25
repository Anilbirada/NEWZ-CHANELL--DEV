# 📰 Vachana Kranti (ವಚನ ಕ್ರಾಂತಿ) — Digital News & E-Paper Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff.svg)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-black.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Enterprise-grade, bilingual (Kannada & English) digital newspaper, multi-edition e-paper engine, and editorial newsroom workspace.**

---

## 📌 About the Project

**Vachana Kranti** is a full-stack, production-architected news publishing system designed to modernize regional digital journalism. Developed specifically to honor the depth of regional reporting while meeting modern web performance and mobile accessibility standards, Vachana Kranti bridges traditional print journalism with real-time digital media distribution.

The platform combines a **high-speed, responsive public news portal** with a **hardened editorial back-office workspace**, featuring robust role-based access control (RBAC), multi-stage publishing workflows, an automated media optimization pipeline, and native PDF e-paper composition.

### 🏛️ Engineering Highlights

- **Clean Monorepo Architecture**: Segregated into `apps/web` (React + Vite SPA) and `apps/api` (Node.js + Express REST API), unified under npm workspaces.
- **Bilingual Core**: Built-in support for dynamic language switching between Kannada (ಕನ್ನಡ) and English with Unicode conjunct rendering and typographical hierarchy.
- **Editorial Governance**: Strict workflow separation between Reporters/Editors and Chief Administrators. Drafts undergo formal submission, review, approval, or rejection with full audit logging.
- **Asynchronous Media Processing Pipeline**: Image ingestion with signature verification, EXIF orientation normalization, WebP/AVIF multi-variant encoding, and smart focal-point cropping.
- **Digital E-Paper & PDF Generation Engine**: Vector-accurate page composition and print-ready PDF compilation leveraging `pdf-lib` and `fontkit` with custom Kannada font integration.
- **Resilient Background Jobs**: BullMQ and Redis queue integration for background image transcoding, with an automatic in-process fallback for lightweight development environments.

---

## 🚀 Key Features

### 1. 🌐 Public News Portal (`apps/web`)
- **Responsive Newspaper Grid**: Dynamic front-page layout featuring breaking news tickers, hero leads, category sections, and trending topics.
- **Seamless Language Toggle**: Real-time switching between Kannada and English content.
- **Interactive E-Paper Viewer**: Page-by-page digital edition reader with high-resolution zooming, page navigation, and direct PDF downloads.
- **Advertisement Engine**: Active ad slot delivery with schedule validation and view/click impression recording.

### 2. ✍️ Newsroom Editorial Workspace (`/admin`)
- **Article Lifecycle Management**: Draft, Review, Approved, Rejected, Published, and Archived states.
- **Media Asset Library**: Drag-and-drop file upload, focal point selection, metadata tagging (photographer credit, alt text, caption), and preview token security.
- **Edition & Page Composer**: Visual layout manager for assembling daily print and digital newspaper editions.
- **Campaign Management**: Creation and scheduling of banner advertisements with URL validation and impression limits.
- **Audit Trails**: Security audit events recording administrative actions and entity modifications.

### 3. ⚙️ Robust Backend & Infrastructure (`apps/api`)
- **Strict Schema & Foreign Key Integrity**: Relational PostgreSQL database utilizing UUIDs and JSONB document storage for snapshots.
- **Defensive API Security**: Helmet headers, CORS policies, express-rate-limit protection, and JWT-authenticated bearer tokens.
- **Idempotent Self-Initializing Database**: Automatically runs schema scripts and provisions initial administrator and editor seed credentials on first boot.

---

## 🛠️ Technology Stack

| Domain | Technology / Library | Purpose |
|---|---|---|
| **Frontend Framework** | React 18, TypeScript | High-performance user interface |
| **Build & Dev Tool** | Vite 6 | Lightning-fast HMR and bundle optimization |
| **Icons & UI** | Lucide React | Clean, accessible vector icons |
| **Backend Runtime** | Node.js (v20+ recommended) | Asynchronous backend server |
| **Server Framework** | Express 4, TypeScript | RESTful API endpoints |
| **Database** | PostgreSQL (v14+) | Primary relational persistence store |
| **ORM / Client** | pg (node-postgres) | High-throughput SQL client with connection pooling |
| **Media Processing** | Sharp | Low-memory image manipulation and transcoding |
| **PDF & Fonts** | PDF-Lib, @pdf-lib/fontkit | PDF parsing, edition assembly, and Unicode font embedding |
| **Task Queue** | BullMQ + Redis | Background job orchestration (with dev in-process fallback) |
| **Authentication** | JSON Web Tokens (JWT), bcryptjs | Secure stateless authentication & password hashing |
| **Validation** | Zod | Runtime schema validation |

---

## 📂 Project Architecture

```plaintext
vachana-kranti/
├── apps/
│   ├── api/                     # Backend Node.js / Express Service
│   │   ├── scripts/             # Build and schema migration scripts
│   │   ├── sql/                 # PostgreSQL schema and initialization DDL
│   │   │   └── schema.sql       # Canonical relational schema
│   │   ├── src/
│   │   │   ├── routes/          # API Route Controllers (Auth, Articles, Media, Editions, Ads)
│   │   │   ├── services/        # Business Logic (MediaProcessor, ImageQueue, Storage)
│   │   │   ├── db.ts            # PostgreSQL pool and auto-initialization
│   │   │   ├── auth.ts          # JWT authentication and authorization middlewares
│   │   │   └── server.ts        # Express app entrypoint
│   │   ├── storage/             # Protected local file storage (originals, variants, exports)
│   │   └── package.json
│   │
│   └── web/                     # Frontend React + Vite Application
│       ├── src/
│       │   ├── components/      # UI components (Header, ArticleCard, EPaperViewer, etc.)
│       │   ├── pages/           # View controllers (Home, ArticleDetail, AdminWorkspace, etc.)
│       │   ├── services/        # Frontend API client and auth state
│       │   ├── App.tsx          # Router and root layout
│       │   └── main.tsx         # React bootstrap entrypoint
│       ├── index.html           # HTML template
│       ├── vite.config.ts       # Vite configuration with `/api` reverse proxy
│       └── package.json
│
├── docs/                        # Architectural specifications and test checklists
│   └── ACCEPTANCE-TESTS.md      # Full compliance test suite
├── docker-compose.yml           # Optional containerization for PostgreSQL & Redis
├── package.json                 # Monorepo root package configuration
└── README.md                    # Project documentation
```

---

## 🚦 Step-by-Step Guide: How to Run This Project

Follow these clear, step-by-step instructions to get the application running locally on your machine.

### 📋 Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: Version `20.x` or newer (`node -v`)
- **npm**: Version `10.x` or newer (`npm -v`)
- **PostgreSQL**: Version 14 or higher (or Docker Desktop)
- *(Optional)* **Redis**: Required only for production background jobs; development mode uses an automatic in-process fallback.

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Anilbirada/NEWZ-CHANELL--DEV.git
cd NEWZ-CHANELL--DEV
```

---

### Step 2: Configure Environment Variables

Create the `.env` configuration files for both the root workspace and the API workspace:

#### 1. In Windows PowerShell:
```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
```

#### 2. On macOS / Linux:
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

#### 3. Update Database Connection in `apps/api/.env`:
Open `apps/api/.env` and ensure `DATABASE_URL` matches your local PostgreSQL credentials:

```ini
# PostgreSQL Connection (replace username, password, host, and port as applicable)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vachana_kranti

# Set REDIS_URL empty for development fallback mode (no Redis required)
REDIS_URL=

# Port & origins
PORT=4000
WEB_ORIGIN=http://localhost:5173
JWT_SECRET=super-secret-key-change-this-in-production-at-least-32-chars

# Storage & Upload Limits
STORAGE_ROOT=./storage
MAX_UPLOAD_MB=25
MAX_IMAGE_PIXELS=40000000
MAX_PDF_MB=80

# Initial Seed Credentials (provisioned on first launch)
SEED_ADMIN_EMAIL=admin@vachanakranti.local
SEED_ADMIN_PASSWORD=ChangeMe!123
SEED_EDITOR_EMAIL=editor@vachanakranti.local
SEED_EDITOR_PASSWORD=ChangeMe!456
```

---

### Step 3: Install Dependencies

From the project root folder, install all monorepo dependencies:

```bash
npm install
```
*(On Windows PowerShell, use `npm.cmd install` if script execution policies are restricted).*

---

### Step 4: Prepare the Database

1. Ensure your PostgreSQL service is running.
2. Create an empty database named `vachana_kranti` (if it does not already exist):
   ```sql
   CREATE DATABASE vachana_kranti;
   ```
3. **No manual migration commands needed!** The application automatically creates all tables, foreign keys, indexes, and initial admin/editor accounts on its first launch.

---

### Step 5: Start the Development Servers

You can start both the backend API and the frontend client concurrently with a single command:

```bash
npm run dev
```

Alternatively, you can run them in separate terminal windows:

#### Terminal 1 (Backend API):
```bash
npm run dev:api
```
*(API will start on `http://localhost:4000`)*

#### Terminal 2 (Frontend React App):
```bash
npm run dev:web
```
*(Frontend will start on `http://localhost:5173` with automated proxy to `/api`)*

---

### Step 6: Access the Application

Once both servers are running, open your browser:

| Interface | URL | Purpose |
|---|---|---|
| **Public Newspaper** | [http://localhost:5173/](http://localhost:5173/) | Public reading portal, news feed & e-paper |
| **Editorial Workspace** | [http://localhost:5173/admin](http://localhost:5173/admin) | Admin / Editor login, CMS, articles & media management |
| **API Health Check** | [http://localhost:4000/api/health](http://localhost:4000/api/health) | API and database connectivity verification |

#### 🔑 Default Development Credentials

| Role | Email Address | Password |
|---|---|---|
| **Administrator** | `admin@vachanakranti.local` | `ChangeMe!123` |
| **Editor** | `editor@vachanakranti.local` | `ChangeMe!456` |

---

## 📦 Production Build & Deployment

To compile and verify all workspaces for production:

```bash
# 1. Run strict TypeScript checks across all packages
npm run typecheck

# 2. Build backend and frontend bundles
npm run build

# 3. Start the production backend server
npm run start
```

### Production Checklist
- Update `NODE_ENV=production`.
- Generate a cryptographically secure 64-character `JWT_SECRET`.
- Change default seed passwords before opening external network ports.
- Deploy an external managed PostgreSQL 14+ instance with automated backups.
- Provide a valid licensed Unicode Kannada font (`.ttf`) in `KANNADA_FONT_PATH` for PDF export rendering.
- Configure Redis for high-throughput image worker queues.

---

## 📡 API Reference Outline

All administrative endpoints require `Authorization: Bearer <JWT_TOKEN>`.

### Authentication & Dashboard
- `POST /api/auth/login` — Authenticate user and issue JWT.
- `GET /api/dashboard/stats` — High-level article, edition, and media metrics.
- `GET /api/health` — Service and database health probe.

### Editorial & Content Management
- `GET /api/articles` — List all articles (supports status, category, language filters).
- `POST /api/articles` — Create a new article draft.
- `GET /api/articles/:id` — Retrieve article details and revision history.
- `PUT /api/articles/:id` — Update draft content.
- `PATCH /api/articles/:id/status` — Advance article workflow (`submitted`, `approved`, `published`, `rejected`).
- `GET /api/public/articles` — Publicly accessible published news articles.
- `GET /api/public/articles/:slug` — Single article by slug for public reading.

### Media Pipeline
- `POST /api/editorial/media/upload` — Multipart image upload (with dimension and signature validation).
- `GET /api/editorial/media` — Search and manage uploaded media assets.
- `PATCH /api/editorial/media/:id` — Update focal point and metadata.
- `GET /api/media/:id/:preset/:format` — Stream optimized image variants.

### Editions & Digital E-Paper
- `GET /api/editions` — List all digital editions.
- `POST /api/editions` — Create a new daily edition.
- `POST /api/editions/pdf` — Ingest native print PDF.
- `POST /api/editions/:id/export` — Trigger dynamic PDF rendering and page composition.
- `GET /api/public/editions` — Publicly available published editions.

### Advertisements & Telemetry
- `GET /api/advertisements` — Campaign management.
- `GET /api/public/advertisements` — Retrieve currently active ads matching slot parameters.
- `POST /api/public/advertisements/:id/event` — Log impression or click event telemetry.

---

## 🤝 Contribution & Quality Assurance

All pull requests and code modifications must pass the comprehensive checklist detailed in [`docs/ACCEPTANCE-TESTS.md`](./docs/ACCEPTANCE-TESTS.md).

---

## 📄 License

This software and its documentation are proprietary assets of Vachana Kranti Media. All rights reserved.
