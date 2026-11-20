"""
Verification test for Vision-Language model and 22-language Speech-to-Text.
"""
import sys
import os
import asyncio

# Ensure backend root is on path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.speech import SUPPORTED_OPENAI_LANGS, transcribe_audio
from app.services.vision import analyze_crop_image
from app.schemas.query import QueryResponse, ImageQueryResponse

def test_speech_whitelist():
    print("Testing Speech Language Whitelist...")
    # 22 official languages check
    official_22 = [
        "hi", "bn", "te", "mr", "ta", "ur", "gu", "kn", "ml", "or",
        "pa", "as", "mai", "sat", "ks", "ne", "sd", "kok", "doi", "mni", "brx", "sa"
    ]
    whitelisted = [lang for lang in official_22 if lang in SUPPORTED_OPENAI_LANGS]
    omitted = [lang for lang in official_22 if lang not in SUPPORTED_OPENAI_LANGS]
    print(f"  Whitelisted ISO-639-1 ({len(whitelisted)}): {whitelisted}")
    print(f"  Omitted for auto-detection ({len(omitted)}): {omitted}")
    assert "en" in SUPPORTED_OPENAI_LANGS
    assert "hi" in SUPPORTED_OPENAI_LANGS
    assert "mai" not in SUPPORTED_OPENAI_LANGS  # Must be omitted to avoid OpenAI 400 Bad Request
    assert "sat" not in SUPPORTED_OPENAI_LANGS  # Must be omitted
    assert "brx" not in SUPPORTED_OPENAI_LANGS  # Must be omitted
    print("Speech whitelist verification PASSED.")

def test_vision_pipeline():
    print("Testing Vision Agronomic Diagnostic Pipeline...")
    dummy_image = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x000\x01\x00\x9d\x01* \x00 \x00"
    weather_summary = "Temperature: 28 C, Humidity: 82%, Rain: light rain"

    result = analyze_crop_image(
        image_bytes=dummy_image,
        mime_type="image/jpeg",
        weather_context=weather_summary,
        farmer_question="Leaves turning dark brown and wilting"
    )

    print(f"  is_plant_or_farm_image: {result.get('is_plant_or_farm_image')}")
    print(f"  crop_common_name: {result.get('crop_common_name')}")
    print(f"  condition_category: {result.get('condition_category')}")
    print(f"  primary_diagnosis: {result.get('primary_diagnosis')}")
    print(f"  confidence_percent: {result.get('confidence_percent')}%")
    print(f"  severity: {result.get('severity')}")
    print(f"  visual_evidence: {result.get('visual_evidence')}")
    print(f"  differential_diagnosis: {result.get('differential_diagnosis_ruled_out')}")
    print(f"  rag_search_query: {result.get('rag_search_query')}")

    assert "is_plant_or_farm_image" in result
    assert "crop_common_name" in result
    assert "primary_diagnosis" in result
    assert "confidence_percent" in result
    assert "visual_evidence" in result
    assert isinstance(result["visual_evidence"], list)
    print("Vision pipeline verification PASSED.")

def test_schema_contract():
    print("Testing Pydantic Schema Contracts...")
    response_data = {
        "answer": "Test answer",
        "answer_english": "Test answer english",
        "sources": ["icar_manual.txt"],
        "response_time_ms": 1200,
        "from_cache": False,
        "crop_common_name": "Potato",
        "crop_scientific_name": "Solanum tuberosum",
        "growth_stage": "Tuber initiation",
        "condition_category": "Fungal Disease",
        "primary_diagnosis": "Late Blight",
        "confidence_percent": 92,
        "severity": "Moderate",
        "visual_evidence": ["Dark lesions on leaf margin", "Pale halo"],
        "differential_diagnosis_ruled_out": "Early blight ruled out",
        "is_plant_or_farm_image": True,
        "symptom_description": "Water soaked dark lesions with pale halo"
    }
    img_resp = ImageQueryResponse(**response_data)
    assert img_resp.crop_common_name == "Potato"
    assert img_resp.confidence_percent == 92
    assert len(img_resp.visual_evidence) == 2
    assert img_resp.is_plant_or_farm_image is True
    print("Schema contract verification PASSED.")

if __name__ == "__main__":
    test_speech_whitelist()
    test_vision_pipeline()
    test_schema_contract()
    print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
