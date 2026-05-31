#!/usr/bin/env python3
"""
Build a college shortlist for materials science + biology/neuro/pre-med fit.

Data source: U.S. Department of Education College Scorecard downloadable CSVs.
The script intentionally uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import textwrap
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "inputs" / "student_profile.json"
DATA_DIR = ROOT / "data" / "raw"
OUTPUT_DIR = ROOT / "outputs"

SCORECARD_UPDATED = "2026-03-23"
DATASETS = {
    "institution": {
        "url": "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_03232026.zip",
        "zip": "Most-Recent-Cohorts-Institution_03232026.zip",
        "csv": "Most-Recent-Cohorts-Institution.csv",
    },
    "field": {
        "url": "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_03232026.zip",
        "zip": "Most-Recent-Cohorts-Field-of-Study_03232026.zip",
        "csv": "Most-Recent-Cohorts-Field-of-Study.csv",
    },
}

MATERIALS_CIPS = {
    "1406": "Ceramic Sciences and Engineering",
    "1418": "Materials Engineering",
    "1432": "Polymer/Plastics Engineering",
    "4010": "Materials Sciences",
}

BIOLOGY_CIPS = {
    "2601": "Biology, General",
    "2602": "Biochemistry, Biophysics and Molecular Biology",
    "2604": "Cell/Cellular Biology and Anatomical Sciences",
    "2605": "Microbiological Sciences and Immunology",
    "2609": "Physiology, Pathology and Related Sciences",
    "2610": "Pharmacology and Toxicology",
    "2611": "Biomathematics, Bioinformatics, and Computational Biology",
    "3001": "Biological and Physical Sciences",
}

NEURO_MED_CIPS = {
    "2615": "Neurobiology and Neurosciences",
    "3027": "Human Biology",
}


# Subjective but explicit flags for well-known research environments that may
# not be fully captured by 4-digit undergraduate CIP program counts.
RESEARCH_FLAGS: dict[str, dict[str, Any]] = {
    "Arizona State University Campus Immersion": {
        "materials": 0.70,
        "bio_med": 0.50,
        "biomaterials": 0.55,
        "note": "Large public R1 with engineering, bioengineering, and life-science scale.",
    },
    "Boston University": {
        "materials": 0.50,
        "bio_med": 0.95,
        "biomaterials": 0.75,
        "note": "Strong urban biomedical ecosystem and flexible bioengineering adjacency.",
    },
    "Brown University": {
        "materials": 0.40,
        "bio_med": 0.90,
        "biomaterials": 0.65,
        "note": "Open curriculum helps combine biology, engineering, and neuroscience.",
    },
    "California Institute of Technology": {
        "materials": 0.95,
        "bio_med": 0.50,
        "biomaterials": 0.75,
        "note": "Elite materials and bioengineering research, but very small and extremely selective.",
    },
    "California Polytechnic State University-San Luis Obispo": {
        "materials": 0.60,
        "bio_med": 0.15,
        "biomaterials": 0.25,
        "note": "Practical engineering option in California; weaker clinical ecosystem.",
    },
    "Carnegie Mellon University": {
        "materials": 0.90,
        "bio_med": 0.40,
        "biomaterials": 0.65,
        "note": "Excellent engineering/computation; best if computational biology is central.",
    },
    "Case Western Reserve University": {
        "materials": 0.60,
        "bio_med": 1.00,
        "biomaterials": 0.80,
        "note": "Strong pre-med/biomedical ecosystem with nearby clinical research depth.",
    },
    "Columbia University in the City of New York": {
        "materials": 0.60,
        "bio_med": 1.00,
        "biomaterials": 0.80,
        "note": "Urban academic medical center plus engineering and neuroscience access.",
    },
    "Colorado School of Mines": {
        "materials": 0.95,
        "bio_med": 0.10,
        "biomaterials": 0.25,
        "note": "Great pure materials option; less aligned with clinical/neuro goals.",
    },
    "Cornell University": {
        "materials": 0.90,
        "bio_med": 0.80,
        "biomaterials": 0.85,
        "note": "Strong engineering, materials, biology, and translational research options.",
    },
    "Drexel University": {
        "materials": 0.65,
        "bio_med": 0.85,
        "biomaterials": 0.75,
        "note": "Co-op model and Philadelphia biomedical ecosystem can fit applied research.",
    },
    "Duke University": {
        "materials": 0.70,
        "bio_med": 1.00,
        "biomaterials": 0.85,
        "note": "High-end biomedical, neuroscience, and clinical research environment.",
    },
    "Georgia Institute of Technology-Main Campus": {
        "materials": 1.00,
        "bio_med": 0.60,
        "biomaterials": 0.80,
        "note": "Top engineering/materials strength with biomedical engineering access.",
    },
    "Harvard University": {
        "materials": 0.55,
        "bio_med": 1.00,
        "biomaterials": 0.75,
        "note": "Exceptional biology/medical ecosystem; materials may sit more through SEAS/labs.",
    },
    "Johns Hopkins University": {
        "materials": 0.65,
        "bio_med": 1.00,
        "biomaterials": 0.90,
        "note": "Best-fit biomedical, neuroscience, clinical, and pre-med ecosystem.",
    },
    "Lehigh University": {
        "materials": 0.75,
        "bio_med": 0.40,
        "biomaterials": 0.50,
        "note": "Good engineering/materials option with a more focused campus feel.",
    },
    "Massachusetts Institute of Technology": {
        "materials": 1.00,
        "bio_med": 0.75,
        "biomaterials": 0.95,
        "note": "Elite materials/biological engineering blend, with Boston medical adjacency.",
    },
    "North Carolina State University at Raleigh": {
        "materials": 0.90,
        "bio_med": 0.50,
        "biomaterials": 0.60,
        "note": "Strong public engineering/materials value with Research Triangle adjacency.",
    },
    "Northeastern University": {
        "materials": 0.55,
        "bio_med": 0.75,
        "biomaterials": 0.70,
        "note": "Co-op and Boston lab access can fit applied bio/materials exploration.",
    },
    "Northwestern University": {
        "materials": 0.95,
        "bio_med": 0.95,
        "biomaterials": 0.95,
        "note": "One of the strongest overlaps for materials, biomedical engineering, and medicine.",
    },
    "Ohio State University-Main Campus": {
        "materials": 0.75,
        "bio_med": 0.90,
        "biomaterials": 0.70,
        "note": "Large public R1 with medical center and engineering breadth.",
    },
    "Pennsylvania State University-Main Campus": {
        "materials": 1.00,
        "bio_med": 0.45,
        "biomaterials": 0.55,
        "note": "Materials powerhouse; clinical/neuro path requires more intentional planning.",
    },
    "Princeton University": {
        "materials": 0.90,
        "bio_med": 0.65,
        "biomaterials": 0.75,
        "note": "Excellent materials and molecular biology; no attached medical school.",
    },
    "Purdue University-Main Campus": {
        "materials": 1.00,
        "bio_med": 0.45,
        "biomaterials": 0.60,
        "note": "Very strong engineering/materials option with solid life-science breadth.",
    },
    "Rensselaer Polytechnic Institute": {
        "materials": 0.80,
        "bio_med": 0.30,
        "biomaterials": 0.50,
        "note": "Engineering-heavy school; useful if materials is primary.",
    },
    "Rice University": {
        "materials": 0.75,
        "bio_med": 0.85,
        "biomaterials": 0.85,
        "note": "Small elite undergrad plus Texas Medical Center adjacency.",
    },
    "Rutgers University-New Brunswick": {
        "materials": 0.75,
        "bio_med": 0.85,
        "biomaterials": 0.70,
        "note": "Strong public option with engineering, life sciences, and medical ecosystem access.",
    },
    "Stanford University": {
        "materials": 1.00,
        "bio_med": 1.00,
        "biomaterials": 1.00,
        "note": "Closest profile match: materials, bioengineering, stem-cell/neuro, and Bay Area labs.",
    },
    "Texas A & M University-College Station": {
        "materials": 0.90,
        "bio_med": 0.60,
        "biomaterials": 0.65,
        "note": "Large engineering/materials ecosystem with biomedical options.",
    },
    "The University of Texas at Austin": {
        "materials": 0.85,
        "bio_med": 0.80,
        "biomaterials": 0.75,
        "note": "Strong engineering plus improving medical/biomedical ecosystem.",
    },
    "Tufts University": {
        "materials": 0.45,
        "bio_med": 0.95,
        "biomaterials": 0.75,
        "note": "Good biology/pre-med fit with engineering access and Boston adjacency.",
    },
    "University of Arizona": {
        "materials": 0.60,
        "bio_med": 0.75,
        "biomaterials": 0.60,
        "note": "More accessible R1 with medicine, neuroscience, and engineering breadth.",
    },
    "University of California-Berkeley": {
        "materials": 1.00,
        "bio_med": 0.70,
        "biomaterials": 0.85,
        "note": "Top California public for materials and molecular/cell biology; no med school on campus.",
    },
    "University of California-Davis": {
        "materials": 0.75,
        "bio_med": 0.90,
        "biomaterials": 0.80,
        "note": "Excellent California public for biology, pre-health, and bioengineering breadth.",
    },
    "University of California-Irvine": {
        "materials": 0.65,
        "bio_med": 0.90,
        "biomaterials": 0.75,
        "note": "Strong neuro/pre-med campus with engineering and California value.",
    },
    "University of California-Los Angeles": {
        "materials": 0.85,
        "bio_med": 1.00,
        "biomaterials": 0.90,
        "note": "Excellent California public for pre-med/neuro plus materials/engineering.",
    },
    "University of California-Riverside": {
        "materials": 0.45,
        "bio_med": 0.75,
        "biomaterials": 0.55,
        "note": "More accessible UC with medical school and useful life-science path.",
    },
    "University of California-San Diego": {
        "materials": 0.85,
        "bio_med": 1.00,
        "biomaterials": 0.90,
        "note": "Excellent California public for bioengineering, neuroscience, and medicine.",
    },
    "University of California-Santa Barbara": {
        "materials": 1.00,
        "bio_med": 0.50,
        "biomaterials": 0.65,
        "note": "Very strong materials; weaker clinical path than UCLA/UCSD/UCD/UCI.",
    },
    "University of California-Santa Cruz": {
        "materials": 0.30,
        "bio_med": 0.45,
        "biomaterials": 0.45,
        "note": "Good California biology/bioinformatics option; materials less central.",
    },
    "University of Delaware": {
        "materials": 0.80,
        "bio_med": 0.40,
        "biomaterials": 0.55,
        "note": "Solid engineering/materials option with smaller-school feel.",
    },
    "University of Florida": {
        "materials": 0.55,
        "bio_med": 0.80,
        "biomaterials": 0.65,
        "note": "Large public pre-med/biology ecosystem with engineering options.",
    },
    "University of Illinois Urbana-Champaign": {
        "materials": 1.00,
        "bio_med": 0.55,
        "biomaterials": 0.70,
        "note": "Materials/engineering powerhouse; bio/medicine path is less direct.",
    },
    "University of Maryland-College Park": {
        "materials": 0.85,
        "bio_med": 0.65,
        "biomaterials": 0.70,
        "note": "Strong public engineering/science school near federal research ecosystem.",
    },
    "University of Massachusetts-Amherst": {
        "materials": 0.75,
        "bio_med": 0.55,
        "biomaterials": 0.60,
        "note": "Good materials/polymer and life-science option; less clinical than med-center schools.",
    },
    "University of Michigan-Ann Arbor": {
        "materials": 0.95,
        "bio_med": 1.00,
        "biomaterials": 0.95,
        "note": "Excellent broad fit: materials, biomedical, neuroscience, medicine.",
    },
    "University of Minnesota-Twin Cities": {
        "materials": 0.90,
        "bio_med": 0.90,
        "biomaterials": 0.80,
        "note": "Strong R1 with engineering, medicine, and biomedical research depth.",
    },
    "University of Pennsylvania": {
        "materials": 0.80,
        "bio_med": 1.00,
        "biomaterials": 0.90,
        "note": "Excellent bioengineering, neuroscience, and clinical research environment.",
    },
    "University of Pittsburgh-Pittsburgh Campus": {
        "materials": 0.55,
        "bio_med": 1.00,
        "biomaterials": 0.75,
        "note": "Excellent clinical/medical research environment; materials less central.",
    },
    "University of Rochester": {
        "materials": 0.50,
        "bio_med": 1.00,
        "biomaterials": 0.70,
        "note": "Strong medical/neuroscience ecosystem with flexible undergraduate research options.",
    },
    "University of Southern California": {
        "materials": 0.70,
        "bio_med": 0.90,
        "biomaterials": 0.80,
        "note": "Private California option with engineering and major medical ecosystem.",
    },
    "University of Virginia-Main Campus": {
        "materials": 0.55,
        "bio_med": 0.85,
        "biomaterials": 0.65,
        "note": "Strong pre-med/public R1 option with medical school access.",
    },
    "University of Washington-Seattle Campus": {
        "materials": 0.80,
        "bio_med": 1.00,
        "biomaterials": 0.90,
        "note": "Excellent medicine, neuroscience, bioengineering, and research ecosystem.",
    },
    "University of Wisconsin-Madison": {
        "materials": 0.80,
        "bio_med": 0.90,
        "biomaterials": 0.80,
        "note": "Strong public R1 for biology, engineering, neuroscience, and medicine.",
    },
    "Vanderbilt University": {
        "materials": 0.50,
        "bio_med": 1.00,
        "biomaterials": 0.75,
        "note": "Excellent medicine/neuroscience/pre-med environment; materials less central.",
    },
    "Virginia Polytechnic Institute and State University": {
        "materials": 0.95,
        "bio_med": 0.50,
        "biomaterials": 0.60,
        "note": "Strong engineering/materials; bio/clinical path is available but less central.",
    },
    "Washington University in St Louis": {
        "materials": 0.70,
        "bio_med": 1.00,
        "biomaterials": 0.85,
        "note": "Excellent pre-med and biomedical research ecosystem.",
    },
    "Yale University": {
        "materials": 0.50,
        "bio_med": 1.00,
        "biomaterials": 0.75,
        "note": "Strong biology/neuroscience/medicine; materials path is more selective and lab-based.",
    },
}


@dataclass
class SchoolScore:
    rank: int
    name: str
    city: str
    state: str
    control: str
    admit_rate: float | None
    band: str
    score: float
    materials_score: float
    biology_score: float
    profile_score: float
    outcomes_score: float
    access_score: float
    ca_value_score: float
    materials_awards: float
    biology_awards: float
    neuro_awards: float
    completion_rate: float | None
    retention_rate: float | None
    sat_avg: float | None
    undergrad_size: float | None
    earnings_10yr: float | None
    tuition_in: float | None
    tuition_out: float | None
    net_price: float | None
    programs: str
    why_apply: str
    caution: str


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"NA", "NULL", "PrivacySuppressed", "PS"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def mean_present(values: Iterable[float | None], default: float = 0.0) -> float:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else default


def percent(value: float | None) -> str:
    return "" if value is None else f"{value * 100:.1f}%"


def money(value: float | None) -> str:
    return "" if value is None else f"${value:,.0f}"


def compact(value: float | None) -> str:
    return "" if value is None else f"{value:.0f}"


def log_scaled(value: float, reference: float) -> float:
    if value <= 0 or reference <= 0:
        return 0.0
    return clamp(math.log1p(value) / math.log1p(reference))


def percentile_reference(values: Iterable[float], pct: float = 0.95) -> float:
    vals = sorted(v for v in values if v > 0)
    if not vals:
        return 1.0
    idx = min(len(vals) - 1, max(0, round((len(vals) - 1) * pct)))
    return vals[idx]


def admit_band(admit_rate: float | None) -> str:
    if admit_rate is None:
        return "Unknown admit rate"
    if admit_rate < 0.10:
        return "Far reach by admit rate"
    if admit_rate < 0.20:
        return "Reach by admit rate"
    if admit_rate < 0.45:
        return "Competitive/possible by admit rate"
    return "More accessible by admit rate"


def access_from_admit_rate(admit_rate: float | None) -> float:
    if admit_rate is None:
        return 0.45
    if admit_rate < 0.05:
        return 0.25
    if admit_rate < 0.10:
        return 0.35
    if admit_rate < 0.20:
        return 0.55
    if admit_rate < 0.45:
        return 0.80
    return 1.00


def ensure_dataset(kind: str, refresh: bool = False) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    spec = DATASETS[kind]
    dest = DATA_DIR / spec["zip"]
    if refresh or not dest.exists():
        print(f"Downloading {kind} Scorecard data...")
        req = urllib.request.Request(
            spec["url"],
            headers={"User-Agent": "college-matcher/1.0"},
        )
        with urllib.request.urlopen(req) as response, dest.open("wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    return dest


def iter_csv_from_zip(zip_path: Path, csv_name: str) -> Iterable[dict[str, str]]:
    with ZipFile(zip_path) as zf:
        with zf.open(csv_name) as fp:
            lines = (line.decode("utf-8-sig", errors="replace") for line in fp)
            yield from csv.DictReader(lines)


def load_profile(path: Path) -> dict[str, Any]:
    with path.open() as f:
        profile = json.load(f)
    weights = profile.get("weights", {})
    total = sum(float(v) for v in weights.values())
    if not 0.99 <= total <= 1.01:
        raise ValueError(f"profile weights must sum to 1.0, got {total:.3f}")
    return profile


def load_field_strengths(field_zip: Path) -> dict[str, dict[str, Any]]:
    by_unit: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "materials_awards": 0.0,
            "biology_awards": 0.0,
            "neuro_awards": 0.0,
            "materials_grad_depth": 0.0,
            "biology_grad_depth": 0.0,
            "neuro_grad_depth": 0.0,
            "program_titles": defaultdict(set),
        }
    )

    for row in iter_csv_from_zip(field_zip, DATASETS["field"]["csv"]):
        unitid = row["UNITID"]
        cip = row["CIPCODE"]
        cred = row["CREDLEV"]
        title = row["CIPDESC"].rstrip(".")
        count = max(numeric(row.get("IPEDSCOUNT1")) or 0, numeric(row.get("IPEDSCOUNT2")) or 0)

        group: str | None = None
        if cip in MATERIALS_CIPS:
            group = "materials"
        elif cip in BIOLOGY_CIPS:
            group = "biology"
        elif cip in NEURO_MED_CIPS:
            group = "neuro"

        if group is None:
            continue

        info = by_unit[unitid]
        info["program_titles"][group].add(title)
        if cred == "3":
            info[f"{group}_awards"] += count
        elif cred in {"5", "6", "7"}:
            info[f"{group}_grad_depth"] += 1.0

    return by_unit


def load_institutions(inst_zip: Path) -> list[dict[str, str]]:
    rows = []
    for row in iter_csv_from_zip(inst_zip, DATASETS["institution"]["csv"]):
        if row.get("MAIN") != "1":
            continue
        if row.get("PREDDEG") != "3":
            continue
        if row.get("CONTROL") not in {"1", "2"}:
            continue
        ugds = numeric(row.get("UGDS"))
        if ugds is None or ugds < 500:
            continue
        rows.append(row)
    return rows


def score_schools(profile: dict[str, Any], institutions: list[dict[str, str]], field: dict[str, dict[str, Any]]) -> list[SchoolScore]:
    weights = {k: float(v) for k, v in profile["weights"].items()}
    home_state = profile.get("home_state")

    mat_ref = percentile_reference((field.get(r["UNITID"], {}).get("materials_awards", 0.0) for r in institutions), 0.95)
    bio_ref = percentile_reference((field.get(r["UNITID"], {}).get("biology_awards", 0.0) for r in institutions), 0.95)
    neuro_ref = percentile_reference((field.get(r["UNITID"], {}).get("neuro_awards", 0.0) for r in institutions), 0.95)
    earn_ref = percentile_reference((numeric(r.get("MD_EARN_WNE_P10")) or 0.0 for r in institutions), 0.85)

    scored: list[SchoolScore] = []
    for row in institutions:
        unitid = row["UNITID"]
        name = row["INSTNM"]
        f = field.get(unitid, {})
        flags = RESEARCH_FLAGS.get(name, {})

        mat_awards = float(f.get("materials_awards", 0.0))
        bio_awards = float(f.get("biology_awards", 0.0))
        neuro_awards = float(f.get("neuro_awards", 0.0))
        mat_grad = float(f.get("materials_grad_depth", 0.0))
        bio_grad = float(f.get("biology_grad_depth", 0.0))
        neuro_grad = float(f.get("neuro_grad_depth", 0.0))

        mat_count_score = log_scaled(mat_awards, mat_ref)
        bio_count_score = log_scaled(bio_awards, bio_ref)
        neuro_count_score = log_scaled(neuro_awards, neuro_ref)
        mat_depth_score = clamp(mat_grad / 4.0)
        bio_depth_score = clamp((bio_grad + neuro_grad) / 10.0)

        manual_mat = float(flags.get("materials", 0.0))
        manual_bio = float(flags.get("bio_med", 0.0))
        manual_biomaterials = float(flags.get("biomaterials", 0.0))

        materials_score = clamp(0.58 * mat_count_score + 0.22 * mat_depth_score + 0.20 * manual_mat)
        biology_score = clamp(
            0.45 * bio_count_score
            + 0.18 * neuro_count_score
            + 0.17 * bio_depth_score
            + 0.20 * manual_bio
        )

        overlap = min(materials_score, biology_score)
        profile_score = clamp(
            0.34 * overlap
            + 0.28 * manual_biomaterials
            + 0.22 * manual_bio
            + 0.16 * neuro_count_score
        )

        completion = numeric(row.get("C150_4")) or numeric(row.get("C150_4_POOLED"))
        retention = numeric(row.get("RET_FT4")) or numeric(row.get("RET_FT4_POOLED"))
        earnings = numeric(row.get("MD_EARN_WNE_P10"))
        earnings_score = log_scaled(earnings or 0.0, earn_ref)
        outcomes_score = clamp(0.58 * (completion or 0.0) + 0.25 * (retention or 0.0) + 0.17 * earnings_score)

        admit_rate = numeric(row.get("ADM_RATE")) or numeric(row.get("ADM_RATE_ALL"))
        access_score = access_from_admit_rate(admit_rate)
        ca_value_score = 1.0 if home_state == "CA" and row.get("STABBR") == "CA" and row.get("CONTROL") == "1" else 0.0

        total = 100.0 * (
            weights["materials_program_strength"] * materials_score
            + weights["biology_neuro_program_strength"] * biology_score
            + weights["profile_research_fit"] * profile_score
            + weights["student_outcomes"] * outcomes_score
            + weights["admissions_access"] * access_score
            + weights["california_public_value"] * ca_value_score
        )

        programs_by_group = f.get("program_titles", {})
        program_bits = []
        for group, label in [("materials", "materials"), ("biology", "bio"), ("neuro", "neuro")]:
            titles = sorted(programs_by_group.get(group, []))
            if titles:
                program_bits.append(f"{label}: " + "; ".join(titles[:4]))
        programs = " | ".join(program_bits)

        why = flags.get("note") or explain_why(materials_score, biology_score, profile_score, ca_value_score)
        caution = explain_caution(admit_rate, materials_score, biology_score, programs)

        net_price_col = "NPT4_PUB" if row.get("CONTROL") == "1" else "NPT4_PRIV"
        scored.append(
            SchoolScore(
                rank=0,
                name=name,
                city=row["CITY"],
                state=row["STABBR"],
                control="Public" if row.get("CONTROL") == "1" else "Private nonprofit",
                admit_rate=admit_rate,
                band=admit_band(admit_rate),
                score=total,
                materials_score=materials_score,
                biology_score=biology_score,
                profile_score=profile_score,
                outcomes_score=outcomes_score,
                access_score=access_score,
                ca_value_score=ca_value_score,
                materials_awards=mat_awards,
                biology_awards=bio_awards,
                neuro_awards=neuro_awards,
                completion_rate=completion,
                retention_rate=retention,
                sat_avg=numeric(row.get("SAT_AVG")) or numeric(row.get("SAT_AVG_ALL")),
                undergrad_size=numeric(row.get("UGDS")),
                earnings_10yr=earnings,
                tuition_in=numeric(row.get("TUITIONFEE_IN")),
                tuition_out=numeric(row.get("TUITIONFEE_OUT")),
                net_price=numeric(row.get(net_price_col)),
                programs=programs,
                why_apply=why,
                caution=caution,
            )
        )

    scored.sort(key=lambda s: s.score, reverse=True)
    for i, school in enumerate(scored, 1):
        school.rank = i
    return scored


def explain_why(materials_score: float, biology_score: float, profile_score: float, ca_value_score: float) -> str:
    reasons = []
    if materials_score >= 0.65:
        reasons.append("strong materials signal")
    if biology_score >= 0.65:
        reasons.append("strong biology/neuro signal")
    if profile_score >= 0.65:
        reasons.append("good biomaterials-style overlap")
    if ca_value_score:
        reasons.append("California public option")
    if not reasons:
        reasons.append("balanced baseline fit from public outcomes/program data")
    return "; ".join(reasons)


def explain_caution(admit_rate: float | None, materials_score: float, biology_score: float, programs: str) -> str:
    cautions = []
    if admit_rate is not None and admit_rate < 0.10:
        cautions.append("lottery-level selectivity")
    elif admit_rate is not None and admit_rate < 0.20:
        cautions.append("reach school")
    if materials_score < 0.35:
        cautions.append("verify undergrad materials path")
    if biology_score < 0.35:
        cautions.append("verify bio/neuro/pre-med depth")
    if not programs:
        cautions.append("no relevant 4-digit CIP program found in Scorecard")
    return "; ".join(cautions) if cautions else "needs department, cost, and admissions verification"


def write_csv(scored: list[SchoolScore], path: Path, limit: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "rank",
        "name",
        "city",
        "state",
        "control",
        "band",
        "score",
        "admit_rate",
        "completion_rate",
        "retention_rate",
        "sat_avg",
        "undergrad_size",
        "earnings_10yr",
        "tuition_in",
        "tuition_out",
        "net_price",
        "materials_score",
        "biology_score",
        "profile_score",
        "outcomes_score",
        "access_score",
        "ca_value_score",
        "materials_awards",
        "biology_awards",
        "neuro_awards",
        "programs",
        "why_apply",
        "caution",
    ]
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for s in scored[:limit]:
            writer.writerow({field: getattr(s, field) for field in fields})


def markdown_table(rows: list[SchoolScore]) -> str:
    header = "| School | Score | Admit | Key reason | Caution |\n|---|---:|---:|---|---|\n"
    body = []
    for s in rows:
        body.append(
            f"| {s.name} ({s.state}) | {s.score:.1f} | {percent(s.admit_rate) or 'n/a'} | "
            f"{s.why_apply} | {s.caution} |"
        )
    return header + "\n".join(body)


def write_markdown(profile: dict[str, Any], scored: list[SchoolScore], path: Path, per_band: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bands = [
        "Far reach by admit rate",
        "Reach by admit rate",
        "Competitive/possible by admit rate",
        "More accessible by admit rate",
    ]
    lines = [
        "# Materials + Bio/Neuro College Shortlist",
        "",
        f"Generated from College Scorecard data last updated {SCORECARD_UPDATED}.",
        "",
        "## Student Fit Used",
        "",
        f"- Home state: {profile.get('home_state', 'unknown')}",
        f"- School context: {profile.get('school_context', 'unknown')}",
        "- Research direction: biomaterials-style overlap between scaffolded materials, cell culture, fluorescence microscopy, biology, neuro/clinical research, and possible surgery/physician-scientist optionality.",
        "- Surgery note: there is no undergraduate surgeon major. The useful undergrad screen is pre-med readiness, hospital/clinical access, research access, biology/chemistry strength, and enough flexibility to keep biomaterials/materials science alive.",
        "- Important caveat: the referenced resume PDF was not available at the local path, so this run uses the shared-chat profile signals saved in `inputs/student_profile.json`.",
        "",
        "## How to Read This",
        "",
        "Admissions bands are only based on admit rate. They are not a personal chance estimate. A real application plan needs GPA, course rigor, test scores, budget, essays, recommendations, and major-specific selectivity.",
        "",
    ]

    for band in bands:
        rows = [s for s in scored if s.band == band][:per_band]
        lines.extend([f"## {band}", "", markdown_table(rows) if rows else "_No schools in this band._", ""])

    must_research = [
        s
        for s in scored
        if s.name
        in {
            "Stanford University",
            "Massachusetts Institute of Technology",
            "Johns Hopkins University",
            "Northwestern University",
            "University of California-San Diego",
            "University of California-Los Angeles",
            "University of California-Berkeley",
            "University of Michigan-Ann Arbor",
            "Case Western Reserve University",
            "University of Washington-Seattle Campus",
            "Rice University",
            "Georgia Institute of Technology-Main Campus",
            "University of California-Davis",
            "University of California-Irvine",
            "University of Wisconsin-Madison",
            "Purdue University-Main Campus",
        }
    ]
    must_research.sort(key=lambda s: s.score, reverse=True)
    lines.extend(
        [
            "## Manual Research Priority",
            "",
            "These are the schools I would inspect by department/lab pages first because they plausibly match the student's actual research story, not just the raw score.",
            "",
            markdown_table(must_research[:16]),
            "",
            "## Source/CIP Notes",
            "",
            "Materials CIP groups: "
            + ", ".join(f"{k} {v}" for k, v in MATERIALS_CIPS.items())
            + ".",
            "",
            "Bio/neuro CIP groups: "
            + ", ".join(f"{k} {v}" for k, v in {**BIOLOGY_CIPS, **NEURO_MED_CIPS}.items())
            + ".",
            "",
            "The `college_shortlist.csv` file includes the component scores and program titles used for each ranked school.",
            "",
        ]
    )
    path.write_text("\n".join(lines))


def print_summary(scored: list[SchoolScore]) -> None:
    print("\nTop 20 overall:")
    for s in scored[:20]:
        print(f"{s.rank:>3}. {s.name} ({s.state}) {s.score:5.1f} | {s.band} | admit {percent(s.admit_rate) or 'n/a'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, default=PROFILE_PATH)
    parser.add_argument("--refresh-data", action="store_true", help="redownload Scorecard ZIPs")
    parser.add_argument("--csv-limit", type=int, default=120)
    parser.add_argument("--per-band", type=int, default=12)
    args = parser.parse_args()

    profile = load_profile(args.profile)
    inst_zip = ensure_dataset("institution", refresh=args.refresh_data)
    field_zip = ensure_dataset("field", refresh=args.refresh_data)

    print("Reading field-of-study data...")
    field = load_field_strengths(field_zip)
    print("Reading institution data...")
    institutions = load_institutions(inst_zip)
    print(f"Scoring {len(institutions):,} bachelor-granting public/private nonprofit institutions...")

    scored = score_schools(profile, institutions, field)
    write_csv(scored, OUTPUT_DIR / "college_shortlist.csv", args.csv_limit)
    write_markdown(profile, scored, OUTPUT_DIR / "college_shortlist.md", args.per_band)
    print_summary(scored)
    print(f"\nWrote {OUTPUT_DIR / 'college_shortlist.csv'}")
    print(f"Wrote {OUTPUT_DIR / 'college_shortlist.md'}")


if __name__ == "__main__":
    main()
