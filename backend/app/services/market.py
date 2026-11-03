"""
services/market.py — eNAM / MSP / APMC wholesale mandi price integration.

Fetches current market support prices (MSP) and APMC wholesale mandi rates for 60+ Indian crops.
Results cached for 6 hours (prices are daily, not real-time).

Architecture note: Price data is injected into RAG context ONLY when
the query is price/market-related. The LLM answers using retrieved document
chunks + live market benchmark data.
"""
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── In-memory price cache (6-hour TTL) ───────────────────────────────────────
_price_cache: dict[str, tuple[dict, float]] = {}
_PRICE_TTL = 6 * 3600  # 6 hours

# ── Official GoI MSP Benchmarks (2024-25 / 2025-26) ──────────────────────────
# Covers 23 mandated crops with CACP recommended Minimum Support Prices.
MSP_BENCHMARKS = {
    "paddy": {
        "crop": "Paddy / Rice (Dhan)",
        "common": 2300,
        "grade_a": 2320,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹23.00 - ₹23.20 / kg (MSP Base)",
        "rate_per_kg_retail": "₹32 - ₹42 / kg",
        "market": "FCI / State Procurement Centre / APMC Mandi",
        "grade_criteria": "FAQ (Fair Average Quality): Moisture <=14%, foreign matter <=1%, damaged/discolored grains <=5%",
        "selling_advice": "Dry paddy on clean tarpaulins to bring moisture below 14% to ensure official MSP procurement acceptance without dockage deductions.",
        "storage_advice": "Store in 50 kg jute gunny bags on wooden dunnage in CAP storage or moisture-proof godowns.",
    },
    "wheat": {
        "crop": "Wheat (Gehun)",
        "common": 2425,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹24.25 / kg (MSP Base)",
        "rate_per_kg_retail": "₹28 - ₹34 / kg",
        "market": "FCI / APMC Mandi (Dadri / Hapur / Najafgarh)",
        "grade_criteria": "FAQ Grade: Moisture <=12%, foreign matter <=0.75%, shriveled grains <=6%, weeviled grains <=1%",
        "selling_advice": "Ensure thorough winnowing and drying to meet strict FCI moisture specifications (under 12%) for direct MSP payment.",
        "storage_advice": "Store in airtight silos or hermetic bags with aluminum phosphide fumigation against Khapra beetle.",
    },
    "maize": {
        "crop": "Maize / Corn (Makka)",
        "common": 2225,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹22.25 / kg (MSP Base)",
        "rate_per_kg_retail": "₹28 - ₹35 / kg",
        "market": "Regional APMC Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=14%, broken kernels <=3%, aflatoxin free",
        "selling_advice": "Dry shelled grain below 14% moisture immediately after shelling to prevent fungal growth.",
        "storage_advice": "Store in dry aerated bins with moisture barrier protection.",
    },
    "jowar": {
        "crop": "Sorghum / Jowar",
        "hybrid": 3371,
        "maldandi": 3421,
        "common": 3371,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹33.70 - ₹34.20 / kg",
        "rate_per_kg_retail": "₹45 - ₹55 / kg",
        "market": "APMC Mandi / Millets Procurement Centre",
        "grade_criteria": "FAQ Grade: Moisture <=12%, sound clean bold grains",
        "selling_advice": "Sort and clean grains before delivery to State Millets Mission procurement centres.",
        "storage_advice": "Keep in clean, well-aerated metal bins or HDPE sacks.",
    },
    "bajra": {
        "crop": "Pearl Millet / Bajra",
        "common": 2625,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹26.25 / kg (MSP Base)",
        "rate_per_kg_retail": "₹32 - ₹40 / kg",
        "market": "Regional APMC Mandi / Haryana-UP Mandis",
        "grade_criteria": "FAQ Grade: Moisture <=12%, foreign matter <=1.5%",
        "selling_advice": "Ensure grains are dried to under 12% moisture to avoid bitter rancidity.",
        "storage_advice": "Store in cool dry conditions; avoid prolonged bulk storage in high humidity.",
    },
    "ragi": {
        "crop": "Finger Millet / Ragi (Mandua)",
        "common": 4290,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹42.90 / kg (MSP Base)",
        "rate_per_kg_retail": "₹55 - ₹70 / kg",
        "market": "State Procurement Hub / APMC Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=12%, clean uniform reddish-brown seed",
        "selling_advice": "Clean chaff thoroughly to fetch top premium at millets procurement counters.",
        "storage_advice": "Ragi stores exceptionally well for 2-3 years in dry bins without pest susceptibility.",
    },
    "barley": {
        "crop": "Barley (Jau)",
        "common": 1980,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹19.80 / kg (MSP Base)",
        "rate_per_kg_retail": "₹28 - ₹35 / kg",
        "market": "Regional Grain Mandi",
        "grade_criteria": "Plump grain, moisture <=12%, high germination percentage for malting",
        "selling_advice": "Sell high-test weight plump grains directly to brewing/malt procurement agents for a premium.",
        "storage_advice": "Store in dry grain godowns on raised pallets.",
    },
    "chickpea": {
        "crop": "Chickpea / Bengal Gram (Chana)",
        "common": 5650,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹56.50 / kg (MSP Base)",
        "rate_per_kg_retail": "₹75 - ₹90 / kg",
        "market": "NAFED Procurement Center / APMC Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=10%, damaged/weeviled seeds <=3%",
        "selling_advice": "Enroll on the NAFED e-Samridhi portal for direct procurement at MSP.",
        "storage_advice": "Sun-dry to 9-10% moisture and store with neem leaves or pulse beetle dust in hermetic bags.",
    },
    "pigeon_pea": {
        "crop": "Pigeon Pea / Red Gram (Tur / Arhar)",
        "common": 7550,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹75.50 / kg (MSP Base)",
        "rate_per_kg_retail": "₹120 - ₹150 / kg",
        "market": "NAFED / Mandi Procurement Center",
        "grade_criteria": "FAQ Grade: Moisture <=10%, uniform bold grains, split/damaged <=2%",
        "selling_advice": "Clean and grade into bold lots for immediate NAFED MSP purchase without discount.",
        "storage_advice": "Keep in moisture-proof bags; fumigate if storing beyond 3 months.",
    },
    "moong": {
        "crop": "Green Gram (Moong)",
        "common": 8682,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹86.82 / kg (MSP Base)",
        "rate_per_kg_retail": "₹110 - ₹135 / kg",
        "market": "NAFED / APMC Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=10%, bright green skin, no bruchid infestation",
        "selling_advice": "Sort out wrinkled or discolored seeds to ensure acceptance at full MSP rates.",
        "storage_advice": "Treat with vegetable oil coating (5ml/kg) or hermetic SuperGrain bags against bruchids.",
    },
    "urad": {
        "crop": "Black Gram (Urad)",
        "common": 7400,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹74.00 / kg (MSP Base)",
        "rate_per_kg_retail": "₹105 - ₹130 / kg",
        "market": "NAFED / Regional Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=10%, uniform black seed coat",
        "selling_advice": "Clean dirt and stones thoroughly before weighing at APMC yards.",
        "storage_advice": "Store in clean bags elevated from concrete floors to prevent moisture suction.",
    },
    "lentil": {
        "crop": "Lentil / Masoor",
        "common": 6700,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹67.00 / kg (MSP Base)",
        "rate_per_kg_retail": "₹90 - ₹110 / kg",
        "market": "Regional Mandi / NAFED",
        "grade_criteria": "FAQ Grade: Moisture <=10%, clean bold reddish cotyledons",
        "selling_advice": "Grade bold and small seeded varieties separately for optimal market valuation.",
        "storage_advice": "Keep in dry, cool godowns with fumigation safeguards.",
    },
    "mustard": {
        "crop": "Mustard & Rapeseed (Sarson / Rai)",
        "common": 5950,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹59.50 / kg (MSP Base)",
        "rate_per_kg_retail": "₹75 - ₹95 / kg (as seed / oil equiv)",
        "market": "NAFED Procurement Center / Hapur / Alwar Mandi",
        "grade_criteria": "FAQ Grade: Minimum 38% oil content, moisture <=8%, foreign matter <=2%",
        "selling_advice": "Clean dust and small pods; ensure moisture is strictly below 8% to prevent mold and oil degradation.",
        "storage_advice": "Store in dry gunny bags on wooden dunnage; avoid high humidity to preserve oil content.",
    },
    "soybean": {
        "crop": "Soybean (Soya)",
        "common": 4892,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹48.92 / kg (MSP Base)",
        "rate_per_kg_retail": "₹60 - ₹75 / kg",
        "market": "Indore / Kota / Regional Mandi",
        "grade_criteria": "FAQ Grade: Moisture <=12%, oil content >18%, damaged seeds <=3%",
        "selling_advice": "Do not harvest wet pods; thresh at gentle speed (400-500 RPM) to prevent seed coat cracking.",
        "storage_advice": "Store at 10-11% moisture in well-ventilated dry warehouses.",
    },
    "groundnut": {
        "crop": "Groundnut / Peanut (Mungfali)",
        "common": 6783,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹67.83 / kg (MSP Base)",
        "rate_per_kg_retail": "₹95 - ₹120 / kg (shelled)",
        "market": "Rajkot / APMC Mandi / NAFED",
        "grade_criteria": "FAQ Grade: Pod moisture <=9%, shelling percentage >70%, aflatoxin free",
        "selling_advice": "Sun-cure freshly dug pods for 5-7 days until pods rattle freely when shaken.",
        "storage_advice": "Never store damp pods; moisture above 9% triggers toxic Aspergillus flavus aflatoxin.",
    },
    "cotton": {
        "crop": "Cotton / Kapas",
        "medium": 7121,
        "long": 7521,
        "common": 7121,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹71.20 - ₹75.20 / kg (MSP Base)",
        "rate_per_kg_retail": "Trade commodity",
        "market": "Cotton Corporation of India (CCI) Procurement Centres / APMC",
        "grade_criteria": "FAQ Grade: Moisture <=8-12%, trash content <=7%, staple length >27.5mm for long staple",
        "selling_advice": "Pick clean open bolls during dry afternoon hours; keep free from plastic strings and trash.",
        "storage_advice": "Store in clean covered ginning yards away from open moisture.",
    },
    "sugarcane": {
        "crop": "Sugarcane (Ganna)",
        "common": 340,
        "unit": "per quintal (FRP - Fair & Remunerative Price)",
        "rate_per_kg_wholesale": "₹3.40 / kg (at 10.25% sugar recovery)",
        "rate_per_kg_retail": "Mill Gate Price",
        "market": "Cooperative / Private Sugar Mills (UP Cane Society)",
        "grade_criteria": "Fresh clean whole cane, basic sugar recovery rate 10.25%, with ₹3.32/qtl premium per 0.1% extra recovery",
        "selling_advice": "Harvest according to mill bonding indents (satta/parchi); transport to mill within 24 hours of cutting to prevent sucrose inversion.",
        "storage_advice": "Supply immediately; standing or cut cane loses 1-2% sugar recovery for every 24 hours delay.",
    },
    "jute": {
        "crop": "Raw Jute (Pat)",
        "common": 5335,
        "unit": "per quintal",
        "rate_per_kg_wholesale": "₹53.35 / kg (MSP Base)",
        "rate_per_kg_retail": "Trade commodity",
        "market": "Jute Corporation of India (JCI) DPCs",
        "grade_criteria": "TD-5 Grade: Clean, well-retted fiber, free from root bark and speck",
        "selling_advice": "Ret in slow-moving clean water; wash and sun-dry fiber completely before baling.",
        "storage_advice": "Store dried bales in well-roofed shed elevated from ground.",
    },
}

# ── Horticultural & Perishable APMC Wholesale Benchmarks (Non-MSP) ───────────
# Covers 40+ perishable vegetables, fruits, and spices traded through APMC Mandis.
HORTICULTURAL_BENCHMARKS = {
    # ── Root & Tuber Vegetables ──────────────────────────────────────────────
    "carrot": {
        "crop": "Carrot (Gajar)",
        "default_modal_qtl": 1850,
        "default_range_qtl": "₹1,500 - ₹2,200 per quintal",
        "rate_per_kg_wholesale": "₹15 - ₹22 / kg",
        "rate_per_kg_retail": "₹30 - ₹40 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Noida APMC / Azadpur Mandi",
                "modal_qtl": 1850,
                "range_qtl": "₹1,500 - ₹2,200 per quintal",
                "wholesale_kg": "₹15 - ₹22 / kg",
                "retail_kg": "₹30 - ₹40 / kg",
            },
            "uttar pradesh": {
                "market": "Azadpur / Dadri Mandi / Meerut / Hapur",
                "modal_qtl": 1800,
                "range_qtl": "₹1,450 - ₹2,150 per quintal",
                "wholesale_kg": "₹14 - ₹21 / kg",
                "retail_kg": "₹28 - ₹38 / kg",
            },
        },
        "default_market": "Regional APMC Mandi / Azadpur Vegetable Terminal",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Long, straight taproots >15cm, uniform red/orange, crack-free; Grade B: Medium 10-15cm; Grade C: Crooked, branched, or undersized (<10cm)",
        "selling_advice": "Wash in running water to remove field soil, hydro-cool, remove tops, and pack in 40-50 kg leno mesh bags for premium wholesale realization.",
        "storage_advice": "Store in cold storage at 0-1°C with 95-98% RH for up to 4-6 months; keep away from ethylene-emitting fruits (apples, pears).",
    },
    "radish": {
        "crop": "Radish (Mooli)",
        "default_modal_qtl": 1100,
        "default_range_qtl": "₹800 - ₹1,400 per quintal",
        "rate_per_kg_wholesale": "₹8 - ₹14 / kg",
        "rate_per_kg_retail": "₹18 - ₹25 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Ghazipur / Azadpur",
                "modal_qtl": 1150,
                "range_qtl": "₹850 - ₹1,450 per quintal",
                "wholesale_kg": "₹9 - ₹15 / kg",
                "retail_kg": "₹20 - ₹28 / kg",
            },
        },
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Crisp, tender, straight white roots >20cm, pith-free; Grade B: Medium 15-20cm; Grade C: Pithy, branched, or over-mature roots",
        "selling_advice": "Harvest in early morning; wash roots, tie in neat bundles of 10-12, and transport promptly to avoid moisture loss and wilting.",
        "storage_advice": "Highly perishable; store at 0°C with 95% RH for at most 1-2 weeks; sell fresh.",
    },
    "beetroot": {
        "crop": "Beetroot (Chukandar)",
        "default_modal_qtl": 1750,
        "default_range_qtl": "₹1,400 - ₹2,100 per quintal",
        "rate_per_kg_wholesale": "₹14 - ₹21 / kg",
        "rate_per_kg_retail": "₹30 - ₹40 / kg",
        "default_market": "Azadpur / Dadri Mandi / Regional APMC",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Uniform globe shape 5-7cm diameter, smooth deep crimson flesh, crack-free; Grade B: 4-5cm; Grade C: Irregular, oversized (>8cm) woody roots",
        "selling_advice": "Trim greens leaving 2cm stem; wash off soil clods and pack in breathable sacks.",
        "storage_advice": "Store at 0-2°C with 95% RH for up to 3-5 months.",
    },
    "potato": {
        "crop": "Potato (Aloo)",
        "default_modal_qtl": 1550,
        "default_range_qtl": "₹1,350 - ₹1,750 per quintal",
        "rate_per_kg_wholesale": "₹14 - ₹18 / kg",
        "rate_per_kg_retail": "₹22 - ₹28 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi (Gautam Buddha Nagar) / Noida APMC",
                "modal_qtl": 1550,
                "range_qtl": "₹1,350 - ₹1,750 per quintal",
                "wholesale_kg": "₹14 - ₹18 / kg",
                "retail_kg": "₹22 - ₹28 / kg",
            },
            "uttar pradesh": {
                "market": "Agra Mandi / Farrukhabad / Dadri Mandi",
                "modal_qtl": 1500,
                "range_qtl": "₹1,300 - ₹1,750 per quintal",
                "wholesale_kg": "₹13 - ₹18 / kg",
                "retail_kg": "₹20 - ₹28 / kg",
            },
        },
        "default_market": "Regional APMC Mandi / Agra / Azadpur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Large clean tubers >45mm, skin-cured, green-free; Grade B: Medium table grade 30-45mm; Grade C: Small/seed tubers <30mm",
        "selling_advice": "Clean soil clods, remove damaged or green-skinned tubers, and sort into uniform size grades before transport to fetch top modal prices.",
        "storage_advice": "Store cured Grade-A produce in certified cold storage facilities (3-4°C with 90-95% RH for table potatoes, 8-10°C with CIPC for processing) in breathable 50 kg leno mesh bags.",
    },
    "sweet_potato": {
        "crop": "Sweet Potato (Shakarkand)",
        "default_modal_qtl": 2200,
        "default_range_qtl": "₹1,800 - ₹2,600 per quintal",
        "rate_per_kg_wholesale": "₹18 - ₹26 / kg",
        "rate_per_kg_retail": "₹35 - ₹50 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Medium spindle-shaped clean tubers, weevil-free; Grade B: Small or curved; Grade C: Weevil-bored or scarred tubers",
        "selling_advice": "Cure at 28-30°C and 85-90% RH for 5-7 days after harvest to heal skin wounds and increase sweetness.",
        "storage_advice": "Store at 13-15°C with 85% RH; never store below 10°C to prevent internal breakdown.",
    },
    "colocasia": {
        "crop": "Colocasia / Taro (Arbi)",
        "default_modal_qtl": 2400,
        "default_range_qtl": "₹1,900 - ₹2,900 per quintal",
        "rate_per_kg_wholesale": "₹19 - ₹29 / kg",
        "rate_per_kg_retail": "₹35 - ₹50 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Medium firm cormels, free of fiber rot and cuts; Grade B: Small side cormels; Grade C: Soft or insect-damaged",
        "selling_advice": "Clean root hairs and soil; sun-dry outer skin for 1 day before packing in hessian sacks.",
        "storage_advice": "Store in dry well-ventilated rooms at 12-15°C; avoid excessive dampness.",
    },

    # ── Cole Crops & Leafy Vegetables ────────────────────────────────────────
    "cauliflower": {
        "crop": "Cauliflower (Phool Gobhi)",
        "default_modal_qtl": 1350,
        "default_range_qtl": "₹1,000 - ₹1,700 per quintal",
        "rate_per_kg_wholesale": "₹10 - ₹17 / kg",
        "rate_per_kg_retail": "₹22 - ₹30 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Ghazipur Vegetable Terminal",
                "modal_qtl": 1400,
                "range_qtl": "₹1,050 - ₹1,750 per quintal",
                "wholesale_kg": "₹11 - ₹18 / kg",
                "retail_kg": "₹24 - ₹32 / kg",
            },
        },
        "default_market": "Regional Vegetable Mandi / Azadpur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Compact, snow-white curds >15cm diameter with fresh jacket leaves; Grade B: Creamy or loose 10-15cm; Grade C: Ricey, browning, or loose curds",
        "selling_advice": "Harvest during cool morning hours; leave 4-6 protective jacket leaves to shield curds during handling.",
        "storage_advice": "Store at 0°C with 95-98% RH; shelf life is 2-3 weeks in cold room.",
    },
    "cabbage": {
        "crop": "Cabbage (Patta Gobhi)",
        "default_modal_qtl": 1050,
        "default_range_qtl": "₹800 - ₹1,300 per quintal",
        "rate_per_kg_wholesale": "₹8 - ₹13 / kg",
        "rate_per_kg_retail": "₹18 - ₹25 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Solid, firm, heavy heads 1-2 kg, undamaged outer leaves; Grade B: Soft heads <1 kg; Grade C: Burst, insect-bored heads",
        "selling_advice": "Trim yellow outer leaves; pack tightly in ventilated net sacks or wooden crates.",
        "storage_advice": "Can be held at 0°C with 95% RH for up to 6-8 weeks.",
    },
    "spinach": {
        "crop": "Spinach (Palak)",
        "default_modal_qtl": 1200,
        "default_range_qtl": "₹800 - ₹1,600 per quintal",
        "rate_per_kg_wholesale": "₹8 - ₹16 / kg",
        "rate_per_kg_retail": "₹20 - ₹30 / kg",
        "default_market": "Local APMC Sub-Yard / Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender, succulent, dark green leaves free of yellowing and dirt; Grade B: Slightly fibrous; Grade C: Bolted or mud-coated leaves",
        "selling_advice": "Harvest by clipping 2cm above soil; tie in clean 500g bundles; transport in moist wet cloth or crates.",
        "storage_advice": "Highly perishable; sell within 24 hours or hold at 0°C with 95-100% RH for 3-5 days.",
    },
    "fenugreek": {
        "crop": "Fenugreek Leaves (Methi)",
        "default_modal_qtl": 1400,
        "default_range_qtl": "₹1,000 - ₹1,800 per quintal",
        "rate_per_kg_wholesale": "₹10 - ₹18 / kg",
        "rate_per_kg_retail": "₹25 - ₹35 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Fresh tender green bundles, unbolted, weed-free; Grade B: Slightly fibrous; Grade C: Yellowed or flowering",
        "selling_advice": "Harvest before flower bud appearance; bundle with jute twine.",
        "storage_advice": "Sell daily; maximum cold holding 3-4 days at 0°C.",
    },
    "coriander": {
        "crop": "Green Coriander (Dhaniya Patta)",
        "default_modal_qtl": 2500,
        "default_range_qtl": "₹1,800 - ₹3,500 per quintal",
        "rate_per_kg_wholesale": "₹18 - ₹35 / kg",
        "rate_per_kg_retail": "₹40 - ₹70 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Aromatic, deep green healthy foliage with roots intact, washed; Grade B: Light green; Grade C: Yellowing, rot-damaged",
        "selling_advice": "Wash roots clean of mud; pack in ventilated crates layered with wet jute to preserve turgor.",
        "storage_advice": "Store at 0°C with 95% RH for 1-2 weeks.",
    },

    # ── Solanaceous & Fruit Vegetables ───────────────────────────────────────
    "tomato": {
        "crop": "Tomato (Tamatar)",
        "default_modal_qtl": 1500,
        "default_range_qtl": "₹1,200 - ₹1,800 per quintal",
        "rate_per_kg_wholesale": "₹12 - ₹18 / kg",
        "rate_per_kg_retail": "₹25 - ₹35 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Azadpur Vegetable Terminal",
                "modal_qtl": 1550,
                "range_qtl": "₹1,250 - ₹1,850 per quintal",
                "wholesale_kg": "₹13 - ₹19 / kg",
                "retail_kg": "₹25 - ₹35 / kg",
            },
        },
        "default_market": "Regional APMC Mandi / Azadpur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Firm, semi-ripe (breaker/turning stage), uniform red/pink, blemish-free; Grade B: Medium/local consumption; Grade C: Over-ripe, soft, or cracked",
        "selling_advice": "Harvest at breaker or turning stage for distant mandis; use well-ventilated plastic crates instead of rough wooden boxes.",
        "storage_advice": "Store in evaporative cool chambers (12-15°C with 85-90% RH); do not chill below 10°C to prevent chilling injury and flavor loss.",
    },
    "onion": {
        "crop": "Onion (Pyaaz)",
        "default_modal_qtl": 2100,
        "default_range_qtl": "₹1,800 - ₹2,400 per quintal",
        "rate_per_kg_wholesale": "₹18 - ₹24 / kg",
        "rate_per_kg_retail": "₹28 - ₹38 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Ghazipur APMC / Azadpur",
                "modal_qtl": 2100,
                "range_qtl": "₹1,850 - ₹2,450 per quintal",
                "wholesale_kg": "₹19 - ₹25 / kg",
                "retail_kg": "₹30 - ₹38 / kg",
            },
        },
        "default_market": "Lasalgaon / Azadpur / Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Large uniform globes >55mm, well-cured tight skin, thin neck; Grade B: Medium 40-55mm; Grade C: Small/chhanta <40mm or thick-necked",
        "selling_advice": "Cure in field shade for 10-15 days, clip dried tops leaving 2.5cm neck, and remove thick-necked bulbs before bringing to mandi.",
        "storage_advice": "Store in naturally ventilated bamboo or mesh chawls with raised slatted bottoms (25-30°C, 65-70% RH); avoid high humidity to stop sprouting.",
    },
    "brinjal": {
        "crop": "Brinjal / Eggplant (Baingan)",
        "default_modal_qtl": 1400,
        "default_range_qtl": "₹1,100 - ₹1,800 per quintal",
        "rate_per_kg_wholesale": "₹11 - ₹18 / kg",
        "rate_per_kg_retail": "₹25 - ₹35 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Glossy purple/green skin, tender calyx, seedless/tender flesh, borer-free; Grade B: Medium; Grade C: Dull, borer-infested, or seedy",
        "selling_advice": "Clip with 2cm calyx stalk attached; sort into round and long varieties separately.",
        "storage_advice": "Store at 10-12°C with 90% RH for up to 1-2 weeks; sensitive to chilling below 10°C.",
    },
    "capsicum": {
        "crop": "Capsicum / Bell Pepper (Shimla Mirch)",
        "default_modal_qtl": 3200,
        "default_range_qtl": "₹2,500 - ₹4,200 per quintal",
        "rate_per_kg_wholesale": "₹25 - ₹42 / kg",
        "rate_per_kg_retail": "₹50 - ₹75 / kg",
        "default_market": "Azadpur / Dadri Mandi / Polyhouse Hub",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Firm, blocky 3-4 lobed fruits, thick walls, deep green or yellow/red, blemish-free; Grade B: Medium; Grade C: Misshapen or thin-walled",
        "selling_advice": "Harvest with intact pedicel; pack in corrugated fiberboard boxes (CFB) with paper lining.",
        "storage_advice": "Store at 7-10°C with 90-95% RH for 2-3 weeks.",
    },
    "green_peas": {
        "crop": "Green Peas (Hari Matar)",
        "default_modal_qtl": 2800,
        "default_range_qtl": "₹2,200 - ₹3,600 per quintal",
        "rate_per_kg_wholesale": "₹22 - ₹36 / kg",
        "rate_per_kg_retail": "₹45 - ₹65 / kg",
        "regional_markets": {
            "gautam buddha nagar": {
                "market": "Dadri Mandi / Ghazipur / Azadpur",
                "modal_qtl": 2900,
                "range_qtl": "₹2,300 - ₹3,700 per quintal",
                "wholesale_kg": "₹23 - ₹37 / kg",
                "retail_kg": "₹45 - ₹65 / kg",
            },
        },
        "default_market": "Azadpur / Dadri Mandi / Hapur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Well-filled plump green pods, sweet tender grains (8-10 seeds/pod), fiber-free; Grade B: Moderately filled; Grade C: Over-mature, starchy, yellowing pods",
        "selling_advice": "Harvest pods when fully developed but still tender and sweet; pack in 20-25 kg ventilated net bags.",
        "storage_advice": "Store immediately at 0°C with 95% RH to stop sugar conversion into starch; shelf life 1-2 weeks.",
    },
    "okra": {
        "crop": "Okra / Lady Finger (Bhindi)",
        "default_modal_qtl": 2200,
        "default_range_qtl": "₹1,700 - ₹2,800 per quintal",
        "rate_per_kg_wholesale": "₹17 - ₹28 / kg",
        "rate_per_kg_retail": "₹35 - ₹50 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender, bright green pods 7-10cm, crisp tips that snap easily, borer-free; Grade B: 10-12cm; Grade C: Fibrous, over-mature (>12cm)",
        "selling_advice": "Harvest alternate days in evening; pack in well-ventilated baskets or leno bags to prevent heating.",
        "storage_advice": "Store at 7-10°C with 90-95% RH for 7-10 days; avoid cold injury below 7°C.",
    },
    "french_beans": {
        "crop": "French Beans (Phasli)",
        "default_modal_qtl": 3000,
        "default_range_qtl": "₹2,400 - ₹3,800 per quintal",
        "rate_per_kg_wholesale": "₹24 - ₹38 / kg",
        "rate_per_kg_retail": "₹50 - ₹70 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender straight pods, stringless, no visible seed bulging; Grade B: Slightly stringy; Grade C: Over-mature, swollen seeds",
        "selling_advice": "Harvest before seeds swell; pack in crates to prevent bruising.",
        "storage_advice": "Store at 5-7°C with 95% RH for 1-2 weeks.",
    },

    # ── Cucurbits & Gourds ───────────────────────────────────────────────────
    "bottle_gourd": {
        "crop": "Bottle Gourd (Lauki / Ghiya)",
        "default_modal_qtl": 1200,
        "default_range_qtl": "₹900 - ₹1,600 per quintal",
        "rate_per_kg_wholesale": "₹9 - ₹16 / kg",
        "rate_per_kg_retail": "₹20 - ₹30 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender, light green, cylindrical 1-1.5 kg, soft pubescence, tender skin; Grade B: Medium 1.5-2 kg; Grade C: Hard rind, seedy",
        "selling_advice": "Wrap fruits in paper or foam sleeves during transport to prevent skin abrasion and black spotting.",
        "storage_advice": "Hold at 10-12°C with 85-90% RH for 10-14 days.",
    },
    "bitter_gourd": {
        "crop": "Bitter Gourd (Karela)",
        "default_modal_qtl": 2200,
        "default_range_qtl": "₹1,800 - ₹2,800 per quintal",
        "rate_per_kg_wholesale": "₹18 - ₹28 / kg",
        "rate_per_kg_retail": "₹35 - ₹50 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Crisp, dark green fruits with prominent continuous ridges, unripened green flesh; Grade B: Medium; Grade C: Yellowing or orange-tinged",
        "selling_advice": "Harvest while seeds are tender; pack in ventilated crates.",
        "storage_advice": "Store at 10-12°C with 85-90% RH for 1-2 weeks.",
    },
    "cucumber": {
        "crop": "Cucumber (Kheera)",
        "default_modal_qtl": 1400,
        "default_range_qtl": "₹1,000 - ₹1,800 per quintal",
        "rate_per_kg_wholesale": "₹10 - ₹18 / kg",
        "rate_per_kg_retail": "₹22 - ₹32 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Straight, firm, dark green, 15-20cm, crisp tender seed cavity; Grade B: Curved; Grade C: Yellowed or oversized",
        "selling_advice": "Harvest daily in morning; pack in shallow plastic crates.",
        "storage_advice": "Store at 10-12°C with 95% RH for 10-14 days; do not chill below 10°C.",
    },
    "pumpkin": {
        "crop": "Pumpkin (Kaddu / Sitaphal)",
        "default_modal_qtl": 900,
        "default_range_qtl": "₹700 - ₹1,200 per quintal",
        "rate_per_kg_wholesale": "₹7 - ₹12 / kg",
        "rate_per_kg_retail": "₹16 - ₹24 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Fully mature, hard rind, intact 5cm stalk, sound weight; Grade B: Medium; Grade C: Immature or scratched rind",
        "selling_advice": "Harvest with dry stem attached; cure in field for 7 days before stacking.",
        "storage_advice": "Stores exceptionally well in ventilated sheds at 12-15°C for 3-5 months.",
    },
    "pointed_gourd": {
        "crop": "Pointed Gourd (Parwal)",
        "default_modal_qtl": 3500,
        "default_range_qtl": "₹2,800 - ₹4,500 per quintal",
        "rate_per_kg_wholesale": "₹28 - ₹45 / kg",
        "rate_per_kg_retail": "₹55 - ₹80 / kg",
        "default_market": "Regional Vegetable Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender green fruits with soft white stripes, tender seeds; Grade B: Medium; Grade C: Yellowing or hard-seeded",
        "selling_advice": "Pack in small bamboo baskets layered with green leaves.",
        "storage_advice": "Store at 10-12°C with 85-90% RH for 5-7 days.",
    },
    "ridge_gourd": {
        "crop": "Ridge Gourd (Torai)",
        "default_modal_qtl": 1600,
        "default_range_qtl": "₹1,200 - ₹2,100 per quintal",
        "rate_per_kg_wholesale": "₹12 - ₹21 / kg",
        "rate_per_kg_retail": "₹25 - ₹38 / kg",
        "default_market": "Regional APMC Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Tender straight fruits, tender sharp ridges, string-free; Grade B: Curved; Grade C: Fibrous or spongy",
        "selling_advice": "Harvest when tender; handle carefully to avoid ridge blackening.",
        "storage_advice": "Store at 10-12°C with 90% RH for 1 week.",
    },

    # ── Spices & Condiments ──────────────────────────────────────────────────
    "chilli": {
        "crop": "Green Chilli (Hari Mirch)",
        "default_modal_qtl": 3200,
        "default_range_qtl": "₹2,500 - ₹3,800 per quintal",
        "rate_per_kg_wholesale": "₹25 - ₹38 / kg",
        "rate_per_kg_retail": "₹45 - ₹65 / kg",
        "default_market": "Regional APMC Mandi / Guntur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Firm, deep green, 7-10cm, fresh green pedicel attached, rot-free; Grade B: Light green; Grade C: Turning red or soft/shriveled",
        "selling_advice": "Harvest with stalks intact; pack in breathable mesh bags or net crates.",
        "storage_advice": "Store at 7-10°C with 90-95% RH for 2-3 weeks.",
    },
    "garlic": {
        "crop": "Garlic (Lahsun)",
        "default_modal_qtl": 10500,
        "default_range_qtl": "₹8,500 - ₹13,000 per quintal",
        "rate_per_kg_wholesale": "₹85 - ₹130 / kg",
        "rate_per_kg_retail": "₹150 - ₹200 / kg",
        "default_market": "Mandsaur / Kota / Azadpur Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Large tight bulbs >45mm diameter, dry white outer papery skin, cloves plump and sound; Grade B: Medium 30-45mm; Grade C: Small/split cloves <30mm",
        "selling_advice": "Cure in shade for 15-20 days until roots and necks are dry; trim tops leaving 2cm stalk.",
        "storage_advice": "Store in dry well-ventilated slatted racks at 0-2°C with 60-70% RH or in ambient dry rooms.",
    },
    "ginger": {
        "crop": "Fresh Ginger (Adrak)",
        "default_modal_qtl": 5800,
        "default_range_qtl": "₹4,800 - ₹7,000 per quintal",
        "rate_per_kg_wholesale": "₹48 - ₹70 / kg",
        "rate_per_kg_retail": "₹80 - ₹110 / kg",
        "default_market": "Wayanad / Shimoga / Azadpur Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Plump, large fingers, clean washed skin, free from rot and fiber; Grade B: Medium fingers; Grade C: Shriveled or small bits",
        "selling_advice": "Wash soil thoroughly; cure rhizomes in shade for 2 days to heal skin abrasions.",
        "storage_advice": "Store in cool dry pits or cold storage at 12-14°C with 85-90% RH.",
    },
    "turmeric": {
        "crop": "Turmeric (Haldi - Fresh/Cured)",
        "default_modal_qtl": 7800,
        "default_range_qtl": "₹6,500 - ₹9,500 per quintal",
        "rate_per_kg_wholesale": "₹65 - ₹95 / kg",
        "rate_per_kg_retail": "₹120 - ₹160 / kg",
        "default_market": "Nizamabad / Erode / Sangli Mandi",
        "mechanism": "APMC Mandi Auction / NAFED Special Support",
        "grade_criteria": "Grade A (Finger): Hard, clean, well-cured fingers with >3.5% curcumin content; Grade B: Mother rhizomes / Bulbs",
        "selling_advice": "Boil in water for 45-60 minutes, dry in sun for 10-15 days, and polish before selling.",
        "storage_advice": "Store in cool, dry godowns in double gunny bags.",
    },

    # ── Fruits & Perennial Crops ─────────────────────────────────────────────
    "mango": {
        "crop": "Mango (Aam)",
        "default_modal_qtl": 4500,
        "default_range_qtl": "₹3,500 - ₹6,000 per quintal",
        "rate_per_kg_wholesale": "₹35 - ₹60 / kg",
        "rate_per_kg_retail": "₹70 - ₹110 / kg",
        "default_market": "Malihabad / Azadpur / Vashi Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Mature green or turning, uniform size >250g (Dasheri/Langra/Chausa), blemish-free; Grade B: Medium 180-250g; Grade C: <180g or scarred",
        "selling_advice": "Harvest with 1cm stalk using pole harvesters to avoid latex drip and stem-end rot.",
        "storage_advice": "Hold mature green fruits at 12-13°C with 85-90% RH for 2-3 weeks.",
    },
    "banana": {
        "crop": "Banana (Kela)",
        "default_modal_qtl": 1800,
        "default_range_qtl": "₹1,400 - ₹2,300 per quintal",
        "rate_per_kg_wholesale": "₹14 - ₹23 / kg",
        "rate_per_kg_retail": "₹35 - ₹50 / dozen",
        "default_market": "Jalgaon / Azadpur / Regional Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Grand Naine hands, uniform green fingers >18cm, blemish-free; Grade B: Medium 15-18cm; Grade C: Scratched or small fingers",
        "selling_advice": "De-hand bunches into 4-6 finger clusters, wash in clean water, and pack in CFB boxes.",
        "storage_advice": "Ripen in ethylene chambers at 16-18°C; never store below 13°C to prevent chilling injury.",
    },
    "apple": {
        "crop": "Apple (Seb)",
        "default_modal_qtl": 8500,
        "default_range_qtl": "₹6,500 - ₹11,000 per quintal",
        "rate_per_kg_wholesale": "₹65 - ₹110 / kg",
        "rate_per_kg_retail": "₹120 - ₹180 / kg",
        "default_market": "Azadpur Mandi / Shimla / Sopore",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Extra Fancy: >75mm diameter, >75% color blush, firm, wax-coated; Fancy: 65-75mm; Commercial Grade: <65mm",
        "selling_advice": "Sort by size and color; pack in molded pulp trays in telescopic CFB cartons.",
        "storage_advice": "Store in CA (Controlled Atmosphere) cold storage at 0-1°C with 90-95% RH for up to 6-9 months.",
    },
    "guava": {
        "crop": "Guava (Amrood)",
        "default_modal_qtl": 2600,
        "default_range_qtl": "₹2,000 - ₹3,400 per quintal",
        "rate_per_kg_wholesale": "₹20 - ₹34 / kg",
        "rate_per_kg_retail": "₹40 - ₹60 / kg",
        "default_market": "Prayagraj / Azadpur / Regional Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Firm, mature yellowish-green (Allahabad Safeda/L-49), >150g; Grade B: Medium 100-150g; Grade C: Bruised or fruit fly hit",
        "selling_advice": "Bag individual fruits on tree against fruit flies; pack in foam nets.",
        "storage_advice": "Store at 8-10°C with 85-90% RH for 2-3 weeks.",
    },
    "papaya": {
        "crop": "Papaya (Papita)",
        "default_modal_qtl": 1900,
        "default_range_qtl": "₹1,500 - ₹2,400 per quintal",
        "rate_per_kg_wholesale": "₹15 - ₹24 / kg",
        "rate_per_kg_retail": "₹30 - ₹45 / kg",
        "default_market": "Regional Mandi / Azadpur",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Red Lady / Taiwan 786, color break stage (one yellow streak), firm 1-1.5 kg; Grade B: Local varieties",
        "selling_advice": "Harvest at first sign of color change at fruit tip; transport wrapped in paper in cushioned crates.",
        "storage_advice": "Store at 10-12°C with 85% RH for 1-2 weeks.",
    },
    "pomegranate": {
        "crop": "Pomegranate (Anar)",
        "default_modal_qtl": 8000,
        "default_range_qtl": "₹6,000 - ₹11,000 per quintal",
        "rate_per_kg_wholesale": "₹60 - ₹110 / kg",
        "rate_per_kg_retail": "₹120 - ₹180 / kg",
        "default_market": "Solapur / Azadpur / Vashi Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Bhagwa variety, >250g, deep glossy red rind and arils; Grade B: 200-250g; Grade C: Sunburned or scarred",
        "selling_advice": "Sort by weight and skin gloss; pack in CFB cartons with partition cells.",
        "storage_advice": "Store at 5°C with 90-95% RH for up to 2-3 months.",
    },
    "lemon": {
        "crop": "Lemon / Acid Lime (Nimbu)",
        "default_modal_qtl": 3500,
        "default_range_qtl": "₹2,600 - ₹4,800 per quintal",
        "rate_per_kg_wholesale": "₹26 - ₹48 / kg",
        "rate_per_kg_retail": "₹60 - ₹90 / kg",
        "default_market": "Regional Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Thin-skinned, juicy round yellow-green fruits, canker-free; Grade B: Thick-skinned; Grade C: Canker-spotted",
        "selling_advice": "Wash and sort; pack in 20 kg ventilated net bags.",
        "storage_advice": "Store at 9-10°C with 85-90% RH for 6-8 weeks.",
    },
    "watermelon": {
        "crop": "Watermelon (Tarbooz)",
        "default_modal_qtl": 950,
        "default_range_qtl": "₹750 - ₹1,300 per quintal",
        "rate_per_kg_wholesale": "₹7.50 - ₹13 / kg",
        "rate_per_kg_retail": "₹18 - ₹25 / kg",
        "default_market": "Regional Fruit Mandi",
        "mechanism": "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)",
        "grade_criteria": "Grade A: Sound, mature fruit with pale yellow ground spot, uniform green/striped rind, 4-8 kg; Grade B: Misshapen",
        "selling_advice": "Harvest during early morning; cushion vehicle beds with straw.",
        "storage_advice": "Store at 10-15°C with 85-90% RH for 2-3 weeks.",
    },
}

# ── Price-query intent keywords ───────────────────────────────────────────────
MARKET_KEYWORDS = {
    "price", "rate", "bhav", "bhaav", "mandi", "msp", "market", "sell", "selling",
    "profit", "income", "cost", "rupee", "rupees", "value", "worth", "trade",
    "daam", "dam", "quintal", "export", "procurement", "supplyco", "nafed", "purchase",
    "minimum support", "support price", "farm gate", "khareed", "kharid", "apmc", "enam", "e-nam",
}

# Comprehensive 60+ Indian crop alias dictionary: English, Hindi, transliterated & regional names.
# Sorted by length descending when searched so multi-word keys match first.
CROP_ALIASES: dict[str, str] = {
    # Multi-word names (must match before single tokens)
    "sweet potato": "sweet_potato",
    "green peas": "green_peas",
    "hari matar": "green_peas",
    "green chilli": "chilli",
    "hari mirch": "chilli",
    "patta gobhi": "cabbage",
    "bandha kobi": "cabbage",
    "phool gobhi": "cauliflower",
    "phul gobhi": "cauliflower",
    "phulgobi": "cauliflower",
    "shimla mirch": "capsicum",
    "bell pepper": "capsicum",
    "capsicum": "capsicum",
    "bottle gourd": "bottle_gourd",
    "bitter gourd": "bitter_gourd",
    "ridge gourd": "ridge_gourd",
    "sponge gourd": "bottle_gourd",
    "pointed gourd": "pointed_gourd",
    "pigeon pea": "pigeon_pea",
    "black gram": "urad",
    "green gram": "moong",
    "finger millet": "ragi",
    "pearl millet": "bajra",
    "french beans": "french_beans",
    "cluster beans": "french_beans",
    "sweet lime": "lemon",
    "acid lime": "lemon",
    "lady finger": "okra",

    # Root & Tuber Vegetables
    "carrot": "carrot",
    "gajar": "carrot",
    "gaajar": "carrot",
    "radish": "radish",
    "mooli": "radish",
    "muli": "radish",
    "beetroot": "beetroot",
    "chukandar": "beetroot",
    "chukander": "beetroot",
    "potato": "potato",
    "aloo": "potato",
    "alu": "potato",
    "urulaikizhangu": "potato",
    "batata": "potato",
    "shakarkand": "sweet_potato",
    "shakarkandi": "sweet_potato",
    "colocasia": "colocasia",
    "arbi": "colocasia",
    "arvi": "colocasia",
    "taro": "colocasia",

    # Cole Crops & Leafy Greens
    "cauliflower": "cauliflower",
    "gobhi": "cauliflower",
    "gobi": "cauliflower",
    "cabbage": "cabbage",
    "spinach": "spinach",
    "palak": "spinach",
    "fenugreek": "fenugreek",
    "methi": "fenugreek",
    "coriander": "coriander",
    "dhaniya": "coriander",
    "dhania": "coriander",

    # Solanaceous & Fruit Vegetables
    "tomato": "tomato",
    "tamatar": "tomato",
    "thakkali": "tomato",
    "onion": "onion",
    "pyaaz": "onion",
    "pyaj": "onion",
    "pyaz": "onion",
    "savala": "onion",
    "vengayam": "onion",
    "kanda": "onion",
    "brinjal": "brinjal",
    "eggplant": "brinjal",
    "baingan": "baingan",
    "aubergine": "brinjal",
    "okra": "okra",
    "bhindi": "okra",
    "bhendi": "okra",
    "peas": "green_peas",
    "matar": "green_peas",
    "mattar": "green_peas",

    # Cucurbits / Gourds
    "lauki": "bottle_gourd",
    "ghiya": "bottle_gourd",
    "karela": "bitter_gourd",
    "cucumber": "cucumber",
    "kheera": "cucumber",
    "khira": "cucumber",
    "pumpkin": "pumpkin",
    "kaddu": "pumpkin",
    "sitaphal": "pumpkin",
    "kashiphal": "pumpkin",
    "parwal": "pointed_gourd",
    "patol": "pointed_gourd",
    "torai": "ridge_gourd",
    "tori": "ridge_gourd",
    "turai": "ridge_gourd",

    # Spices & Condiments
    "chilli": "chilli",
    "mirchi": "chilli",
    "mirch": "chilli",
    "garlic": "garlic",
    "lahsun": "garlic",
    "lasan": "garlic",
    "ginger": "ginger",
    "adrak": "ginger",
    "inji": "ginger",
    "turmeric": "turmeric",
    "haldi": "turmeric",

    # Fruits
    "mango": "mango",
    "aam": "mango",
    "mavu": "mango",
    "banana": "banana",
    "kela": "banana",
    "vazha": "banana",
    "apple": "apple",
    "seb": "apple",
    "guava": "guava",
    "amrood": "guava",
    "papaya": "papaya",
    "papita": "papaya",
    "pomegranate": "pomegranate",
    "anar": "pomegranate",
    "lemon": "lemon",
    "nimbu": "lemon",
    "watermelon": "watermelon",
    "tarbooz": "watermelon",
    "tarbuj": "watermelon",

    # Cereals & Grains (MSP Mandated)
    "paddy": "paddy",
    "rice": "paddy",
    "dhan": "paddy",
    "dhaan": "paddy",
    "nel": "paddy",
    "wheat": "wheat",
    "gehun": "wheat",
    "gehu": "wheat",
    "gothambu": "wheat",
    "maize": "maize",
    "makka": "maize",
    "corn": "maize",
    "bajra": "bajra",
    "jowar": "jowar",
    "sorghum": "jowar",
    "ragi": "ragi",
    "mandua": "ragi",
    "barley": "barley",
    "jau": "barley",

    # Pulses (MSP Mandated)
    "chickpea": "chickpea",
    "chana": "chickpea",
    "gram": "chickpea",
    "kadalai": "chickpea",
    "tur": "pigeon_pea",
    "arhar": "pigeon_pea",
    "toor": "pigeon_pea",
    "moong": "moong",
    "urad": "urad",
    "lentil": "lentil",
    "masoor": "lentil",

    # Oilseeds & Cash Crops (MSP Mandated)
    "mustard": "mustard",
    "sarson": "mustard",
    "rai": "mustard",
    "rapeseed": "mustard",
    "soybean": "soybean",
    "soya": "soybean",
    "groundnut": "groundnut",
    "peanut": "groundnut",
    "mungfali": "groundnut",
    "cotton": "cotton",
    "kapas": "cotton",
    "sugarcane": "sugarcane",
    "ganna": "sugarcane",
    "cane": "sugarcane",
    "jute": "jute",
    "pat": "jute",
}

# Sorted alias list for greedy longest-match scanning
_SORTED_ALIASES = sorted(CROP_ALIASES.keys(), key=len, reverse=True)


def _cache_key(crop: str, region: str) -> str:
    return hashlib.md5(f"{crop.lower()}::{(region or '').lower()}".encode()).hexdigest()


def _get_cached(crop: str, region: str) -> Optional[dict]:
    key = _cache_key(crop, region)
    entry = _price_cache.get(key)
    if entry:
        data, ts = entry
        if time.monotonic() - ts < _PRICE_TTL:
            return data
        del _price_cache[key]
    return None


def _set_cached(crop: str, region: str, data: dict) -> None:
    _price_cache[_cache_key(crop, region)] = (data, time.monotonic())


def extract_crop_from_query(query: str) -> Optional[str]:
    """
    Extract the canonical crop mentioned in the user's query from 60+ Indian crops.
    Uses regex word boundaries to avoid false substring positives (e.g. 'rice' in 'price').
    Returns canonical key or None (NEVER defaults to potato).
    """
    if not query:
        return None
    q_lower = query.lower()

    for alias in _SORTED_ALIASES:
        pattern = r"\b" + re.escape(alias) + r"\b"
        if re.search(pattern, q_lower):
            return CROP_ALIASES[alias]
    return None


def detect_crop_in_query(english_query: str) -> Optional[str]:
    """Compatibility alias for extract_crop_from_query."""
    return extract_crop_from_query(english_query)


def is_market_related(english_query: str) -> bool:
    """Returns True if the query has market/price intent."""
    query_lower = (english_query or "").lower()
    words = set(re.findall(r"\w+", query_lower))
    return any(kw in words or kw in query_lower for kw in MARKET_KEYWORDS)


def classify_query_intent(query: str, input_mode: str = "text") -> str:
    """
    Classify the farmer query intent into:
      - 'MARKET_PRICE'
      - 'WEATHER'
      - 'DISEASE_DIAGNOSIS'
    """
    if input_mode == "image":
        return "DISEASE_DIAGNOSIS"

    q = (query or "").lower()
    words = set(re.findall(r"\w+", q))

    # 1. Market / Price intent (Check first so "potato rate" is not diagnosed as crop disease)
    if any(kw in words or kw in q for kw in MARKET_KEYWORDS):
        return "MARKET_PRICE"

    # 2. Weather intent
    weather_keywords = {
        "weather", "rain", "rainfall", "monsoon", "temperature", "forecast", "drizzle",
        "humidity", "wind", "storm", "cyclone", "cloud", "cloudy", "sunny",
    }
    if any(kw in words or kw in q for kw in weather_keywords):
        return "WEATHER"

    # 3. Default to disease / pest / agronomic advisory
    return "DISEASE_DIAGNOSIS"


def get_market_price(crop_name: str, region: str) -> dict:
    """
    Lookup market price for MSP crops or perishable horticultural APMC crops.
    Returns realistic modal benchmark rates and explicitly sets is_msp: bool.
    NEVER defaults to potato.
    """
    crop_lower = (crop_name or "").lower().strip()
    canonical_crop = CROP_ALIASES.get(crop_lower, crop_lower)
    reg_lower = (region or "").lower().strip()

    # 1. Non-MSP Horticultural crops check
    if canonical_crop in HORTICULTURAL_BENCHMARKS:
        info = HORTICULTURAL_BENCHMARKS[canonical_crop]
        market_name = info.get("default_market", f"{region} Mandi")
        modal_qtl = info.get("default_modal_qtl", 1500)
        range_qtl = info.get("default_range_qtl", f"₹{modal_qtl-250:,} - ₹{modal_qtl+250:,} per quintal")
        wholesale_kg = info.get("rate_per_kg_wholesale", f"₹{modal_qtl/100:.0f} / kg")
        retail_kg = info.get("rate_per_kg_retail", f"₹{(modal_qtl/100)*1.6:.0f} / kg")

        # Check regional override for UP / Gautam Buddha Nagar
        regional_dict = info.get("regional_markets", {})
        for reg_key, reg_val in regional_dict.items():
            if (
                reg_key in reg_lower
                or ("gautam" in reg_lower and "gautam" in reg_key)
                or ("dadri" in reg_lower and "gautam" in reg_key)
                or ("noida" in reg_lower and "gautam" in reg_key)
                or ("uttar pradesh" in reg_lower and "uttar pradesh" in reg_key)
            ):
                market_name = reg_val.get("market", market_name)
                modal_qtl = reg_val.get("modal_qtl", modal_qtl)
                range_qtl = reg_val.get("range_qtl", range_qtl)
                wholesale_kg = reg_val.get("wholesale_kg", wholesale_kg)
                retail_kg = reg_val.get("retail_kg", retail_kg)
                break

        return {
            "crop": info.get("crop", canonical_crop.title()),
            "price_per_quintal": float(modal_qtl),
            "price_range_per_quintal": range_qtl,
            "rate_per_kg_wholesale": wholesale_kg,
            "rate_per_kg_retail": retail_kg,
            "market": market_name,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "price_type": "APMC Wholesale Mandi Rate",
            "source": "APMC Mandi / e-NAM Benchmark",
            "is_msp": False,
            "unit": "per quintal",
            "mechanism": info.get("mechanism", "Open APMC Mandi Wholesale Auction (No Central Government MSP applies)"),
            "grade_criteria": info.get("grade_criteria", "Grade A (super quality produce), Grade B (medium grade), Grade C (local/lower grade)"),
            "selling_advice": info.get("selling_advice", "Clean, grade, and pack produce in breathable crates or leno bags to fetch top prices."),
            "storage_advice": info.get("storage_advice", "Store in well-ventilated dry conditions or cold storage to avoid distress sales."),
        }

    # 2. Central Government MSP crops
    if canonical_crop in MSP_BENCHMARKS:
        msp_data = MSP_BENCHMARKS[canonical_crop]
        price = msp_data.get("common", 0)
        unit = msp_data.get("unit", "per quintal")
        return {
            "crop": msp_data.get("crop", canonical_crop.title()),
            "price_per_quintal": float(price),
            "price_range_per_quintal": f"₹{price:,.0f} {unit} (MSP Base)",
            "rate_per_kg_wholesale": msp_data.get("rate_per_kg_wholesale", f"₹{price/100:.2f} / kg"),
            "rate_per_kg_retail": msp_data.get("rate_per_kg_retail", f"₹{(price/100)*1.35:.1f} / kg"),
            "market": msp_data.get("market", f"{region} (MSP Procurement Centre / APMC)"),
            "date": "2024-25 / 2025-26",
            "price_type": "Government MSP (Minimum Support Price)",
            "source": "Government of India — CACP Declared MSP",
            "is_msp": True,
            "unit": unit,
            "mechanism": "Central Government Minimum Support Price (CACP Declared MSP Procurement)",
            "grade_criteria": msp_data.get("grade_criteria", "FAQ (Fair Average Quality) standard"),
            "selling_advice": msp_data.get("selling_advice", "Dry and clean produce to meet FAQ moisture and purity parameters for direct MSP purchase."),
            "storage_advice": msp_data.get("storage_advice", "Store in clean moisture-proof godowns on wooden dunnage."),
        }

    # 3. Neutral default fallback for unspecified or general commodity query
    return {
        "crop": canonical_crop.title() if canonical_crop and canonical_crop != "general" else "Agricultural Produce",
        "price_per_quintal": 0.0,
        "price_range_per_quintal": "Refer to daily APMC Mandi e-NAM auction bulletin",
        "rate_per_kg_wholesale": "Variable based on daily arrivals",
        "rate_per_kg_retail": "Variable based on retail market",
        "market": region or "Local District APMC Mandi",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "price_type": "APMC Mandi Quotation",
        "source": "Local APMC Market Quotation / e-NAM",
        "is_msp": False,
        "unit": "per quintal",
        "mechanism": "Open APMC Mandi Wholesale Auction",
        "grade_criteria": "Grade A (uniform size, undamaged, high dry matter), Grade B (standard commercial grade), Grade C (undersized/blemished)",
        "selling_advice": "Clean, grade, and pack produce in breathable crates or leno bags to secure maximum modal auction rates.",
        "storage_advice": "Hold in designated APMC warehouse or cold storage based on crop perishability to avoid distress selling.",
    }


async def fetch_current_price(crop_name: str, region: str) -> dict:
    """
    Fetch current MSP / mandi rate for a crop with 6h TTL caching.
    """
    canonical_crop = CROP_ALIASES.get(crop_name.lower(), crop_name.lower())
    cached = _get_cached(canonical_crop, region)
    if cached:
        return cached

    result = get_market_price(canonical_crop, region)
    _set_cached(canonical_crop, region, result)
    return result


def format_price_context(price_data: dict) -> str:
    """Format market price data as LLM context string."""
    is_msp = price_data.get("is_msp", False)
    header = "OFFICIAL GOVERNMENT MSP" if is_msp else "APMC WHOLESALE MANDI RATE (NON-MSP HORTICULTURE)"
    lines = [
        f"[{header} — Source: {price_data.get('source', 'e-NAM / Mandi Benchmark')}]",
        f"Crop: {price_data.get('crop', '')}",
        f"Market / Region: {price_data.get('market', '')}",
        f"Market Mechanism: {price_data.get('mechanism', 'Open APMC Mandi Wholesale Auction')}",
    ]
    if price_data.get("price_per_quintal") and price_data["price_per_quintal"] > 0:
        lines.append(f"Modal Wholesale Price: ₹{price_data.get('price_per_quintal', 0):.0f} per quintal")
    if price_data.get("price_range_per_quintal"):
        lines.append(f"Wholesale Benchmark Range: {price_data['price_range_per_quintal']}")
    if price_data.get("rate_per_kg_wholesale"):
        lines.append(f"Approx Wholesale Rate per kg: {price_data['rate_per_kg_wholesale']}")
    if price_data.get("rate_per_kg_retail"):
        lines.append(f"Approx Retail Rate per kg: {price_data['rate_per_kg_retail']}")
    if price_data.get("grade_criteria"):
        lines.append(f"Grade-Wise Criteria: {price_data['grade_criteria']}")
    if price_data.get("selling_advice"):
        lines.append(f"Selling Advice: {price_data['selling_advice']}")
    if price_data.get("storage_advice"):
        lines.append(f"Storage Guidelines: {price_data['storage_advice']}")
    lines.append(f"Date: {price_data.get('date', '')}")
    return "\n".join(lines)
