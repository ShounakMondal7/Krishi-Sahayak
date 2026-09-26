"""
services/ingest.py — One-time knowledge base ingestion into ChromaDB.

Walks the knowledge_base/ directory, extracts text from .txt and .pdf
files, splits into chunks, embeds, and stores in ChromaDB.

Run once (or whenever you add new documents):
    python -m app.services.ingest

Already-ingested files are skipped (idempotent).
"""
import logging
import os
import sys
import time
from pathlib import Path
from typing import Generator

# ── Path setup for running as __main__ ───────────────────────────────────────
if __name__ == "__main__":
    project_root = Path(__file__).parent.parent.parent.parent
    sys.path.insert(0, str(project_root / "backend"))

from langchain_text_splitters import RecursiveCharacterTextSplitter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("ingest")


# ─────────────────────────────────────────────────────────────────────────────
# TEXT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_txt(filepath: Path) -> str:
    """Read plain text file with UTF-8 encoding."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def extract_text_from_pdf(filepath: Path) -> str:
    """Extract all text from a PDF using pdfminer.six."""
    from pdfminer.high_level import extract_text
    try:
        text = extract_text(str(filepath))
        return text or ""
    except Exception as exc:
        logger.error(f"PDF extraction failed for {filepath.name}: {exc}")
        return ""


def extract_text(filepath: Path) -> str:
    """Dispatch to the correct extractor based on file extension."""
    ext = filepath.suffix.lower()
    if ext == ".txt":
        return extract_text_from_txt(filepath)
    elif ext == ".pdf":
        return extract_text_from_pdf(filepath)
    else:
        logger.warning(f"Unsupported file type: {filepath.suffix} — skipping.")
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# CHUNK GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[str]:
    """Split text into overlapping chunks using LangChain's recursive splitter."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(text)
    return [c.strip() for c in chunks if c.strip()]


# ─────────────────────────────────────────────────────────────────────────────
# ALREADY-INGESTED CHECK
# ─────────────────────────────────────────────────────────────────────────────

def get_ingested_filenames(collection) -> set[str]:
    """
    Returns a set of filenames already present in ChromaDB.
    Uses metadata filtering to check by source filename.
    """
    try:
        # Get all metadatas (no documents needed)
        result = collection.get(include=["metadatas"])
        return {
            meta.get("source", "")
            for meta in result.get("metadatas", [])
            if meta.get("source")
        }
    except Exception as exc:
        logger.warning(f"Could not check existing files: {exc}")
        return set()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN INGEST FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

def ingest_knowledge_base(knowledge_base_dir: str = "./knowledge_base") -> None:
    """
    Main ingest function. Idempotent — skips already-ingested files.

    Args:
        knowledge_base_dir: Path to the directory containing .txt and .pdf files.
    """
    from app.services.rag import get_embedding_model, get_collection
    from app.config import settings

    kb_path = Path(knowledge_base_dir)
    if not kb_path.exists():
        logger.error(f"Knowledge base directory not found: {kb_path.absolute()}")
        sys.exit(1)

    # Find all supported files
    supported_files = list(kb_path.glob("*.txt")) + list(kb_path.glob("*.pdf"))
    if not supported_files:
        logger.warning(f"No .txt or .pdf files found in {kb_path.absolute()}")
        return

    logger.info(f"Found {len(supported_files)} file(s) in knowledge base.")

    collection = get_collection()
    embedding_model = get_embedding_model()
    already_ingested = get_ingested_filenames(collection)

    total_chunks_added = 0
    total_start = time.time()

    for filepath in sorted(supported_files):
        filename = filepath.name

        if filename in already_ingested:
            logger.info(f"  ⏩ Skipping (already ingested): {filename}")
            continue

        logger.info(f"  📄 Processing: {filename}")
        t0 = time.time()

        # Extract text
        raw_text = extract_text(filepath)
        if not raw_text.strip():
            logger.warning(f"  ⚠️  Empty content in {filename} — skipping.")
            continue

        # Split into chunks
        chunks = chunk_text(
            raw_text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        logger.info(f"     Split into {len(chunks)} chunks.")

        if not chunks:
            logger.warning(f"  ⚠️  No chunks produced for {filename} — skipping.")
            continue

        # Embed all chunks in one batch
        logger.info(f"     Embedding {len(chunks)} chunks…")
        embeddings = embedding_model.encode(
            chunks,
            normalize_embeddings=True,
            batch_size=32,
            show_progress_bar=False,
        ).tolist()

        # Build ChromaDB records
        ids = [f"{filename}::chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {"source": filename, "chunk_index": i, "file_type": filepath.suffix.lstrip(".")}
            for i in range(len(chunks))
        ]

        # Add to ChromaDB in batches of 100 (ChromaDB limitation)
        batch_size = 100
        for start in range(0, len(chunks), batch_size):
            end = start + batch_size
            collection.add(
                ids=ids[start:end],
                documents=chunks[start:end],
                embeddings=embeddings[start:end],
                metadatas=metadatas[start:end],
            )

        elapsed = time.time() - t0
        total_chunks_added += len(chunks)
        logger.info(
            f"  ✅ {filename} — {len(chunks)} chunks ingested in {elapsed:.1f}s"
        )

    total_elapsed = time.time() - total_start
    final_count = collection.count()
    logger.info(
        f"\n{'='*60}\n"
        f"Ingest complete!\n"
        f"  New chunks added : {total_chunks_added}\n"
        f"  Total in ChromaDB: {final_count}\n"
        f"  Time elapsed     : {total_elapsed:.1f}s\n"
        f"{'='*60}"
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Ingest knowledge base into ChromaDB")
    parser.add_argument(
        "--kb-dir",
        default="./knowledge_base",
        help="Path to knowledge base directory (default: ./knowledge_base)",
    )
    args = parser.parse_args()
    ingest_knowledge_base(knowledge_base_dir=args.kb_dir)
