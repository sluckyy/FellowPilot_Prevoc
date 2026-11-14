"""Curriculum blueprint for FellowPilot Prevocational (mirrors packages/core/src/curriculum.ts).

Learning areas are this app's grouping of a junior doctor's work. Each carries the AMC prevocational
outcome statements it mostly evidences (stored on items as `domains`, 1-3 codes) and its usual
clinical experience category (A undifferentiated, B chronic, C acute and critical, D peri-procedural).
"""

# Share of the bank per area (sums to 100). A 250-item round gets a floor of 2 per area plus the rest by share.
ALLOCATION = {
    "Deteriorating patient": 9,
    "General medicine": 8,
    "Prescribing and medication safety": 8,
    "Surgery and perioperative care": 7,
    "Emergency presentations": 6,
    "Investigations and interpretation": 6,
    "Fluids, electrolytes and renal": 5,
    "Infection and sepsis": 5,
    "Communication, handover and consent": 5,
    "Mental health and behavioural emergencies": 5,
    "Older people, delirium and falls": 5,
    "Aboriginal and Torres Strait Islander health": 5,
    "Paediatrics": 4,
    "Professionalism, ethics and law": 4,
    "Procedures and practical skills": 4,
    "Obstetrics and women's health": 3,
    "Patient safety, quality and systems": 3,
    "Palliative care and goals of care": 3,
    "Chronic disease, prevention and advocacy": 3,
    "Doctor wellbeing, teamwork and workload": 2,
}

PRESENTATIONS = {
    "Deteriorating patient": ["hypotension on the ward", "tachycardia after surgery", "reduced level of consciousness", "oliguria", "hypoxia on the ward", "fever and rigors", "chest pain on the ward", "head strike on an anticoagulant", "seizure on the ward", "anaphylaxis to a ward medication", "rapid response criteria and escalation", "cardiac arrest recognition and basic life support"],
    "General medicine": ["community-acquired pneumonia", "heart failure", "COPD exacerbation", "atrial fibrillation", "venous thromboembolism", "anaemia work-up", "hyperglycaemia in hospital", "insulin on the ward", "thyroid disease", "upper gastrointestinal bleed", "acute kidney injury", "hypertension on the ward", "syncope work-up", "gout flare in hospital"],
    "Prescribing and medication safety": ["writing a safe medication chart", "antibiotic choice and duration", "opioid prescribing and discharge", "anticoagulant dosing and reversal", "drug interactions", "renal dose adjustment", "insulin prescribing errors", "high-risk medicines", "allergy documentation", "medication reconciliation at admission", "paracetamol and NSAID safety", "venous thromboembolism prophylaxis"],
    "Surgery and perioperative care": ["preoperative assessment", "perioperative medication management", "postoperative fever", "postoperative ileus", "wound infection", "appendicitis", "bowel obstruction", "surgical drains and wound care", "postoperative pain management", "fasting and fluids before theatre", "consent for a procedure", "postoperative urinary retention"],
    "Emergency presentations": ["undifferentiated chest pain", "acute shortness of breath", "acute abdominal pain", "headache red flags", "minor head injury", "overdose and poisoning", "acute asthma", "diabetic ketoacidosis", "stroke recognition", "limb fracture initial management", "burns first aid", "acute back pain red flags"],
    "Investigations and interpretation": ["ECG interpretation", "arterial blood gas", "chest X-ray interpretation", "full blood count abnormalities", "liver function tests", "troponin interpretation", "coagulation studies", "urinalysis", "choosing imaging wisely", "abdominal X-ray", "D-dimer and pretest probability", "thyroid function tests"],
    "Fluids, electrolytes and renal": ["maintenance intravenous fluids", "hypokalaemia", "hyperkalaemia", "hyponatraemia", "hypernatraemia", "fluid resuscitation", "acute kidney injury", "hypercalcaemia", "hypomagnesaemia", "blood product prescribing"],
    "Infection and sepsis": ["sepsis recognition and the sepsis pathway", "urinary tract infection", "cellulitis", "line-related infection", "antimicrobial stewardship", "neutropenic fever", "meningitis", "infection control and isolation", "respiratory virus on the ward", "notifiable diseases"],
    "Communication, handover and consent": ["ISBAR clinical handover", "graded assertiveness", "escalation call to a registrar", "informed consent", "breaking bad news", "discharge summary quality", "phone call about a deteriorating patient", "communication with family", "shared decision-making", "working with an interpreter"],
    "Mental health and behavioural emergencies": ["acute agitation", "suicide risk assessment", "delirium versus psychosis", "alcohol withdrawal", "capacity to refuse treatment", "self-harm presentation", "depression on the ward", "involuntary treatment under the Mental Health Act", "refeeding risk in an eating disorder"],
    "Older people, delirium and falls": ["delirium", "falls on the ward", "polypharmacy and deprescribing", "dementia with behavioural symptoms", "pressure injury prevention", "advance care directives", "discharge planning for an older person", "hip fracture", "constipation", "urinary retention"],
    "Aboriginal and Torres Strait Islander health": ["culturally safe communication", "working with Aboriginal Liaison Officers", "discharge against medical advice", "acute rheumatic fever and rheumatic heart disease", "chronic kidney disease", "health assessment and Closing the Gap PBS", "family and kinship in decision-making", "systemic racism and health inequity", "Sorry Business and cultural obligations", "language and interpreter needs"],
    "Paediatrics": ["febrile child", "bronchiolitis", "gastroenteritis and dehydration", "paediatric fluid prescribing", "febrile seizure", "paediatric asthma", "child protection concern", "neonatal jaundice", "paediatric drug dosing"],
    "Professionalism, ethics and law": ["confidentiality and privacy", "mandatory notification", "open disclosure after an error", "bullying and harassment", "impaired colleague", "social media and professional boundaries", "fitness to drive", "death certification and coronial reporting", "scope of practice", "gifts and conflicts of interest"],
    "Procedures and practical skills": ["intravenous cannulation", "urinary catheterisation", "venepuncture and blood cultures", "arterial puncture", "nasogastric tube insertion", "local anaesthetic and wound closure", "ECG acquisition", "basic airway management", "sharps injury", "plaster and splint check"],
    "Obstetrics and women's health": ["bleeding in early pregnancy", "hypertension in pregnancy", "prescribing in pregnancy and breastfeeding", "contraception counselling", "postpartum fever", "ectopic pregnancy", "pregnant patient in the emergency department"],
    "Patient safety, quality and systems": ["incident reporting", "clinical handover failure", "electronic medical record documentation", "medication error", "clinical audit", "wrong-patient error", "National Safety and Quality Health Service Standards", "root cause analysis", "alert fatigue and decision support"],
    "Palliative care and goals of care": ["goals of care conversation", "resuscitation plan", "terminal symptoms", "opioid titration in palliative care", "recognising dying", "syringe driver", "request for information about voluntary assisted dying"],
    "Chronic disease, prevention and advocacy": ["type 2 diabetes review", "smoking cessation", "adult immunisation", "screening programs", "social determinants and discharge", "alcohol brief intervention", "obesity", "chronic pain"],
    "Doctor wellbeing, teamwork and workload": ["fatigue and safe working hours", "prioritising a ward call list", "asking for help", "feedback and supervision", "interprofessional teamwork", "managing a heavy workload", "a doctor's own health", "teaching students"],
}

# Outcome statement codes each area mostly evidences (the generator may pick 1-3 from these, or add one).
OUTCOME_DEFAULTS = {
    "Deteriorating patient": ["1.9", "1.1"],
    "General medicine": ["4.1", "1.7"],
    "Prescribing and medication safety": ["1.8", "1.1"],
    "Surgery and perioperative care": ["1.4", "1.7", "1.6"],
    "Emergency presentations": ["1.4", "1.9"],
    "Investigations and interpretation": ["1.5"],
    "Fluids, electrolytes and renal": ["1.8", "1.5"],
    "Infection and sepsis": ["1.9", "1.8"],
    "Communication, handover and consent": ["1.1", "1.2", "1.7"],
    "Mental health and behavioural emergencies": ["1.4", "1.9", "2.4"],
    "Older people, delirium and falls": ["1.4", "3.2"],
    "Aboriginal and Torres Strait Islander health": ["1.3", "2.7", "3.3", "3.4", "3.5", "4.4"],
    "Paediatrics": ["4.1", "1.4"],
    "Professionalism, ethics and law": ["2.1", "2.4", "2.6"],
    "Procedures and practical skills": ["1.6"],
    "Obstetrics and women's health": ["4.1", "1.7"],
    "Patient safety, quality and systems": ["1.1", "1.10", "4.3"],
    "Palliative care and goals of care": ["1.7", "3.2", "1.2"],
    "Chronic disease, prevention and advocacy": ["3.1", "3.2", "3.6"],
    "Doctor wellbeing, teamwork and workload": ["2.2", "2.3", "2.5", "2.8"],
}

EXPERIENCE_DEFAULTS = {
    "Deteriorating patient": ["C"], "General medicine": ["A", "B"], "Prescribing and medication safety": ["B"],
    "Surgery and perioperative care": ["D"], "Emergency presentations": ["C", "A"], "Investigations and interpretation": ["A"],
    "Fluids, electrolytes and renal": ["B", "C"], "Infection and sepsis": ["C"], "Communication, handover and consent": ["A"],
    "Mental health and behavioural emergencies": ["A", "C"], "Older people, delirium and falls": ["B"],
    "Aboriginal and Torres Strait Islander health": ["A", "B"], "Paediatrics": ["A", "C"], "Professionalism, ethics and law": ["A"],
    "Procedures and practical skills": ["D"], "Obstetrics and women's health": ["A"], "Patient safety, quality and systems": ["A"],
    "Palliative care and goals of care": ["B"], "Chronic disease, prevention and advocacy": ["B"], "Doctor wellbeing, teamwork and workload": ["A"],
}

OUTCOME_CODES = [f"1.{i}" for i in range(1, 11)] + [f"2.{i}" for i in range(1, 9)] + [f"3.{i}" for i in range(1, 7)] + [f"4.{i}" for i in range(1, 5)]

# Age bands a presentation can plausibly occur in (overrides the area default).
PRESENTATION_AGES = {
    "febrile child": ["0-1", "1-4", "5-12"], "bronchiolitis": ["0-1"], "gastroenteritis and dehydration": ["0-1", "1-4", "5-12"],
    "paediatric fluid prescribing": ["0-1", "1-4", "5-12"], "febrile seizure": ["0-1", "1-4"], "paediatric asthma": ["1-4", "5-12", "13-17"],
    "child protection concern": ["0-1", "1-4", "5-12"], "neonatal jaundice": ["0-1"], "paediatric drug dosing": ["0-1", "1-4", "5-12"],
    "delirium": ["65-74", "75-84", "85+"], "falls on the ward": ["65-74", "75-84", "85+"], "dementia with behavioural symptoms": ["75-84", "85+"],
    "hip fracture": ["75-84", "85+"], "acute rheumatic fever and rheumatic heart disease": ["5-12", "13-17", "16-24"],
}

CONTEXT_SHARE = {"ward": 40, "ed": 25, "after_hours": 12, "rural": 10, "clinic": 6, "theatre": 5, "telehealth": 2}
COGNITIVE_SHARE = {"recall": 15, "interpretation": 25, "management": 40, "prioritisation": 20}
DIFFICULTY_SHARE = {1: 15, 2: 30, 3: 35, 4: 15, 5: 5}
SETTING_SHARE = {"rural": 45, "metro": 30, "any": 25}       # YNLHN is a regional network; keep metro cases too
PGY_SHARE = {"PGY1": 50, "PGY2": 30, "both": 20}

CONTEXT_LEAN = {
    "Deteriorating patient": ["ward", "after_hours", "rural"],
    "Emergency presentations": ["ed", "rural"],
    "Surgery and perioperative care": ["theatre", "ward"],
    "Procedures and practical skills": ["ward", "ed", "theatre"],
    "Chronic disease, prevention and advocacy": ["clinic", "telehealth"],
    "Palliative care and goals of care": ["ward", "rural"],
    "Older people, delirium and falls": ["ward", "after_hours"],
    "Doctor wellbeing, teamwork and workload": ["ward", "after_hours"],
    "Communication, handover and consent": ["ward", "after_hours"],
    "Investigations and interpretation": ["ed", "ward"],
    "Paediatrics": ["ed", "rural"],
    "Obstetrics and women's health": ["ed", "clinic"],
}

# Secondary areas: any learning area, plus these cross-cutting tags.
LEARNING_AREAS_ALL = sorted(set(ALLOCATION) | {
    "Documentation", "Discharge planning", "Pharmacology", "Pathology", "Radiology", "Anaesthetics",
    "Dermatology", "Ophthalmology", "ENT", "Musculoskeletal", "Neurology", "Oncology", "Rural and remote", "Telehealth",
})
