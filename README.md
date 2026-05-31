# College Matcher

This repo builds a first-pass college shortlist for a U.S. high school student
interested in materials science, biology, biomaterials, neuroscience,
pre-med/clinical research, and possible surgeon/physician-scientist pathways.

The matcher uses College Scorecard's downloadable institution and field-of-study
CSV data, then adds a transparent profile-fit layer for the student's current
research direction.

## Run

```bash
python3 src/college_matcher.py
python3 src/build_site_data.py
```

Outputs are written to `outputs/`:

- `college_shortlist.csv`: ranked schools with metrics and scoring components.
- `college_shortlist.md`: readable shortlist by admissions-rate band.

The static website is `index.html`. It reads `assets/college-data.js` from the
generated CSV and `assets/curated-insights.js` for school-by-school judgment
notes from manual/agent review.

Raw Scorecard ZIPs are downloaded into `data/raw/` and ignored by git.

## Profile

The default profile is in `inputs/student_profile.json`. It is based on the
available context from the shared conversation:

- Amador Valley High School junior.
- ASDRP research with Joseph Pazzi.
- Scaffolded giant vesicles and lipophilic drug localization.
- Cell culture and fluorescence microscopy.
- ASDRP Symposium presentation.
- Biology, chemistry, and computer science coursework.
- Possible medical direction, including surgery, neurosurgery, or
  physician-scientist work.

If the student's resume PDF becomes available locally, add its text or key facts
to the profile file and rerun the script.

## Caveats

This is a screening tool, not an admissions prediction. Admissions bands are
based only on institution-level admit rates in public data. Whether a school is a
target, reach, or safety depends on GPA, course rigor, test scores, essays,
recommendations, budget, residency, and major-specific selectivity.

The score is a relative shortlist fit index for this profile, not an absolute
school quality ranking or personal admission probability. Use it to compare
tradeoffs inside this model, then verify department pages, aid, major-level
selectivity, pre-health advising, and undergraduate research access.

There is no undergraduate "surgeon" major. A surgery path is a pre-med path:
complete medical-school prerequisites, build clinical exposure, keep a strong
GPA, take the MCAT, attend medical school, then match into a surgical residency.
For college selection, that means prioritizing hospitals/medical centers,
pre-health advising, biology/chemistry strength, research access, and enough
major flexibility to preserve the biomaterials/materials-science angle.

College Scorecard field-of-study data uses 4-digit CIP groups. Some schools may
offer relevant biomaterials, biomedical engineering, neuroscience, or pre-med
opportunities under department tracks, minors, labs, or graduate programs that
do not show up as a standalone undergraduate CIP entry.
