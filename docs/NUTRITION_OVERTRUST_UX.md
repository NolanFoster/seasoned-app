# Nutrition Overtrust UX & Attention Friction (Wave 19 #538)

## 1. Context & Behavioral Finding
Recent research from ACM UMAP 2026 (*Using AI as a Chef: Users Overlook Nutritional Flaws in LLM-Generated Recipes*, Lysova, Trattner, Starke — [DOI 10.1145/3774935.3806157](https://doi.org/10.1145/3774935.3806157)) establishes a critical behavioral flaw in AI recipe tools:

Users routinely skim and overlook substantial nutritional flaws (e.g. extreme sodium, excessive saturated fats) in LLM-generated recipes when cards appear complete, polished, and fluent.

## 2. Attention Friction Framework

To counteract overtrust without moralizing or medical diagnosing:
1. **UK FSA-Style Traffic Lights**: Per-serving classification into Green (Low), Amber (Medium), and Red (High) for:
   - Total Fat
   - Saturated Fat
   - Sugars
   - Salt / Sodium
2. **Honest Confidence Signaling**: Clear `Confidence: HIGH | MEDIUM | LOW | UNKNOWN` indicators tied to USDA FoodData Central ingredient matching coverage rather than pseudo-accurate single-point numbers.
3. **Selective Friction Gates**: Prominent alert banners for any recipe containing Red lights, ensuring users notice high-density nutrients before planning or cooking.

## 3. Non-Clinical Framing
- Traffic lights represent population dietary guidelines (UK FSA reference benchmarks), not personalized medical advice or prescription therapy.
- Color alone is never the sole differentiator: color-blind safe textual levels and nutrient quantities are always included.
