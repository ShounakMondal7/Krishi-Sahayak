# Krishi Sahayak: Multilingual AI Farmer Advisory Platform

An enterprise-grade, multimodal Retrieval-Augmented Generation (RAG) platform empowering farmers across India. Krishi Sahayak delivers actionable, scientifically validated agricultural intelligence via voice, text, and computer-vision disease diagnosis—grounded strictly in verified Indian Council of Agricultural Research (ICAR) advisories and agricultural university bulletins.

---

## 🌟 Key Features

* **Full Pan-India Localization (22 Languages):** Complete coverage across all 22 official Eighth Schedule Indian languages (Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Santali, Kashmiri, Nepali, Konkani, Sindhi, Dogri, Manipuri, Bodo, Sanskrit) powered by `i18next` and native typography support.
* **Multimodal Query System:** Natural voice-first interface with Speech-to-Text (STT) and localized audio playback, alongside direct text querying.
* **Visual Crop Health & Disease Diagnostics:** In-app camera module allowing farmers to capture crop symptoms for instant identification, causal analysis, and treatment recommendations.
* **Strict RAG Grounding:** ChromaDB-backed retrieval engine preventing LLM hallucinations by constraining answers to ICAR production practices, IPM (Integrated Pest Management) protocols, and central/state schemes.
* **Optimized High-Performance Mobile Client:** React Native architecture running `@shopify/flash-list` for smooth list rendering, zero layout jumping, and resilient offline/fallback states.
* **Real-Time Analytics Portal:** Dedicated web dashboard tracking regional crop query patterns, pest outbreaks, and farmer engagement trends.

---

## 🏗️ System Architecture

```text
├── frontend/
│   ├── mobile/             # React Native (Expo SDK 51) client app
│   │   ├── app/            # Expo Router navigation (Home, Crop Photo, History)
│   │   ├── components/     # UI widgets, crop cards, audio recorder
│   │   └── locales/        # 22 official language JSON dictionaries
│   └── web/                # React (Vite) analytics portal with Recharts
└── backend/
    ├── app/                # FastAPI application & API endpoints
    │   ├── api/            # Query, diagnostics, audio, and analytics routes
    │   ├── core/           # LLM chains, prompts, and database config
    │   └── services/       # Translation, STT/TTS, and RAG retrieval
    ├── chroma_store/       # Persistent ChromaDB vector index
    └── knowledge_base/     # Raw ICAR advisories (.txt files)

    ## 💻 Tech Stack

* **Mobile App:** React Native, Expo SDK 51, TypeScript, Tailwind CSS / NativeWind, `@shopify/flash-list`, `i18next`
* **Web Dashboard:** React 18, Vite, Tailwind CSS, Recharts
* **Backend:** FastAPI (Python 3.11), Pydantic v2, Async PostgreSQL / SQLAlchemy
* **Vector Store & Retrieval:** ChromaDB (Persistent), `paraphrase-multilingual-MiniLM-L12-v2` (Sentence-Transformers)
* **LLM Engine:** OpenAI `gpt-4o-mini` / Gemini API (strictly constrained to retrieved RAG context)
* **Translation & Speech:** IndicTrans2 (`ai4bharat`) / Bhashini API with fallback translation and Google Cloud STT/TTS

---

## 🚀 Getting Started

### 1. Prerequisites
* **Docker & Docker Compose** (for backend & vector database)
* **Node.js (v18+)** and **npm**
* **Expo Go** app installed on iOS or Android for mobile testing
* An API key for **OpenAI** or **Google AI Studio**

### 2. Backend Setup

Navigate to the backend directory:
```bash
cd backend
Configure environment variables:
```bash
cp .env.example .env

Populate your .env file with your credentials:
OPENAI_API_KEY=your_llm_api_key_here
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/krishi_db
CHROMA_PERSIST_DIRECTORY=./chroma_store

Launch backend services via Docker:
Bash
docker-compose up --build -d

Ingest the Knowledge Base (Required Initial Step):
Index all ICAR text advisories into ChromaDB:
Bash
docker-compose exec backend python -m app.services.ingest

Verify API health:
Bash
curl http://localhost:8000/docs

### 3. Mobile App Setup (React Native / Expo)
Navigate to the mobile application directory:
```bash
cd frontend/mobile
Install dependencies:

Bash
npm install
Start the Metro bundler:
Bash
npx expo start

Run on Mobile:
Open the Expo Go app on your physical device (connected to the same local Wi-Fi).
Scan the QR code displayed in the terminal.
Press w in the terminal to launch the web preview in your desktop browser.

### 4. Web Analytics Dashboard Setup

Navigate to the web dashboard directory:
```bash
cd frontend/web
Install dependencies:

Bash
npm install
Start the Vite development server:

Bash
npm run dev
Open http://localhost:5173 in your browser.

## 🌐 Supported Official Indian Languages

The application fully integrates all 22 Eighth Schedule languages of the Republic of India:

| Language | Script / Native Display | Code | Primary Region |
| :--- | :--- | :--- | :--- |
| **Assamese** | অসমীয়া | `as` | Assam & North East |
| **Bengali** | বাংলা | `bn` | West Bengal & Tripura |
| **Bodo** | बड़ो | `brx` | Assam |
| **Dogri** | डोगरी | `doi` | Jammu & Kashmir |
| **Gujarati** | ગુજરાતી | `gu` | Gujarat |
| **Hindi** | हिन्दी | `hi` | North & Central India |
| **Kannada** | ಕನ್ನಡ | `kn` | Karnataka |
| **Kashmiri** | کأشُر | `ks` | Jammu & Kashmir |
| **Konkani** | कोंकणी | `kok` | Goa & Coastal Karnataka |
| **Maithili** | मैथिली | `mai` | Bihar & Jharkhand |
| **Malayalam** | മലയാളം | `ml` | Kerala & Lakshadweep |
| **Manipuri** | ꯃꯤꯇꯩꯂꯣꯟ | `mni` | Manipur |
| **Marathi** | मराठी | `mr` | Maharashtra & Goa |
| **Nepali** | नेपाली | `ne` | Sikkim & West Bengal |
| **Odia** | ଓଡ଼ିଆ | `or` | Odisha |
| **Punjabi** | ਪੰਜਾਬੀ | `pa` | Punjab & Haryana |
| **Sanskrit** | संस्कृतम् | `sa` | Pan-India |
| **Santali** | ᱥᱟᱱᱛᱟᱲᱤ | `sat` | Jharkhand, WB & Odisha |
| **Sindhi** | سنڌي / सिंधी | `sd` | Gujarat & Maharashtra |
| **Tamil** | தமிழ் | `ta` | Tamil Nadu & Puducherry |
| **Telugu** | తెలుగు | `te` | Andhra Pradesh & Telangana |
| **Urdu** | اردو | `ur` | Pan-India / J&K |

🔒 Verification & Safety Principles
Hallucination Mitigation: The advisory engine strictly refuses to generate unverified chemical or pesticide advice without high similarity matches in the ICAR vector base.

Graceful Fallback: Missing regional localization keys automatically fall back to standard English or Hindi without crashing the React Native rendering pipeline.

Optimized Payloads: Base64-encoded crop diagnostic images are compressed client-side before dispatch to conserve mobile bandwidth in low-connectivity rural settings.
