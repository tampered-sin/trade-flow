import re
from typing import List, Dict, Any, Tuple

def normalize_headers(headers: List[str]) -> List[str]:
    """
    Normalizes a list of headers:
    - Trim whitespace
    - Collapse multiple spaces
    - Remove non-printable characters
    - Normalize punctuation (\r\n, \t)
    - Convert to Title Case
    """
    normalized = []
    for h in headers:
        # Replace \r\n, \t with space
        h = h.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ')
        # Remove non-printable (keep alphanumeric, punctuation, space)
        h = "".join(ch for ch in h if ch.isprintable())
        # Collapse spaces
        h = re.sub(r'\s+', ' ', h).strip()
        # Title Case
        h = h.title()
        normalized.append(h)
    return normalized

def detect_mapping(headers: List[str], filename: str, known_mappings: List[Dict[str, Any]]) -> Tuple[Dict[str, Any] | None, float]:
    """
    Detects the best mapping for the given headers and filename.
    Returns (best_mapping, confidence_score).
    """
    best_mapping = None
    best_score = 0.0

    # Ambiguous headers that penalize score
    AMBIGUOUS_HEADERS = ["Amount", "Value", "Total", "Gross", "Net"]

    for mapping in known_mappings:
        score = 0.0
        max_possible_score = 2.0 + len(mapping.get("column_map", {}))

        # 1. Filename pattern match (+2.0)
        patterns = mapping.get("file_name_patterns", [])
        if any(p.lower() in filename.lower() for p in patterns):
            score += 2.0

        # 2. Header matching
        mapping_keys = mapping.get("column_map", {}).keys()
        for key in mapping_keys:
            # Exact match (+1.0)
            if key in headers:
                score += 1.0
            else:
                # Case/whitespace-insensitive match (+0.5)
                key_norm = re.sub(r'\s+', '', key.lower())
                headers_norm = [re.sub(r'\s+', '', h.lower()) for h in headers]
                if key_norm in headers_norm:
                    score += 0.5

        # 3. Ambiguous header penalty (-0.2 per match)
        for h in headers:
            if h in AMBIGUOUS_HEADERS:
                score -= 0.2

        # Calculate confidence
        confidence = min(1.0, score / max_possible_score) if max_possible_score > 0 else 0.0

        if confidence > best_score:
            best_score = confidence
            best_mapping = mapping

    return best_mapping, best_score
