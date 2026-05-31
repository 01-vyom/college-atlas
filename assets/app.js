(function () {
  "use strict";

  const curatedInsights = window.CURATED_INSIGHTS || {};
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const schools = (window.COLLEGE_DATA || []).map((school) => {
    const curated = curatedInsights[school.name] || {};
    const enriched = {
      ...school,
      tags: curated.tags || [],
      materialsPath: curated.materialsPath || "",
      clinicalPath: curated.clinicalPath || "",
      nuance: curated.nuance || "",
      warning: curated.warning || "",
      slug: slugify(school.name),
    };
    return {
      ...enriched,
      clinicalSignal: clinicalSignal(enriched),
    };
  });

  const state = {
    track: "biomaterials",
    query: "",
    minScore: 45,
    bands: new Set([
      "Far reach by admit rate",
      "Reach by admit rate",
      "Competitive/possible by admit rate",
      "More accessible by admit rate",
    ]),
    publicOnly: false,
    californiaOnly: false,
    clinicalOnly: false,
    sort: "lens",
    analysis: "surgeon",
    profileTrack: "priority",
    selected: null,
    compare: [],
    filtersCollapsed: false,
    detailCollapsed: true,
  };

  const tracks = {
    biomaterials: {
      title: "Biomaterials bridge",
      copy: "Best default lens. Prioritizes schools where materials science, biology, microscopy, tissue engineering, and drug delivery can overlap.",
      weights: { materials: 0.28, biology: 0.28, profile: 0.25, outcomes: 0.14, access: 0.05, ca: 0 },
    },
    surgeon: {
      title: "Pre-med / medicine path",
      copy: "Use this if medicine or surgery is still plausible. It weights biology/neuro strength, clinical access, advising, outcomes, research, and room for med-school prerequisites.",
      weights: { materials: 0.08, biology: 0.34, profile: 0.17, outcomes: 0.24, access: 0.09, ca: 0.02, clinical: 0.06 },
    },
    bioNeuro: {
      title: "Bio/neuro research path",
      copy: "Emphasizes neuroscience, cell biology, computational biology, imaging, and medicine-facing research while keeping biomaterials adjacency visible.",
      weights: { materials: 0.14, biology: 0.44, profile: 0.22, outcomes: 0.14, access: 0.04, ca: 0.01, clinical: 0.01 },
    },
    materials: {
      title: "Materials / MSE depth",
      copy: "Best for engineering-first schools with real materials science depth. Check whether pre-med courses and GPA are still manageable.",
      weights: { materials: 0.48, biology: 0.16, profile: 0.16, outcomes: 0.14, access: 0.06, ca: 0 },
    },
    california: {
      title: "California value",
      copy: "Highlights California public options and practical in-state choices while still preserving research and pre-med fit.",
      weights: { materials: 0.21, biology: 0.25, profile: 0.18, outcomes: 0.17, access: 0.06, ca: 0.13 },
    },
  };

  const bandOrder = [
    "Far reach by admit rate",
    "Reach by admit rate",
    "Competitive/possible by admit rate",
    "More accessible by admit rate",
  ];

  const analysisModes = {
    surgeon: {
      title: "Surgery is a long-term medicine goal, not a college major.",
      text: "For neurosurgery or any surgical specialty, the undergraduate choice should protect GPA, cover prerequisites, create clinical exposure, support research, and leave enough flexibility for the student to grow.",
      checks: [
        "Confirm pre-health advising quality and committee-letter process.",
        "Look for nearby hospitals, medical centers, EMT/shadowing routes, or clinical volunteering.",
        "Check whether engineering-heavy majors can be balanced with GPA-sensitive pre-med prerequisites.",
        "Prefer neuroscience, biology, bioengineering, or computational biology options that leave time for clinical work.",
      ],
    },
    physicianScientist: {
      title: "The strongest story is medicine-facing research.",
      text: "The current profile already has a research story: scaffolded giant vesicles, lipophilic localization, cell culture, and fluorescence microscopy. Colleges with labs at the edge of biomaterials, stem-cell systems, neurodevelopment, and medicine should rise.",
      checks: [
        "Find 3-5 labs per school before applying, not after admission.",
        "Check undergraduate research programs, thesis options, summer fellowships, and hospital-linked labs.",
        "Look for MD/PhD culture even if the student eventually chooses MD-only.",
        "Preserve computational biology as a differentiator, not just a backup major.",
      ],
    },
    biomaterials: {
      title: "Biomaterials is the cleanest bridge from the current resume.",
      text: "This path connects materials science, scaffold mechanics, hydrogels, organoids, drug localization, and cell culture. It is credible for outreach emails and college essays because it explains why materials and biology belong together.",
      checks: [
        "Prioritize materials departments with bioengineering, polymer, tissue engineering, or hydrogel labs.",
        "Check if undergrads can join engineering labs without being locked into an engineering major.",
        "Look for microscopy/image-analysis facilities and cell-culture training routes.",
        "Use the ASDRP work as a theme: engineered boundaries that guide fragile biological systems.",
      ],
    },
    bioNeuro: {
      title: "Bio/neuro can be a research-major path without committing to medicine.",
      text: "This mode keeps neuroscience, cell biology, computational biology, microscopy, and tissue/disease models central. It is useful when the student wants biology depth and research credibility even if the future is not strictly pre-med.",
      checks: [
        "Look for neuroscience, molecular/cell biology, computational biology, bioengineering, or bioimage-analysis routes.",
        "Map labs that connect imaging, organoids, neural systems, drug delivery, disease models, or tissue repair.",
        "Check whether undergraduates can do wet-lab or computational research early.",
        "Keep clinical language optional: surgery curiosity should not crowd out a genuine biology/neuro major story.",
      ],
    },
    materials: {
      title: "Materials-first keeps engineering depth high.",
      text: "If the student later pivots away from medicine, materials science gives a rigorous engineering identity. The risk is losing clinical/neuro access unless the school has strong biomedical adjacency.",
      checks: [
        "Check ABET-style engineering rigidity versus flexibility for pre-med courses.",
        "Prioritize MSE plus bioengineering overlap, not metallurgy-only departments.",
        "Look for polymer, soft materials, biomaterials, microscopy, and nanomedicine groups.",
        "For pure engineering schools, verify hospitals and life-science research are actually accessible.",
      ],
    },
  };

  const profilePlans = {
    priority: {
      title: "Build proof, not more loose interests.",
      moves: [
        {
          title: "Turn ASDRP research into a public-facing artifact",
          timeline: "0-3 months",
          impact: "Very high",
          target: "Stanford, MIT, Northwestern, Hopkins, UCSD, Berkeley, Michigan",
          action: "Produce a clean abstract, poster PDF, figure set, protocol summary, and one 2-minute explanation of the scaffolded vesicle result.",
          evidence: "Poster title, symposium name, mentor name, methods used, quantified finding, and a stable link or PDF.",
        },
        {
          title: "Add computational image analysis",
          timeline: "0-4 months",
          impact: "Very high",
          target: "MIT, Stanford, UCSD, UCSC, Berkeley, UW, Case Western",
          action: "Use Python or ImageJ/Fiji to quantify fluorescence localization, vesicle morphology, or cell-culture imaging from the existing project.",
          evidence: "GitHub repo, annotated notebook, before/after images, metric definitions, and reproducible workflow.",
        },
        {
          title: "Start one patient-facing clinical commitment",
          timeline: "0-6 months",
          impact: "High",
          target: "Hopkins, UCLA, UCI, UC Davis, UCSD, Case Western, Pitt, Duke, UAB, UIC",
          action: "Choose hospital volunteering, hospice, clinic volunteering, EMT pathway, CNA pathway, scribing if age-eligible, or sustained community health service.",
          evidence: "Hours, weeks, role, population served, training completed, and a short reflection on what patient care actually looks like.",
        },
        {
          title: "Create a school or community translation project",
          timeline: "1-6 months",
          impact: "High",
          target: "UCs, Common App schools, accessible R1s",
          action: "Teach a biomaterials, microscopy, or health-science workshop; mentor younger students; or build a small public explainer site about drug delivery and cells.",
          evidence: "Audience size, curriculum, slides/site, before-after feedback, partner organization, and leadership role.",
        },
        {
          title: "Secure one strong science recommendation narrative",
          timeline: "Now through application season",
          impact: "High",
          target: "All selective schools",
          action: "Give the research mentor and a science teacher a concise brag sheet showing initiative, troubleshooting, technical independence, and writing/presentation growth.",
          evidence: "Specific anecdotes recommenders can verify: failed protocol fixed, analysis designed, presentation improved, team led.",
        },
      ],
      clusters: [
        ["Dream research reaches", "Need original research product plus computational depth: Stanford, MIT, Northwestern, Hopkins, Penn, Duke."],
        ["UC clinical publics", "Need patient-facing service and UC PIQ-ready reflection: UCLA, UCSD, UCI, UC Davis, UC Riverside."],
        ["Materials-first publics", "Need stronger MSE identity: Georgia Tech, Purdue, UIUC, Berkeley, Penn State, NC State, UConn."],
        ["Accessible R1/value", "Need evidence of initiative that travels beyond school rank: ASU, Arizona, Utah, UC Merced, SJSU, UNR, UAB, UIC."],
      ],
      evidence: [
        "A research artifact someone can read in 3 minutes.",
        "A measurable result, not just a lab technique list.",
        "A sustained clinical or service commitment.",
        "A leadership product with users or participants.",
        "A mentor letter that confirms independent scientific thinking.",
      ],
      wording: [
        ["Research", "Investigated scaffolded giant vesicles as model biomaterial boundaries for lipophilic localization; used cell culture and fluorescence microscopy to connect material design to biological behavior."],
        ["Computation", "Built an image-analysis workflow to quantify fluorescence localization and morphology from microscopy data, turning qualitative observations into reproducible metrics."],
        ["Clinical", "Committed weekly service in a patient-facing setting to test whether medicine is a lived motivation, not only an academic interest."],
      ],
    },
    materials: {
      title: "Make the materials-science identity unmistakable.",
      moves: [
        {
          title: "Add a materials characterization angle",
          timeline: "0-5 months",
          impact: "Very high",
          target: "Northwestern, Georgia Tech, Purdue, UIUC, Berkeley, MIT, Penn State, UConn, UC Merced, SJSU",
          action: "Measure or model a material property tied to the vesicle/scaffold system: stability, permeability, stiffness proxy, diffusion, surface chemistry, or imaging-derived morphology.",
          evidence: "Property measured, method, control condition, graph, and interpretation.",
        },
        {
          title: "Build a biomaterials literature map",
          timeline: "2-4 weeks",
          impact: "Medium",
          target: "All biomaterials and MSE reaches",
          action: "Summarize 12-20 papers across hydrogels, lipid vesicles, drug delivery, tissue engineering, and neural interfaces.",
          evidence: "Annotated bibliography, one-page synthesis, and 5 faculty/lab connections per target school.",
        },
        {
          title: "Compete or present outside ASDRP",
          timeline: "3-9 months",
          impact: "High",
          target: "Selective engineering and research schools",
          action: "Submit to a regional science fair, junior science/humanities symposium, school research night, or credible student research venue.",
          evidence: "Acceptance, award, judge feedback, abstract, poster, or presentation recording.",
        },
        {
          title: "Create a small open-source lab tool",
          timeline: "1-4 months",
          impact: "High",
          target: "MIT, Stanford, Berkeley, UCSD, UW, CMU-style computational readers",
          action: "Release a simple analysis notebook for microscopy intensity, vesicle segmentation, or experiment logging.",
          evidence: "GitHub commits, README, sample data, validation image, and limitations section.",
        },
      ],
      clusters: [
        ["True MSE anchors", "Northwestern, Georgia Tech, Purdue, UIUC, Penn State, UConn, UC Merced, SJSU, UNR."],
        ["Materials plus medicine", "Stanford, MIT, Northwestern, Michigan, Berkeley, UC Davis, UCSD."],
        ["Engineering-heavy caution", "For Purdue, UIUC, Georgia Tech, Mines, Penn State: show you can handle rigorous engineering without losing bio/clinical intent."],
        ["California materials value", "Berkeley for reach research, UC Merced and SJSU for practical MSE, UCSB for research/lab path rather than straightforward undergrad MSE."],
      ],
      evidence: [
        "A graph or measurement that makes the work feel like materials science.",
        "A named materials problem: permeability, stability, diffusion, scaffold mechanics, surface interaction.",
        "A faculty/lab match list tied to real papers.",
        "A code or analysis artifact that shows engineering habits.",
      ],
      wording: [
        ["Materials bridge", "My research asks how engineered boundaries can guide fragile biological systems, connecting soft materials, microscopy, and medicine-facing biology."],
        ["MSE fit", "I want an undergraduate environment where materials characterization and cell-facing experiments can happen in the same intellectual space."],
        ["Faculty match", "I am looking for labs that connect polymers, lipid systems, tissue engineering, drug delivery, microscopy, or neural interfaces."],
      ],
    },
    bioNeuro: {
      title: "Make biology/neuro more than a pre-med label.",
      moves: [
        {
          title: "Add a biology or neuro mechanism layer",
          timeline: "0-4 months",
          impact: "Very high",
          target: "UCSD, UCLA, Hopkins, Case Western, Pitt, Duke, Michigan, UCSC",
          action: "Connect the vesicle/scaffold work to a real biological system: neural repair, drug delivery across barriers, tissue models, stem-cell/organoid systems, or bioimage analysis.",
          evidence: "One-page mechanism map, 8-12 papers, and a clear explanation of what biological behavior the material system helps observe or guide.",
        },
        {
          title: "Build a bioimage-analysis artifact",
          timeline: "1-4 months",
          impact: "High",
          target: "MIT, Stanford, UCSD, UCSC, Berkeley, UW, Case Western",
          action: "Quantify fluorescence intensity, localization ratios, segmentation, morphology, or cell-culture images with Python, ImageJ/Fiji, or a documented workflow.",
          evidence: "Annotated notebook or protocol, sample images, metric definitions, controls, and limitations.",
        },
        {
          title: "Map neuro and computational biology labs",
          timeline: "2-5 weeks",
          impact: "Medium",
          target: "Bio/neuro reaches and UC campuses",
          action: "For each final school, identify labs connecting neural systems, imaging, computational biology, stem cells, organoids, or disease models.",
          evidence: "2 labs per school, one recent topic/paper, likely major path, and why the lab matches the existing research theme.",
        },
        {
          title: "Translate the work for a health audience",
          timeline: "1-6 months",
          impact: "High",
          target: "UCs, clinical R1s, physician-scientist schools",
          action: "Create a short workshop, explainer, or outreach project on cells, microscopy, drug delivery, neural repair, or biological barriers.",
          evidence: "Audience, slides/site, feedback, partner or teacher sponsor, and what changed after the session.",
        },
      ],
      clusters: [
        ["Neuro/bio research reaches", "Need a mechanism story plus image-analysis proof: UCSD, UCLA, Hopkins, Duke, Michigan, Case Western."],
        ["Computational biology fit", "Need reproducible code or analysis: MIT, Stanford, Berkeley, UCSC, UW, UCSD."],
        ["UC biology strategy", "Need PIQ-ready evidence about academic curiosity, initiative, and community impact: UCLA, UCSD, UCI, Davis, Riverside, Santa Cruz."],
        ["Materials plus neuro bridge", "Use biomaterials to explain neural repair, drug delivery, imaging, or tissue models instead of treating neuro as a separate interest."],
      ],
      evidence: [
        "A biological mechanism map tied to the research artifact.",
        "A reproducible microscopy or bioimage-analysis workflow.",
        "A lab list where every school has a plausible bio/neuro route.",
        "A public explanation that proves the student can teach the science clearly.",
      ],
      wording: [
        ["Bio/neuro bridge", "I am interested in how engineered material systems can make biological and neural processes easier to measure, model, and eventually repair."],
        ["Image analysis", "I turned microscopy observations into defined metrics so the biological claim depends on evidence, not just visual impressions."],
        ["Major fit", "The strongest major path keeps biology, neuroscience, computation, and materials-facing research close enough to build one coherent undergraduate story."],
      ],
    },
    clinical: {
      title: "If medicine is plausible, prove patient-facing maturity.",
      moves: [
        {
          title: "Choose one sustained clinical exposure lane",
          timeline: "0-6 months",
          impact: "Very high",
          target: "Hopkins, UCLA, UCSD, UCI, UC Davis, Case Western, Pitt, Duke, Vanderbilt, UAB, UIC",
          action: "Prioritize hospital volunteering, hospice, clinic service, EMT/CNA training if age-eligible, caregiving, or community health work over scattered shadowing.",
          evidence: "Consistent hours, responsibilities, patient population, training, supervisor, and reflection.",
        },
        {
          title: "Shadow ethically and reflectively if available",
          timeline: "1-8 months",
          impact: "Medium",
          target: "Pre-med and physician-scientist schools",
          action: "Arrange short observation blocks only where allowed; keep patient privacy, consent, and boundaries central.",
          evidence: "Specialties observed, hours, setting type, and lessons about physician responsibilities without patient details.",
        },
        {
          title: "Add a health-equity or community-health project",
          timeline: "2-8 months",
          impact: "High",
          target: "UCs, Hopkins, Pitt, UIC, UAB, Case Western",
          action: "Build a small project around health literacy, elder tech help, translated patient education, CPR awareness, or a local public-health need.",
          evidence: "Community partner, people reached, materials created, feedback, and what changed.",
        },
        {
          title: "Connect research to disease or care",
          timeline: "0-3 months",
          impact: "High",
          target: "Physician-scientist and clinical-research schools",
          action: "Write a clear bridge between lipophilic localization, drug delivery, tissue models, neural systems, and why clinical questions matter.",
          evidence: "Essay paragraph, faculty/lab list, and one medically grounded research question.",
        },
      ],
      clusters: [
        ["Clinical-heavy reaches", "Hopkins, UCLA, Penn, Duke, Vanderbilt, Yale, Harvard need mature evidence, not just 'I like medicine.'"],
        ["UC medical campuses", "UCSD, UCI, UC Davis, UCLA reward a story with research plus service plus California/community awareness."],
        ["Accessible clinical R1s", "Pitt, UAB, UIC, Wayne State can make the medicine path real if clinical access is the priority."],
        ["Engineering plus pre-med", "For Georgia Tech, Purdue, UIUC, Berkeley: explain how medicine stays intentional despite engineering rigor."],
      ],
      evidence: [
        "A longitudinal patient-facing role, even modest.",
        "A reflection that distinguishes shadowing from volunteering.",
        "A service project with a real audience.",
        "A research question tied to disease, therapy, imaging, or patient care.",
      ],
      wording: [
        ["Clinical maturity", "I tested my interest in medicine through sustained patient-facing service, learning the difference between scientific curiosity and the responsibilities of care."],
        ["Physician-scientist", "The goal is not to choose between bench research and medicine, but to learn how clinical problems can sharpen better biological and materials questions."],
        ["Neurosurgery caution", "Frame neurosurgery as curiosity about nervous-system repair, imaging, and patient care, not as a premature fixed specialty."],
      ],
    },
    packaging: {
      title: "Package fewer things with sharper evidence.",
      moves: [
        {
          title: "Rewrite the top activity as an outcome, not a title",
          timeline: "Immediate",
          impact: "Very high",
          target: "Common App, UC, selective research schools",
          action: "Lead with the research question, methods, output, and independence. Cut passive wording like 'participated in research.'",
          evidence: "150-character Common App version, 350-character UC version, and resume bullet version.",
        },
        {
          title: "Prepare a recommender packet",
          timeline: "Before recommendation requests",
          impact: "High",
          target: "Schools requiring teacher/mentor letters",
          action: "Give each recommender a one-page narrative: project, obstacles, growth, traits, and two anecdotes they personally observed.",
          evidence: "Brag sheet, transcript context, project abstract, and school list rationale.",
        },
        {
          title: "Build a UC PIQ evidence bank",
          timeline: "1-2 months",
          impact: "Very high for UCs",
          target: "All UC campuses",
          action: "Collect stories for leadership, creativity/problem solving, academic subject, educational opportunity, and community impact.",
          evidence: "Four PIQ outlines with one scene, one action, one result, and one reflection each.",
        },
        {
          title: "Make the college-specific why clear",
          timeline: "Application season",
          impact: "High",
          target: "Common App supplement schools",
          action: "For each college, name two labs/programs and one campus trait that match the profile without overclaiming certainty.",
          evidence: "School-fit spreadsheet with lab, paper/topic, major path, clinical route, and one sentence of fit.",
        },
      ],
      clusters: [
        ["Common App schools", "Need short activity entries with impact, letters, and school-specific supplements."],
        ["UCs", "Need PIQs that show personality and action, not a list of awards."],
        ["Research reaches", "Need mentor-confirmed independence and faculty/lab specificity."],
        ["Accessible schools", "Need demonstrated initiative so the file does not read as only reach-chasing."],
      ],
      evidence: [
        "One polished resume bullet per major activity.",
        "One Common App 150-character activity line.",
        "One UC 350-character activity version.",
        "Four UC PIQ story outlines.",
        "A school-fit spreadsheet for the final list.",
      ],
      wording: [
        ["Activity line", "Researcher, ASDRP: studied scaffolded giant vesicles and lipophilic localization using cell culture, fluorescence microscopy, and image analysis."],
        ["Resume bullet", "Designed and presented biomaterials research on scaffolded giant vesicles, connecting lipid localization, microscopy, and cell-facing material behavior."],
        ["Essay thesis", "My strongest theme is learning how engineered materials can make biological systems easier to observe, guide, and eventually heal."],
      ],
    },
  };

  const profileGoals = {
    priority: "Biomaterials researcher",
    materials: "Materials engineering",
    bioNeuro: "Biology / neuroscience bridge",
    clinical: "Pre-med / possible medicine",
    packaging: "UC and Common App strategy",
  };

  const profileGapRows = {
    priority: [
      ["Research artifact", "Poster, abstract, figure panel, or paper-style report.", "Public artifact with quantified result and mentor-confirmed role.", "All research-heavy schools"],
      ["Quant/data proof", "One microscopy metric or image-analysis workflow.", "Reproducible notebook with figures, controls, and limits.", "MIT, Stanford, UCSD, Berkeley"],
      ["Clinical/service proof", "One sustained patient-adjacent role.", "Flexible hour range plus reflection and supervisor.", "Hopkins, UCLA, UCI, Case, Pitt"],
      ["Leadership/community", "Teach, mentor, or build a useful science resource.", "Audience, curriculum, feedback, and recurring responsibility.", "UCs, accessible R1s"],
      ["School-specific fit", "2-3 labs or programs per final school.", "Lab map tied to papers, major path, and clinical/research access.", "All supplements"],
    ],
    materials: [
      ["Research artifact", "Poster or report on vesicles/scaffolds.", "Materials-framed artifact with property, method, and graph.", "Northwestern, Georgia Tech, Purdue"],
      ["Quant/data proof", "Fluorescence or morphology measurements.", "Characterization: diffusion, stability, stiffness proxy, or localization ratios.", "UIUC, Berkeley, UConn, SJSU"],
      ["Clinical/service proof", "Optional but helpful if medicine stays alive.", "Explain how engineering and pre-med can coexist.", "Berkeley, UC Davis, UCSD"],
      ["Leadership/community", "Lab SOP or peer training.", "Mentor younger students in wet-lab or analysis workflow.", "Public engineering schools"],
      ["School-specific fit", "Materials department path checked.", "Confirm true MSE major vs minor/lab-only route.", "Purdue, UIUC, UCSB, UC Merced"],
    ],
    bioNeuro: [
      ["Research artifact", "Mechanism map connecting scaffolds/vesicles to a biological system.", "Bio/neuro-framed artifact with image evidence and a clear disease, neural, or tissue-model question.", "UCSD, UCLA, Hopkins, Case"],
      ["Quant/data proof", "One bioimage-analysis metric.", "Reproducible workflow for fluorescence, localization, segmentation, morphology, or cell behavior.", "MIT, Stanford, Berkeley, UCSC"],
      ["Clinical/service proof", "Optional unless medicine stays central.", "Use service to connect biology/neuro curiosity to real human stakes.", "Duke, Pitt, UCI, Davis"],
      ["Leadership/community", "Teach cells, microscopy, drug delivery, or neural repair.", "Audience, curriculum, feedback, and recurring responsibility.", "UCs, clinical R1s"],
      ["School-specific fit", "Bio/neuro major and lab route checked.", "2 labs per school tied to neural systems, disease models, imaging, organoids, or computation.", "All bio/neuro schools"],
    ],
    clinical: [
      ["Research artifact", "Translational abstract from ASDRP.", "Bench-to-bedside question tied to drug delivery, neural systems, or tissue models.", "Hopkins, UCLA, UCSD"],
      ["Quant/data proof", "Image analysis or bioinformatics extension.", "Metrics linked to disease, therapy, imaging, or biological mechanism.", "Case, Pitt, Duke"],
      ["Clinical/service proof", "Weekly patient-facing or patient-adjacent service.", "Flexible range, reflection, and supervisor; shadowing only as support.", "UCI, Davis, UAB, UIC"],
      ["Leadership/community", "Health literacy or community-health project.", "Partner, audience, outcome, and sustained contribution.", "UCs, clinical R1s"],
      ["School-specific fit", "Clinical route checked.", "Hospital access, pre-health advising, prerequisites, and research access mapped.", "All pre-med schools"],
    ],
    packaging: [
      ["Research artifact", "One polished resume bullet and activity entry.", "Common App, UC, and supplement versions with exact contribution.", "All applications"],
      ["Quant/data proof", "One figure or metric in the application evidence bank.", "A concise explanation of hypothesis, method, result, limitation, and next step.", "Selective STEM schools"],
      ["Clinical/service proof", "Activity description with responsibility and reflection.", "Show what was learned about care without overclaiming medical skill.", "Pre-med schools"],
      ["Leadership/community", "A PIQ-ready leadership or community story.", "Scene, action, result, and reflection.", "UCs"],
      ["School-specific fit", "Why-major notes.", "2 labs/programs plus one path-risk check per school.", "Common App supplements"],
    ],
  };

  const profileTimeline = [
    ["Now / 2 weeks", "Research title, 250-word abstract, figure panel, resume bullet."],
    ["0-3 months", "Microscopy quantification, clinical/service start, lab map draft."],
    ["3-6 months", "Public artifact, science fair/JSHS plan, outreach or mentoring."],
    ["6-12 months", "Sustained service, recommender packet, stronger school-specific fit."],
    ["Application season", "UC PIQs, Common App activities, why-major supplements, final checks."],
  ];

  const els = {
    controls: document.querySelector(".controls"),
    workspace: document.querySelector(".workspace"),
    toggleFilters: document.getElementById("toggleFilters"),
    toggleDetail: document.getElementById("toggleDetail"),
    mobileJump: document.querySelector(".mobile-jump"),
    boardSection: document.querySelector(".board-section"),
    search: document.getElementById("searchInput"),
    scoreRange: document.getElementById("scoreRange"),
    scoreValue: document.getElementById("scoreValue"),
    bandFilters: document.getElementById("bandFilters"),
    publicOnly: document.getElementById("publicOnly"),
    californiaOnly: document.getElementById("californiaOnly"),
    clinicalOnly: document.getElementById("clinicalOnly"),
    sort: document.getElementById("sortSelect"),
    reset: document.getElementById("resetFilters"),
    trackTitle: document.getElementById("trackTitle"),
    trackCopy: document.getElementById("trackCopy"),
    countMetric: document.getElementById("countMetric"),
    topMetric: document.getElementById("topMetric"),
    caMetric: document.getElementById("caMetric"),
    clinicalMetric: document.getElementById("clinicalMetric"),
    analysisModeTitle: document.getElementById("analysisModeTitle"),
    analysisModeText: document.getElementById("analysisModeText"),
    analysisChecklist: document.getElementById("analysisChecklist"),
    portfolioCount: document.getElementById("portfolioCount"),
    portfolioGrid: document.getElementById("portfolioGrid"),
    researchPrompts: document.getElementById("researchPrompts"),
    profileMoves: document.getElementById("profileMoves"),
    profileGoalTitle: document.getElementById("profileGoalTitle"),
    profileGoalCopy: document.getElementById("profileGoalCopy"),
    profileGapGrid: document.getElementById("profileGapGrid"),
    profileTimeline: document.getElementById("profileTimeline"),
    clusterTitle: document.getElementById("clusterTitle"),
    clusterCount: document.getElementById("clusterCount"),
    profileClusters: document.getElementById("profileClusters"),
    evidenceChecklist: document.getElementById("evidenceChecklist"),
    wordingBank: document.getElementById("wordingBank"),
    plot: document.getElementById("plot"),
    plotList: document.getElementById("plotList"),
    bandBoard: document.getElementById("bandBoard"),
    cards: document.getElementById("cards"),
    resultSummary: document.getElementById("resultSummary"),
    statusAnnouncer: document.getElementById("statusAnnouncer"),
    tooltip: document.getElementById("tooltip"),
    compareTray: document.querySelector(".compare-tray"),
    detailPanel: document.querySelector(".detail-panel"),
    detailEmpty: document.getElementById("detailEmpty"),
    detailContent: document.getElementById("detailContent"),
    detailBand: document.getElementById("detailBand"),
    detailName: document.getElementById("detailName"),
    detailMeta: document.getElementById("detailMeta"),
    detailScore: document.getElementById("detailScore"),
    detailBars: document.getElementById("detailBars"),
    detailWhy: document.getElementById("detailWhy"),
    detailCaution: document.getElementById("detailCaution"),
    detailTags: document.getElementById("detailTags"),
    detailNuance: document.getElementById("detailNuance"),
    detailMaterialsPath: document.getElementById("detailMaterialsPath"),
    detailClinicalPath: document.getElementById("detailClinicalPath"),
    detailVerification: document.getElementById("detailVerification"),
    detailProfileMoves: document.getElementById("detailProfileMoves"),
    detailPrograms: document.getElementById("detailPrograms"),
    compareDetail: document.getElementById("compareDetail"),
    closeDetail: document.getElementById("closeDetail"),
    compareGrid: document.getElementById("compareGrid"),
    clearCompare: document.getElementById("clearCompare"),
    canvas: document.getElementById("pathwayCanvas"),
  };

  let lastDetailTrigger = null;

  initControls();
  initCanvas();
  render();

  function initControls() {
    syncRails();

    els.toggleFilters.addEventListener("click", () => {
      state.filtersCollapsed = !state.filtersCollapsed;
      syncRails();
    });

    els.toggleDetail.addEventListener("click", () => {
      state.detailCollapsed = !state.detailCollapsed;
      syncRails();
      if (!state.detailCollapsed && state.selected && window.matchMedia("(max-width: 1220px)").matches) {
        focusDetailPanel();
      }
    });

    els.mobileJump.addEventListener("click", () => {
      window.requestAnimationFrame(() => {
        els.boardSection.focus({ preventScroll: true });
      });
    });

    els.search.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });

    els.scoreRange.addEventListener("input", (event) => {
      state.minScore = Number(event.target.value);
      els.scoreValue.textContent = String(state.minScore);
      render();
    });

    document.querySelectorAll(".seg-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.track = button.dataset.track;
        setPressed(".seg-button", button);
        render();
        announce(`${tracks[state.track].title} lens selected.`);
      });
    });

    document.querySelectorAll(".analysis-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.analysis = button.dataset.analysis;
        setPressed(".analysis-tab", button);
        renderAnalysis(currentRows());
      });
    });

    document.querySelectorAll(".profile-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.profileTrack = button.dataset.profile;
        setPressed(".profile-tab", button);
        renderProfilePlan();
        announce(`${profileGoals[state.profileTrack]} profile plan selected.`);
      });
    });

    els.bandFilters.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.bands.add(input.value);
        } else {
          state.bands.delete(input.value);
        }
        render();
      });
    });

    els.publicOnly.addEventListener("change", () => {
      state.publicOnly = els.publicOnly.checked;
      render();
    });

    els.californiaOnly.addEventListener("change", () => {
      state.californiaOnly = els.californiaOnly.checked;
      render();
    });

    els.clinicalOnly.addEventListener("change", () => {
      state.clinicalOnly = els.clinicalOnly.checked;
      render();
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      render();
    });

    els.reset.addEventListener("click", () => {
      state.query = "";
      state.minScore = 45;
      state.bands = new Set(bandOrder);
      state.publicOnly = false;
      state.californiaOnly = false;
      state.clinicalOnly = false;
      state.sort = "lens";
      els.search.value = "";
      els.scoreRange.value = "45";
      els.scoreValue.textContent = "45";
      els.publicOnly.checked = false;
      els.californiaOnly.checked = false;
      els.clinicalOnly.checked = false;
      els.sort.value = "lens";
      els.bandFilters.querySelectorAll("input").forEach((input) => {
        input.checked = true;
      });
      render();
    });

    els.closeDetail.addEventListener("click", closeSelectedDetail);

    els.compareDetail.addEventListener("click", () => {
      const selected = schools.find((school) => school.slug === state.selected);
      if (selected) toggleCompare(selected);
    });

    els.clearCompare.addEventListener("click", () => {
      state.compare = [];
      renderCompare();
      renderCards(currentRows());
      announce("Comparison cleared.");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.selected && els.detailPanel.classList.contains("open")) {
        closeSelectedDetail();
      }
    });

    window.addEventListener("resize", debounce(() => {
      render();
      syncRails();
    }, 120));
  }

  function currentRows() {
    return filtered().sort(compareSchools);
  }

  function filtered() {
    return schools
      .map((school) => ({ ...school, lensScore: lensScore(school) }))
      .filter((school) => school.lensScore >= state.minScore)
      .filter((school) => state.bands.has(school.band))
      .filter((school) => !state.publicOnly || school.control === "Public")
      .filter((school) => !state.californiaOnly || school.state === "CA")
      .filter((school) => !state.clinicalOnly || school.clinicalSignal > 0)
      .filter((school) => {
        if (!state.query) return true;
        const text = [
          school.name,
          school.city,
          school.state,
          school.programs,
          school.why_apply,
          school.tags.join(" "),
          school.materialsPath,
          school.clinicalPath,
          school.nuance,
          school.warning,
        ].join(" ").toLowerCase();
        return text.includes(state.query);
      });
  }

  function compareSchools(a, b) {
    if (state.sort === "admit") return safe(b.admit_rate) - safe(a.admit_rate);
    if (state.sort === "materials") return safe(b.materials_score) - safe(a.materials_score);
    if (state.sort === "biology") return safe(b.biology_score) - safe(a.biology_score);
    if (state.sort === "outcomes") return safe(b.outcomes_score) - safe(a.outcomes_score);
    if (state.sort === "netprice") return safe(a.net_price, 999999) - safe(b.net_price, 999999);
    return b.lensScore - a.lensScore;
  }

  function render() {
    const rows = currentRows();
    document.body.dataset.track = state.track;
    els.trackTitle.textContent = tracks[state.track].title;
    els.trackCopy.textContent = tracks[state.track].copy;
    renderStats(rows);
    renderAnalysis(rows);
    renderProfilePlan();
    renderPlot(rows);
    renderPlotList(rows);
    renderBoard(rows);
    renderCards(rows);
    renderCompare();
    renderDetail(schools.find((school) => school.slug === state.selected) || null);
  }

  function renderAnalysis(rows) {
    const mode = analysisModes[state.analysis];
    els.analysisModeTitle.textContent = mode.title;
    els.analysisModeText.textContent = mode.text;
    replaceChildren(els.analysisChecklist);
    mode.checks.forEach((text) => {
      const item = document.createElement("div");
      item.className = "check-item";
      item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
      const span = document.createElement("span");
      span.textContent = text;
      item.appendChild(span);
      els.analysisChecklist.appendChild(item);
    });

    const buckets = [
      ["Far reach", "Far reach by admit rate", 4],
      ["Reach", "Reach by admit rate", 4],
      ["Competitive", "Competitive/possible by admit rate", 5],
      ["Accessible", "More accessible by admit rate", 5],
    ];
    const picks = buckets.map(([label, band, limit]) => ({
      label,
      schools: rows.filter((school) => school.band === band).slice(0, limit),
    }));
    const total = picks.reduce((sum, bucket) => sum + bucket.schools.length, 0);
    els.portfolioCount.textContent = `${total} picks`;
    replaceChildren(els.portfolioGrid);
    picks.forEach((bucket) => {
      const section = document.createElement("div");
      section.className = "portfolio-bucket";
      const heading = document.createElement("h4");
      heading.textContent = bucket.label;
      section.appendChild(heading);
      if (!bucket.schools.length) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.disabled = true;
        empty.textContent = "No visible schools";
        section.appendChild(empty);
      }
      bucket.schools.forEach((school) => {
        const button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => selectSchool(school));
        button.innerHTML = `${escapeHtml(school.name)} <span>${school.state} | ${school.lensScore.toFixed(1)}</span>`;
        section.appendChild(button);
      });
      els.portfolioGrid.appendChild(section);
    });

    const prompts = researchPromptsForMode();
    replaceChildren(els.researchPrompts);
    prompts.forEach(([title, body]) => {
      const card = document.createElement("div");
      card.className = "prompt-card";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const p = document.createElement("p");
      p.textContent = body;
      card.append(strong, p);
      els.researchPrompts.appendChild(card);
    });
  }

  function renderProfilePlan() {
    const plan = profilePlans[state.profileTrack];
    els.profileGoalTitle.textContent = profileGoals[state.profileTrack];
    els.profileGoalCopy.textContent =
      state.profileTrack === "clinical"
        ? "This means medical-school readiness: GPA, prerequisites, advising, clinical exposure, biology/chemistry, research, service, and reflection."
        : plan.title;
    els.clusterTitle.textContent = plan.title;
    els.clusterCount.textContent = `${plan.moves.length} moves`;

    replaceChildren(els.profileGapGrid);
    (profileGapRows[state.profileTrack] || []).forEach(([label, minimum, strong, helped]) => {
      const row = document.createElement("article");
      row.className = "gap-card";
      row.innerHTML = `
        <h4>${escapeHtml(label)}</h4>
        <p><strong>Minimum:</strong> ${escapeHtml(minimum)}</p>
        <p><strong>Strong:</strong> ${escapeHtml(strong)}</p>
        <span>${escapeHtml(helped)}</span>
      `;
      els.profileGapGrid.appendChild(row);
    });

    replaceChildren(els.profileTimeline);
    profileTimeline.forEach(([time, action]) => {
      const item = document.createElement("div");
      item.className = "timeline-item";
      const strong = document.createElement("strong");
      strong.textContent = time;
      const p = document.createElement("p");
      p.textContent = action;
      item.append(strong, p);
      els.profileTimeline.appendChild(item);
    });

    replaceChildren(els.profileMoves);
    plan.moves.forEach((move, index) => {
      const article = document.createElement("article");
      article.className = "profile-move";
      const top = document.createElement("div");
      top.className = "move-top";
      const badge = document.createElement("span");
      badge.textContent = String(index + 1).padStart(2, "0");
      const heading = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = move.title;
      const meta = document.createElement("p");
      meta.textContent = `${move.timeline} | ${move.impact} impact`;
      heading.append(title, meta);
      top.append(badge, heading);
      const action = document.createElement("p");
      action.textContent = move.action;
      const target = document.createElement("p");
      target.className = "target-schools";
      target.textContent = `Targets: ${move.target}`;
      const evidence = document.createElement("p");
      evidence.className = "evidence-line";
      evidence.textContent = `Add evidence: ${move.evidence}`;
      article.append(top, action, target, evidence);
      els.profileMoves.appendChild(article);
    });

    replaceChildren(els.profileClusters);
    plan.clusters.forEach(([title, body]) => {
      const item = document.createElement("div");
      item.className = "cluster-item";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const p = document.createElement("p");
      p.textContent = body;
      item.append(strong, p);
      els.profileClusters.appendChild(item);
    });

    replaceChildren(els.evidenceChecklist);
    plan.evidence.forEach((text) => {
      const item = document.createElement("div");
      item.className = "evidence-item";
      item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
      const span = document.createElement("span");
      span.textContent = text;
      item.appendChild(span);
      els.evidenceChecklist.appendChild(item);
    });

    replaceChildren(els.wordingBank);
    plan.wording.forEach(([label, copy]) => {
      const item = document.createElement("div");
      item.className = "wording-item";
      const strong = document.createElement("strong");
      strong.textContent = label;
      const p = document.createElement("p");
      p.textContent = copy;
      item.append(strong, p);
      els.wordingBank.appendChild(item);
    });
  }

  function renderStats(rows) {
    const top = rows[0];
    const limit = visibleCardLimit();
    els.countMetric.textContent = String(rows.length);
    els.topMetric.textContent = top ? top.lensScore.toFixed(1) : "0.0";
    els.caMetric.textContent = String(rows.filter((school) => school.state === "CA").length);
    els.clinicalMetric.textContent = String(rows.filter((school) => school.clinicalSignal > 0).length);
    els.resultSummary.textContent = `${rows.length} schools visible. Showing up to ${limit} cards, sorted by ${sortLabel()}. Fit score means pathway match for this profile; admit-rate bands are school-level context, not personal admission chances.`;
  }

  function renderPlot(rows) {
    const width = els.plot.clientWidth || 780;
    const height = els.plot.clientHeight || 430;
    const pad = { left: 54, right: 24, top: 24, bottom: 48 };
    const xMax = 0.95;
    const yMin = Math.max(35, Math.floor(Math.min(...rows.map((s) => s.lensScore), 55) / 10) * 10);
    const yMax = 100;
    const svg = createSvg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "list",
      "aria-label": "Schools plotted by admit rate and current fit score",
    });

    for (let i = 0; i <= 5; i += 1) {
      const x = pad.left + ((width - pad.left - pad.right) * i) / 5;
      svg.appendChild(createSvg("line", { x1: x, y1: pad.top, x2: x, y2: height - pad.bottom, stroke: "#dce3ee" }));
      const label = createSvg("text", { x, y: height - 18, "text-anchor": "middle", class: "axis-label" });
      label.textContent = `${Math.round((xMax * i * 100) / 5)}%`;
      svg.appendChild(label);
    }

    for (let i = 0; i <= 4; i += 1) {
      const score = yMin + ((yMax - yMin) * i) / 4;
      const y = scale(score, yMin, yMax, height - pad.bottom, pad.top);
      svg.appendChild(createSvg("line", { x1: pad.left, y1: y, x2: width - pad.right, y2: y, stroke: "#dce3ee" }));
      const label = createSvg("text", { x: 16, y: y + 4, class: "axis-label" });
      label.textContent = Math.round(score);
      svg.appendChild(label);
    }

    const xAxis = createSvg("text", { x: width / 2, y: height - 4, "text-anchor": "middle", class: "axis-label" });
    xAxis.textContent = "admit rate";
    svg.appendChild(xAxis);

    const yAxis = createSvg("text", {
      x: 14,
      y: height / 2,
      transform: `rotate(-90 14 ${height / 2})`,
      "text-anchor": "middle",
      class: "axis-label",
    });
    yAxis.textContent = "fit score";
    svg.appendChild(yAxis);

    rows.slice(0, 120).forEach((school) => {
      const x = scale(clamp(safe(school.admit_rate, 0.02), 0.02, xMax), 0.02, xMax, pad.left, width - pad.right);
      const y = scale(school.lensScore, yMin, yMax, height - pad.bottom, pad.top);
      const point = createSvg("circle", {
        cx: x,
        cy: y,
        r: selectedOrCompared(school) ? 8 : 6,
        fill: colorForBand(school.band),
        class: `point ${state.selected === school.slug ? "active" : ""}`,
        tabindex: selectedOrCompared(school) ? "0" : "-1",
        role: "button",
        "aria-label": `Select ${school.name}, ${school.lensScore.toFixed(1)} fit score, ${formatPct(school.admit_rate)} admit rate`,
        "data-slug": school.slug,
      });
      point.addEventListener("mouseenter", (event) => showTooltip(event, school));
      point.addEventListener("mousemove", (event) => moveTooltip(event));
      point.addEventListener("mouseleave", hideTooltip);
      point.addEventListener("click", () => selectSchool(school));
      point.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSchool(school);
        }
      });
      svg.appendChild(point);
    });

    replaceChildren(els.plot, svg);
  }

  function renderPlotList(rows) {
    replaceChildren(els.plotList);
    rows.slice(0, 8).forEach((school) => {
      const button = document.createElement("button");
      button.className = "plot-list-item";
      button.type = "button";
      button.addEventListener("click", () => selectSchool(school));
      const strong = document.createElement("strong");
      strong.textContent = school.name;
      const span = document.createElement("span");
      span.textContent = `${shortBand(school.band)} | ${school.lensScore.toFixed(1)} fit | ${formatPct(school.admit_rate)} admit`;
      button.append(strong, span);
      els.plotList.appendChild(button);
    });
  }

  function renderBoard(rows) {
    replaceChildren(els.bandBoard);
    const bandLimit = window.matchMedia("(max-width: 640px)").matches ? 3 : 5;
    bandOrder.forEach((band) => {
      const column = document.createElement("div");
      column.className = "band-column";
      const title = document.createElement("h3");
      title.textContent = shortBand(band);
      column.appendChild(title);
      rows
        .filter((school) => school.band === band)
        .slice(0, bandLimit)
        .forEach((school) => {
          const button = document.createElement("button");
          button.className = "mini-card";
          button.type = "button";
          button.addEventListener("click", () => selectSchool(school));
          const strong = document.createElement("strong");
          strong.textContent = school.name;
          const span = document.createElement("span");
          span.textContent = `${school.state} | ${school.lensScore.toFixed(1)} fit | ${formatPct(school.admit_rate)} admit`;
          const reason = document.createElement("small");
          reason.textContent = miniReason(school);
          button.append(strong, span, reason);
          column.appendChild(button);
        });
      els.bandBoard.appendChild(column);
    });
  }

  function renderCards(rows) {
    replaceChildren(els.cards);
    rows.slice(0, visibleCardLimit()).forEach((school) => {
      const card = document.createElement("article");
      card.className = "school-card";

      const header = document.createElement("header");
      const text = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = school.name;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${school.city}, ${school.state} | ${school.control} | ${formatPct(school.admit_rate)} admit`;
      text.append(title, meta);
      const rank = document.createElement("span");
      rank.className = "rank-badge";
      rank.textContent = String(Math.round(school.lensScore));
      header.append(text, rank);

      const pills = document.createElement("div");
      pills.className = "pill-row";
      [
        shortBand(school.band),
        ...school.tags.slice(0, 2),
        school.state === "CA" ? "CA option" : null,
        school.clinicalSignal ? "clinical signal" : null,
      ]
        .filter(Boolean)
        .forEach((label) => pills.appendChild(pill(label)));

      const bars = barsElement([
        ["Materials", school.materials_score],
        ["Bio/neuro", school.biology_score],
        ["Profile", school.profile_score],
      ]);

      const cardNotes = document.createElement("div");
      cardNotes.className = "card-notes";
      const best = document.createElement("div");
      const bestLabel = document.createElement("strong");
      bestLabel.textContent = "Best reason";
      const bestText = document.createElement("span");
      bestText.textContent = school.nuance || school.why_apply;
      best.append(bestLabel, bestText);
      const path = document.createElement("div");
      const pathLabel = document.createElement("strong");
      pathLabel.textContent = "Path";
      const pathText = document.createElement("span");
      pathText.textContent = school.tags.slice(0, 2).join(" + ") || shortBand(school.band);
      path.append(pathLabel, pathText);
      cardNotes.append(best, path);

      const verify = document.createElement("p");
      verify.className = "verify-preview";
      verify.textContent = `Verify: ${school.warning || school.caution}`;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.textContent = "Inspect";
      inspect.addEventListener("click", () => selectSchool(school));
      const compare = document.createElement("button");
      compare.type = "button";
      compare.className = "compare";
      compare.textContent = state.compare.includes(school.slug) ? "Compared" : "Compare";
      compare.addEventListener("click", () => toggleCompare(school));
      actions.append(inspect, compare);

      card.append(header, pills, bars, cardNotes, verify, actions);
      els.cards.appendChild(card);
    });
  }

  function renderDetail(school) {
    if (!school) {
      els.detailEmpty.classList.remove("hidden");
      els.detailContent.classList.add("hidden");
      els.detailPanel.classList.remove("open");
      els.detailPanel.setAttribute("aria-modal", "false");
      state.detailCollapsed = true;
      syncRails();
      return;
    }

    const enriched = { ...school, lensScore: lensScore(school) };
    els.detailEmpty.classList.add("hidden");
    els.detailContent.classList.remove("hidden");
    els.detailPanel.classList.add("open");
    state.detailCollapsed = false;
    els.detailPanel.setAttribute("aria-modal", window.matchMedia("(max-width: 1220px)").matches ? "true" : "false");
    syncRails();
    els.detailBand.textContent = shortBand(enriched.band);
    els.detailName.textContent = enriched.name;
    els.detailMeta.textContent = `${enriched.city}, ${enriched.state} | ${enriched.control} | ${formatPct(enriched.admit_rate)} admit | ${formatMoney(enriched.net_price)} net price`;
    els.detailScore.textContent = enriched.lensScore.toFixed(0);
    els.detailWhy.textContent = enriched.why_apply;
    els.detailCaution.textContent = enriched.caution;
    els.detailNuance.textContent = enriched.nuance || "No curated school-specific note yet; use the component scores and program signals as a first-pass screen.";
    els.detailMaterialsPath.textContent = enriched.materialsPath || "Needs department-level verification before treating this as a materials or biomaterials fit.";
    els.detailClinicalPath.textContent = enriched.clinicalPath || "Needs manual checking for hospitals, clinical volunteering, shadowing, EMS, scribing, or clinical research access.";
    els.detailVerification.textContent =
      enriched.warning || "Needs department, cost, admissions, major-level selectivity, advising, and undergraduate research verification.";
    els.compareDetail.textContent = state.compare.includes(enriched.slug) ? "Remove from compare" : "Add to compare";
    replaceChildren(
      els.detailBars,
      barsElement([
        ["Materials", enriched.materials_score],
        ["Bio/neuro", enriched.biology_score],
        ["Research", enriched.profile_score],
        ["Outcomes", enriched.outcomes_score],
        ["Access", enriched.access_score],
      ])
    );
    replaceChildren(els.detailTags);
    (enriched.tags.length ? enriched.tags : ["manual check needed"]).forEach((label) => els.detailTags.appendChild(pill(label)));
    replaceChildren(els.detailProfileMoves);
    profileMovesForSchool(enriched).forEach((text) => {
      const item = document.createElement("div");
      item.className = "profile-mini-item";
      item.textContent = text;
      els.detailProfileMoves.appendChild(item);
    });
    replaceChildren(els.detailPrograms);
    programLabels(enriched).forEach((label) => els.detailPrograms.appendChild(pill(label)));
  }

  function renderCompare() {
    replaceChildren(els.compareGrid);
    const compared = state.compare.map((slug) => schools.find((school) => school.slug === slug)).filter(Boolean);
    document.body.classList.toggle("has-compare", compared.length > 0);
    els.compareTray.classList.toggle("empty", compared.length === 0);
    for (let i = 0; i < 3; i += 1) {
      const school = compared[i];
      const card = document.createElement("button");
      card.type = "button";
      card.className = school ? "compare-card" : "compare-card empty";
      if (!school) {
        card.textContent = "Add a school";
        card.disabled = true;
      } else {
        const enriched = { ...school, lensScore: lensScore(school) };
        card.setAttribute("aria-label", `Inspect compared school ${enriched.name}`);
        const strong = document.createElement("strong");
        strong.textContent = enriched.name;
        const meta = document.createElement("p");
        meta.textContent = `${enriched.lensScore.toFixed(1)} fit | ${formatPct(enriched.admit_rate)} admit | ${formatMoney(enriched.net_price)}`;
        const focus = document.createElement("p");
        focus.textContent = `Materials ${percent(enriched.materials_score)} | Bio ${percent(enriched.biology_score)}`;
        card.append(strong, meta, focus);
        card.addEventListener("click", () => selectSchool(enriched));
      }
      els.compareGrid.appendChild(card);
    }
  }

  function selectSchool(school) {
    lastDetailTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.selected = school.slug;
    state.detailCollapsed = false;
    renderDetail(school);
    els.detailPanel.scrollTop = 0;
    renderPlot(currentRows());
    renderPlotList(currentRows());
    announce(`${school.name} detail opened.`);
    focusDetailPanel();
  }

  function toggleCompare(school) {
    if (state.compare.includes(school.slug)) {
      state.compare = state.compare.filter((slug) => slug !== school.slug);
    } else {
      state.compare = [...state.compare.slice(-2), school.slug];
    }
    renderCompare();
    renderCards(currentRows());
    renderDetail(schools.find((item) => item.slug === state.selected) || null);
    announce(state.compare.includes(school.slug) ? `${school.name} added to compare.` : `${school.name} removed from compare.`);
  }

  function closeSelectedDetail() {
    state.selected = null;
    state.detailCollapsed = true;
    renderDetail(null);
    renderPlot(currentRows());
    renderPlotList(currentRows());
    announce("School detail closed.");
    if (lastDetailTrigger && typeof lastDetailTrigger.focus === "function" && document.contains(lastDetailTrigger)) {
      lastDetailTrigger.focus({ preventScroll: true });
    }
  }

  function focusDetailPanel() {
    if (!window.matchMedia("(max-width: 1220px)").matches) return;
    window.requestAnimationFrame(() => {
      els.closeDetail.focus({ preventScroll: true });
    });
  }

  function lensScore(school) {
    const w = tracks[state.track].weights;
    const value =
      safe(school.materials_score) * safe(w.materials) +
      safe(school.biology_score) * safe(w.biology) +
      safe(school.profile_score) * safe(w.profile) +
      safe(school.outcomes_score) * safe(w.outcomes) +
      safe(school.access_score) * safe(w.access) +
      safe(school.ca_value_score) * safe(w.ca) +
      safe(school.clinicalSignal) * safe(w.clinical);
    return value * 100;
  }

  function clinicalSignal(school) {
    const text = [
      school.why_apply,
      school.programs,
      school.tags.join(" "),
      school.clinicalPath,
      school.nuance,
    ].join(" ").toLowerCase();
    const terms = ["medical", "medicine", "clinical", "pre-med", "hospital", "neuro", "neuroscience", "physician"];
    return terms.some((term) => text.includes(term)) ? 1 : 0;
  }

  function barsElement(items) {
    const wrapper = document.createElement("div");
    wrapper.className = "bar-stack";
    items.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const left = document.createElement("span");
      left.textContent = label;
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${Math.round(safe(value) * 100)}%`;
      track.appendChild(fill);
      const right = document.createElement("span");
      right.textContent = percent(value);
      row.append(left, track, right);
      wrapper.appendChild(row);
    });
    return wrapper;
  }

  function programLabels(school) {
    if (!school.programs) return ["No relevant Scorecard CIP listed"];
    return school.programs
      .split("|")
      .flatMap((group) => group.split(";").slice(0, 3))
      .map((label) => label.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  function profileMovesForSchool(school) {
    const tagText = (school.tags || []).join(" ").toLowerCase();
    const text = `${tagText} ${school.materialsPath} ${school.clinicalPath} ${school.nuance}`.toLowerCase();
    const moves = [];
    if (text.includes("materials") || text.includes("mse") || text.includes("engineering")) {
      moves.push("Add quantified materials proof: characterization, microscopy metrics, or a reproducible image-analysis figure.");
    }
    if (text.includes("clinical") || text.includes("medical") || text.includes("pre-med") || text.includes("medicine")) {
      moves.push("Add patient-facing service or clinical exposure with reflection; this makes the pre-med/medicine interest more grounded.");
    }
    if (text.includes("bio") || text.includes("neuro") || text.includes("physician")) {
      moves.push("Connect ASDRP to a medicine-facing question: drug delivery, neural systems, tissue models, or imaging.");
      moves.push("Build a biology/neuro lab map with one recent topic per lab, not just a department name.");
    }
    if (school.state === "CA") {
      moves.push("Prepare UC-style evidence: academic subject, leadership, creativity/problem solving, and community impact stories.");
    }
    if (text.includes("clinical") || text.includes("medical") || text.includes("patient")) {
      moves.push("For any clinical or patient-facing project, keep privacy, consent, age rules, and supervisor boundaries explicit.");
    }
    moves.push("Build a school-specific lab map with 2-3 faculty or programs before writing supplements.");
    return [...new Set(moves)].slice(0, 4);
  }

  function pill(label) {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = label;
    return span;
  }

  function showTooltip(event, school) {
    els.tooltip.classList.remove("hidden");
    els.tooltip.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = school.name;
    const line = document.createElement("div");
    line.textContent = `${school.state} | ${lensScore(school).toFixed(1)} fit | ${formatPct(school.admit_rate)} admit`;
    els.tooltip.append(strong, line);
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const x = Math.min(window.innerWidth - 300, event.clientX + 16);
    const y = Math.min(window.innerHeight - 90, event.clientY + 16);
    els.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  function hideTooltip() {
    els.tooltip.classList.add("hidden");
  }

  function initCanvas() {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    const points = Array.from({ length: 54 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      type: index % 3,
    }));

    function draw(time) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, width, height);

      const motionTime = motionQuery.matches ? 0 : time;
      const coords = points.map((point) => {
        const drift = Math.sin(motionTime / 1600 + point.phase) * 0.018;
        return {
          x: (point.x + drift) * width,
          y: (point.y + Math.cos(motionTime / 1900 + point.phase) * 0.018) * height,
          type: point.type,
        };
      });

      coords.forEach((a, i) => {
        coords.slice(i + 1).forEach((b) => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < width * 0.14) {
            ctx.strokeStyle = `rgba(255,255,255,${0.18 - dist / (width * 0.95)})`;
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        });
      });

      coords.forEach((point) => {
        const colors = ["#0f9f9a", "#e6573f", "#c9971a"];
        ctx.fillStyle = colors[point.type];
        ctx.beginPath();
        ctx.arc(point.x, point.y, (point.type === 1 ? 5 : 4) * dpr, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!motionQuery.matches) requestAnimationFrame(draw);
    }
    draw(0);
    motionQuery.addEventListener("change", () => draw(0));
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function safe(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function scale(value, min, max, outMin, outMax) {
    if (max === min) return outMin;
    return outMin + ((value - min) / (max - min)) * (outMax - outMin);
  }

  function formatPct(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 1000) / 10}%` : "n/a";
  }

  function percent(value) {
    return `${Math.round(safe(value) * 100)}%`;
  }

  function formatMoney(value) {
    return Number.isFinite(Number(value)) ? `$${Math.round(Number(value)).toLocaleString()}` : "n/a";
  }

  function shortBand(band) {
    return {
      "Far reach by admit rate": "Far reach",
      "Reach by admit rate": "Reach",
      "Competitive/possible by admit rate": "Competitive",
      "More accessible by admit rate": "Accessible",
    }[band] || band;
  }

  function colorForBand(band) {
    return {
      "Far reach by admit rate": "#e6573f",
      "Reach by admit rate": "#c9971a",
      "Competitive/possible by admit rate": "#2774d9",
      "More accessible by admit rate": "#2a9d55",
    }[band] || "#627086";
  }

  function selectedOrCompared(school) {
    return school.slug === state.selected || state.compare.includes(school.slug);
  }

  function sortLabel() {
    return {
      lens: "current lens score",
      admit: "admit rate",
      materials: "materials strength",
      biology: "bio/neuro strength",
      outcomes: "outcomes",
      netprice: "net price",
    }[state.sort];
  }

  function miniReason(school) {
    if (school.nuance) return school.nuance;
    if (school.tags && school.tags.length) return `Path: ${school.tags.slice(0, 2).join(" + ")}`;
    return school.why_apply;
  }

  function visibleCardLimit() {
    if (window.matchMedia("(max-width: 640px)").matches) return 18;
    if (window.matchMedia("(max-width: 980px)").matches) return 30;
    return 48;
  }

  function debounce(fn, wait) {
    let timeout = null;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }

  function setPressed(selector, activeButton) {
    document.querySelectorAll(selector).forEach((item) => {
      const isActive = item === activeButton;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
  }

  function syncRails() {
    const isDrawer = window.matchMedia("(max-width: 1220px)").matches;
    document.body.classList.toggle("filters-collapsed", state.filtersCollapsed);
    document.body.classList.toggle("detail-collapsed", state.detailCollapsed);
    els.toggleFilters.setAttribute("aria-expanded", String(!state.filtersCollapsed));
    els.toggleFilters.setAttribute("aria-label", state.filtersCollapsed ? "Expand filters" : "Collapse filters");
    els.toggleDetail.setAttribute("aria-expanded", String(!state.detailCollapsed));
    els.toggleDetail.setAttribute("aria-label", state.detailCollapsed ? "Expand school detail" : "Collapse school detail");
    const modalOpen = Boolean(isDrawer && state.selected && !state.detailCollapsed);
    els.detailPanel.setAttribute("aria-modal", String(modalOpen));
    [els.controls, els.workspace, els.compareTray].forEach((node) => {
      if (!node) return;
      node.toggleAttribute("inert", modalOpen);
    });
  }

  function announce(message) {
    if (!els.statusAnnouncer) return;
    els.statusAnnouncer.textContent = message;
  }

  function researchPromptsForMode() {
    const shared = [
      ["Labs", "Name two labs and one recent paper that connect to scaffolded vesicles, hydrogels, organoids, microscopy, or drug delivery."],
      ["Access", "Confirm whether first-year students can join labs, volunteer clinically, or take research-for-credit without special barriers."],
      ["Major fit", "Check whether pre-med prerequisites fit inside the likely major without crushing GPA or blocking research time."],
    ];
    if (state.analysis === "surgeon") {
      return [
        ["Clinical route", "Find the closest hospital, volunteer office, EMS program, or shadowing pathway and whether freshmen can participate."],
        ["Advising", "Check committee letters, med-school acceptance reporting, and how the school supports applicants who are not biology majors."],
        ["GPA risk", "Look for grade deflation warnings, engineering workload constraints, and whether the student can choose a flexible biology/neuro major."],
        ...shared,
      ];
    }
    if (state.analysis === "physicianScientist") {
      return [
        ["Research depth", "Prioritize schools with undergrad thesis culture, summer research funding, and hospital-linked biomedical labs."],
        ["Narrative", "Look for places where the student's scaffolded-vesicle work naturally becomes biomaterials, tissue engineering, or neural development."],
        ["Computation", "Check computational biology, bioinformatics, and image-analysis routes as a differentiating skill set."],
        ...shared,
      ];
    }
    if (state.analysis === "materials") {
      return [
        ["MSE depth", "Check whether the school has a real undergraduate materials major, not only graduate labs or a course cluster."],
        ["Soft materials", "Prioritize polymers, hydrogels, biomaterials, microscopy, nanomedicine, and tissue-engineering groups."],
        ["Pre-med compatibility", "If surgery remains plausible, verify the engineering plan can still cover chemistry, biology, MCAT prep, and clinical time."],
        ...shared,
      ];
    }
    return [
      ["Bridge labs", "Search for biomaterials, tissue engineering, organoids, hydrogels, drug delivery, and microscopy groups."],
      ["Essay angle", "Test whether the school lets the student explain materials as a tool for controlling fragile biological systems."],
      ["Mentor targets", "Find faculty who sit between MSE, bioengineering, neuroscience, and medicine, then save one question per lab."],
      ...shared,
    ];
  }

  function createSvg(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function replaceChildren(node, ...children) {
    node.replaceChildren(...children);
  }
})();
