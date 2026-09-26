# Krishi Sahayak: AI-Based Farmer Advisory System

A robust, multilingual Retrieval-Augmented Generation (RAG) platform designed specifically for Malayalam-speaking farmers. The system enables farmers to ask agricultural queries via voice or text in Malayalam and receive accurate, scientifically grounded answers sourced directly from verified ICAR (Indian Council of Agricultural Research) and Kerala Agriculture Department documents.

---

## 🏗️ Architecture

- **Backend**: FastAPI (Python 3.11) with async PostgreSQL
- **Vector Store**: ChromaDB (Persistent)
- **Embeddings**: `paraphrase-multilingual-MiniLM-L12-v2` (Sentence-Transformers)
- **LLM Engine**: OpenAI `gpt-4o-mini` (strictly constrained to RAG context)
- **Translation**: IndicTrans2 (`ai4bharat/indictrans2-indic-en-1B`) for accurate Malayalam ↔ English translation
- **Speech-to-Text**: Google Cloud Speech-to-Text (`ml-IN`)
- **Mobile App**: React Native (Expo SDK 51)
- **Web Dashboard**: React.js (Vite) + Recharts for analytics

---

## 🚀 Quick Start (Docker)

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v18+) for frontend development
- An OpenAI API Key
- A Google Cloud Service Account JSON with Speech-to-Text API enabled (Optional for demo mode)

### 2. Configuration
1. Navigate to the `backend/` directory.
2. Copy the environment template: `cp .env.example .env` (or just edit the `.env` file if it was created directly).
3. Fill in your keys:
   ```env
   OPENAI_API_KEY=your_key_here
   GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json
   ```
4. If using Google STT, place your `google-credentials.json` in the root or backend folder and update the path.

### 3. Run the Stack
From the project root:
```bash
docker-compose up --build -d
```
This starts:
- PostgreSQL database (`localhost:5432`)
- FastAPI Backend (`localhost:8000`)

### 4. Build the Knowledge Base (One-time)
You must ingest the sample documents into ChromaDB before querying:
```bash
docker-compose exec backend python -m app.services.ingest
```

### 5. Verify the API
```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"question": "നെൽ ചെടിയിൽ തവിട്ട് ചാഴി എങ്ങനെ നിയന്ത്രിക്കാം", "language": "ml", "region": "Palakkad"}'
```

---

## 📱 Mobile App Setup (React Native / Expo)

1. Navigate to the mobile app directory:
   ```bash
   cd frontend/mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Expo server:
   ```bash
   npm run start
   ```
4. Run on a device (using Expo Go app) or web browser (press `w`).

---

## 📊 Web Dashboard Setup (React)

1. Navigate to the web app directory:
   ```bash
   cd frontend/web
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.
*(Tip: Run `curl -X POST "http://localhost:8000/api/v1/analytics/seed-demo"` to populate the dashboard with sample data!)*

---

## ⚠️ Notes on Hardware Requirements

- **IndicTrans2**: The highly accurate `ai4bharat` translation model requires approximately **4-5 GB of RAM**. If the backend fails to load it due to memory constraints, the system will automatically fall back to `googletrans` and log a warning.
- For production deployments, a server with at least 8GB RAM is recommended.

## 📝 License
MIT License
