# College Atlas

Static college-planning atlas for a U.S. high school student interested in
materials science, biomaterials, biology/neuroscience, pre-med readiness, and
medicine-facing research.

The matcher uses College Scorecard downloadable institution and field-of-study
CSV data, then adds a transparent profile-fit layer for the student's current
research direction.

## Run

```bash
python3 src/college_matcher.py
python3 src/build_site_data.py
```

The static website is `index.html`. It reads `assets/college-data.js` from the
generated CSV and `assets/curated-insights.js` for school-by-school notes.

Tracked outputs:

- `outputs/college_shortlist.csv`
- `outputs/college_shortlist.md`
- `outputs/deeper_college_recommendations.md`
- `outputs/profile_improvement_roadmap.md`

Raw Scorecard ZIPs are downloaded into `data/raw/` and ignored by git.

## Profile

The default profile is in `inputs/student_profile.json`. It is based on
resume-derived and conversation-derived signals:

- Amador Valley High School student.
- ASDRP research with scaffolded giant vesicles and lipophilic localization.
- Cell culture and fluorescence microscopy.
- Biomaterials/materials angle.
- Possible CS/image-analysis extension.
- Clinical or medicine interest that still needs real-world validation.

## Caveats

This is a screening tool, not an admissions prediction. Admissions bands are
based only on institution-level admit rates in public data. Whether a school is
a target, reach, or safety depends on GPA, course rigor, test scores, essays,
recommendations, budget, residency, and major-specific selectivity.

There is no undergraduate surgeon major. The useful undergraduate screen is
pre-med readiness: prerequisites, GPA protection, clinical exposure, advising,
biology/chemistry strength, research access, and enough flexibility to preserve
the biomaterials/materials-science angle.
