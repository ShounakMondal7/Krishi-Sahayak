import pytest
from app.services import market
from app.services import llm


def test_classify_query_intent():
    assert market.classify_query_intent("price of potato here") == "MARKET_PRICE"
    assert market.classify_query_intent("aalu ka bhav kya hai mandi me") == "MARKET_PRICE"
    assert market.classify_query_intent("what is the current mandi rate of onion") == "MARKET_PRICE"
    assert market.classify_query_intent("weather forecast for tomorrow in dadri") == "WEATHER"
    assert market.classify_query_intent("will it rain today evening") == "WEATHER"
    assert market.classify_query_intent("tomato leaves turning yellow with brown spots") == "DISEASE_DIAGNOSIS"
    assert market.classify_query_intent("price of potato", input_mode="image") == "DISEASE_DIAGNOSIS"


def test_get_market_price_horticulture_and_msp():
    # Horticultural Non-MSP crop
    potato_info = market.get_market_price("potato", region="Uttar Pradesh")
    assert potato_info["is_msp"] is False
    assert potato_info["crop"] == "Potato (Aloo)"
    assert 1300 <= potato_info["price_per_quintal"] <= 1800
    assert "quintal" in potato_info["unit"]

    # MSP crop
    paddy_info = market.get_market_price("paddy", region="Uttar Pradesh")
    assert paddy_info["is_msp"] is True
    assert paddy_info["crop"] == "Paddy"
    assert paddy_info["price_per_quintal"] == 2300


def test_format_price_context():
    potato_info = market.get_market_price("potato", region="Gautam Buddha Nagar")
    ctx = market.format_price_context(potato_info)
    assert "Perishable crop" in ctx
    assert "Open APMC Mandi Wholesale Auction" in ctx
    assert "₹" in ctx

    wheat_info = market.get_market_price("wheat", region="Uttar Pradesh")
    ctx_wheat = market.format_price_context(wheat_info)
    assert "MSP" in ctx_wheat
    assert "2,275" in ctx_wheat or "2275" in ctx_wheat


def test_market_advisory_generation():
    query = "what is the current price of potato in mandi"
    potato_info = market.get_market_price("potato", region="Dadri")
    ctx = market.format_price_context(potato_info)
    advisory = llm.generate_answer(query, [ctx], intent="MARKET_PRICE")

    # Must contain the 4 standardized market sections
    assert "Market & Commodity Status" in advisory
    assert "Current Estimated Mandi Rates" in advisory
    assert "Selling Advice & Storage Guidelines" in advisory
    assert "Official Market Gateways & Support" in advisory

    # Must NOT mention disease, neem, or knapsack spray
    assert "Field Diagnosis" not in advisory
    assert "knapsack" not in advisory.lower()
    assert "neem oil" not in advisory.lower()
    assert "fungicide" not in advisory.lower()
