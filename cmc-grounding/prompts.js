/* global GROUNDING_CONFIG */

window.GROUNDING_PROMPTS = {
  build({ frameworkId, atom, catalogSlice, cueSuggestions }) {
    const type = atom.atom_type || "unknown";
    const text = atom.atom_text || "";
    const cues = (cueSuggestions && cueSuggestions.facets) || [];
    const cueBlock =
      cues.length > 0
        ? `\nCue-rule hints (may accept or ignore):\n${JSON.stringify(cues, null, 2)}\n`
        : "\nCue-rule hints: none for this atom — rely on Catalog only.\n";

    if (frameworkId === "onet") {
      return `You ground ONE training atom against a FIXED O*NET catalog for one SOC.
Atom type: ${type}
Atom text: "${text}"
${cueBlock}
Catalog (JSON — only use these elements):
${JSON.stringify(catalogSlice, null, 2)}

Return ONLY JSON (no markdown):
{
  "overall_match": "exact|close|related|none",
  "soc_code": "17-3027.00",
  "items": [
    {
      "category": "task|dwa|work_activity|knowledge|skill|ability",
      "id": "from Catalog",
      "name": "from Catalog",
      "importance": 83,
      "match": "exact|close|related",
      "why": "≤15 words"
    }
  ],
  "categories_present": {
    "task": false, "dwa": false, "work_activity": false,
    "knowledge": false, "skill": false, "ability": false
  }
}
Rules:
- Only use id/name/importance from Catalog. Copy importance; do not invent.
- Prefer ≤3 items. Set categories_present true only for categories you include.
- Ability only if clearly cognitive; mark category=ability.
- If none fit: overall_match=none and items=[].`;
    }

    if (frameworkId === "esco") {
      return `You ground ONE training atom against a FIXED ESCO seed catalog (or say none).
Atom type: ${type}
Atom text: "${text}"

Catalog (JSON — prefer these; if wrong, return none rather than invent URIs):
${JSON.stringify(catalogSlice, null, 2)}

Return ONLY JSON (no markdown):
{
  "overall_match": "exact|close|related|none",
  "items": [
    {
      "uri": "from Catalog or verified ESCO URL",
      "preferred_label": "...",
      "broader_label": "...",
      "skill_type": "skill|knowledge",
      "match": "exact|close|related",
      "why": "≤15 words"
    }
  ]
}
Rules:
- Prefer ≤3 items. Do not invent ESCO URIs.
- If Catalog is weak, overall_match=none and items=[].`;
    }

    // CMC engineering / advanced_manufacturing
    return `You ground ONE training atom against a FIXED CMC competency catalog (PDF / CareerOneStop model).
Atom type: ${type}
Atom text: "${text}"
Framework: ${frameworkId}

Catalog (JSON — only use these blocks):
${JSON.stringify(catalogSlice, null, 2)}

Return ONLY JSON (no markdown):
{
  "overall_match": "exact|close|related|none",
  "items": [
    {
      "ref": "4.2",
      "title": "from Catalog",
      "tier": 4,
      "url": "from Catalog if present",
      "match": "exact|close|related",
      "why": "≤15 words"
    }
  ]
}
Rules:
- Prefer ≤3 items. Copy ref + title from Catalog; do not invent refs.
- Prefer Tier 4 when equally plausible for Advanced Manufacturing.
- If none fit: overall_match=none and items=[].`;
  },
};
