/**
 * The prevocational (PGY1 and PGY2) curriculum: the AMC National Framework for Prevocational Medical
 * Training outcome statements (Section 2A, four domains, 28 statements), the clinical experience
 * categories (Section 2C), and the learning areas the question bank is organised by.
 *
 * Learning areas are this app's own grouping of the work of a junior doctor; each carries the outcome
 * statements it mostly evidences. `pipeline/blueprint.py` mirrors the areas and shares; keep them in step.
 */

export const TRACK = 'prevocational' as const;

// ------------------------------------------------------------------ AMC outcome statements
export interface OutcomeDomain { id: 'D1' | 'D2' | 'D3' | 'D4'; title: string; summary: string }

export const OUTCOME_DOMAINS: OutcomeDomain[] = [
  { id: 'D1', title: 'Practitioner', summary: 'Assessing and caring for patients: communicating, documenting, prescribing, ordering investigations and transferring care.' },
  { id: 'D2', title: 'Professional and leader', summary: 'Ethical behaviour, professional values, personal wellbeing, lifelong learning and teamwork.' },
  { id: 'D3', title: 'Health advocate', summary: 'Whole-of-person care, partnering with patients, and acting on the broader determinants of health.' },
  { id: 'D4', title: 'Scientist and scholar', summary: 'Applying and expanding medical knowledge, evidence and quality improvement.' },
];

export interface OutcomeStatement { code: string; domain: OutcomeDomain['id']; short: string; text: string }

/** Section 2A, verbatim. `short` is this app's label for tiles and tags. */
export const OUTCOME_STATEMENTS: OutcomeStatement[] = [
  { code: '1.1', domain: 'D1', short: 'Patient safety, handover and escalation', text: 'Place the needs and safety of patients at the centre of the care process, working within statutory and regulatory requirements and guidelines. Demonstrate skills including effective clinical handover, graded assertiveness, delegation and escalation, infection control, and adverse event reporting.' },
  { code: '1.2', domain: 'D1', short: 'Communication, shared decisions and consent', text: 'Communicate sensitively and effectively with patients, their family and carers, and health professionals, applying the principles of shared decision-making and informed consent.' },
  { code: '1.3', domain: 'D1', short: 'Culturally safe care for Aboriginal and Torres Strait Islander patients', text: 'Demonstrate effective, culturally safe interpersonal skills, empathetic communication and respect within an ethical framework inclusive of Indigenous knowledges of wellbeing and health models to support Aboriginal and Torres Strait Islander patient care.' },
  { code: '1.4', domain: 'D1', short: 'Assessment, examination and differential diagnosis', text: "Perform and document patient assessments, incorporating a problem-focused medical history with a relevant physical examination, and generate a valid differential diagnosis and/or summary of the patient's health and other relevant issues." },
  { code: '1.5', domain: 'D1', short: 'Requesting and interpreting investigations', text: 'Request and accurately interpret common and relevant investigations using evidence-informed knowledge and principles of sustainability and cost-effectiveness.' },
  { code: '1.6', domain: 'D1', short: 'Procedural skills', text: 'Safely perform a range of common procedural skills required for work as a PGY1 or PGY2 doctor.' },
  { code: '1.7', domain: 'D1', short: 'Management decisions and referrals', text: 'Make evidence-informed management decisions and referrals using principles of shared decision-making with patients, carers and the health care team.' },
  { code: '1.8', domain: 'D1', short: 'Safe prescribing', text: 'Prescribe therapies and other products including drugs, fluids, electrolytes, and blood products safely, effectively and economically.' },
  { code: '1.9', domain: 'D1', short: 'Deteriorating and critically unwell patients', text: 'Recognise, assess, communicate and escalate as required, and provide immediate management to deteriorating and critically unwell patients.' },
  { code: '1.10', domain: 'D1', short: 'Systems, technology and documentation', text: 'Appropriately use and adapt to dynamic systems and technology to facilitate practice, including for documentation, communication, information management and supporting decision-making.' },
  { code: '2.1', domain: 'D2', short: 'Ethical behaviour and professional values', text: 'Demonstrate ethical behaviours and professional values including integrity, compassion, self-awareness, empathy, patient confidentiality and respect for all.' },
  { code: '2.2', domain: 'D2', short: 'Wellbeing, fatigue and own limits', text: "Identify factors and optimise personal wellbeing and professional practice, including responding to fatigue, and recognising and respecting one's own limitations to mitigate risks associated with professional practice." },
  { code: '2.3', domain: 'D2', short: 'Lifelong learning, teaching and feedback', text: 'Demonstrate lifelong learning behaviours and participate in, and contribute to, teaching, supervision and feedback.' },
  { code: '2.4', domain: 'D2', short: 'Increasing responsibility within limits', text: 'Take increasing responsibility for patient care, while recognising the limits of their expertise and involving other professionals as needed to contribute to patient care.' },
  { code: '2.5', domain: 'D2', short: 'Interprofessional teamwork', text: 'Respect the roles and expertise of healthcare professionals, and learn and work collaboratively as a member of an inter-professional team.' },
  { code: '2.6', domain: 'D2', short: 'Safe and supportive workplaces', text: 'Contribute to safe and supportive work environments, including being aware of professional standards and institutional policies and processes regarding bullying, harassment and discrimination for themselves and others.' },
  { code: '2.7', domain: 'D2', short: 'Improving cultural safety', text: 'Critically evaluate cultural safety and clinical competencies to improve culturally safe practice and create culturally safe environments for Aboriginal and Torres Strait Islander communities. Incorporate into the learning plan strategies to address any identified gaps in knowledge, skills, or behaviours that impact Aboriginal and Torres Strait Islander patient care.' },
  { code: '2.8', domain: 'D2', short: 'Time, workload and prioritisation', text: 'Effectively manage time and workload demands, be punctual, and show ability to prioritise workload to manage patient outcomes and health service functions.' },
  { code: '3.1', domain: 'D3', short: 'Prevention, promotion and screening', text: 'Incorporate disease prevention, relevant health promotion and health surveillance into interactions with individual patients, including screening for common diseases, chronic conditions, and discussions of healthcare behaviours with patients.' },
  { code: '3.2', domain: 'D3', short: 'Whole-of-person care', text: "Apply whole-of-person care principles to clinical practice, including consideration of a patient's physical, emotional, social, economic, cultural and spiritual needs and their geographical location, acknowledging that these factors can influence a patient's description of symptoms, presentation of illness, healthcare behaviours and access to health services or resources." },
  { code: '3.3', domain: 'D3', short: 'Culturally safe practice and reflection', text: "Demonstrate culturally safe practice with ongoing critical reflection of the impact of a health practitioner's knowledge, skills, attitudes, practising behaviours and power differentials in delivering safe, accessible and responsive healthcare free of racism and discrimination." },
  { code: '3.4', domain: 'D3', short: 'Systemic bias and racism in health care', text: 'Demonstrate knowledge of the systemic and clinician biases in the health system that impact on the service delivery for Aboriginal and Torres Strait Islander peoples. This includes understanding current evidence around systemic racism as a determinant of health and how racism maintains health inequity.' },
  { code: '3.5', domain: 'D3', short: 'Impact of colonisation and intergenerational trauma', text: 'Demonstrate knowledge of the ongoing impact of colonisation, intergenerational trauma and racism on the health and wellbeing of Aboriginal and Torres Strait Islander peoples.' },
  { code: '3.6', domain: 'D3', short: 'Partnering with patients, family and the care team', text: 'Partner with the patient in their healthcare journey, recognising the importance of interaction with and connection to the broader healthcare system. Where relevant, this should include culturally appropriate communication with caregivers and extended family members while also including and working collaboratively with other health professionals (including Aboriginal Health Workers, practitioners and Liaison Officers).' },
  { code: '4.1', domain: 'D4', short: 'Knowledge of common and important presentations', text: 'Consolidate, expand and apply knowledge of the aetiology, pathology, clinical features, natural history and prognosis of common and important presentations in a variety of stages of life and settings.' },
  { code: '4.2', domain: 'D4', short: 'Appraising and applying evidence', text: 'Access, critically appraise and apply evidence from the medical and scientific literature to clinical and professional practice.' },
  { code: '4.3', domain: 'D4', short: 'Quality, audit and reflective practice', text: 'Participate in quality assurance and quality improvement activities such as peer review of performance, clinical audit, risk management, incident reporting and reflective practice.' },
  { code: '4.4', domain: 'D4', short: 'Evidence and models of care for Aboriginal and Torres Strait Islander health', text: 'Demonstrate a knowledge of evidence-informed medicine and models of care that support and advance Aboriginal and Torres Strait Islander health.' },
];

export const OUTCOME_CODES = OUTCOME_STATEMENTS.map((o) => o.code);
export const outcomeStatement = (code: string) => OUTCOME_STATEMENTS.find((o) => o.code === code) ?? null;
export const isOutcomeCode = (x: unknown): x is string => typeof x === 'string' && OUTCOME_CODES.includes(x);

// ------------------------------------------------------------------ clinical experiences (Section 2C)
export const CLINICAL_EXPERIENCES = [
  { id: 'A', title: 'Undifferentiated illness patient care' },
  { id: 'B', title: 'Chronic illness patient care' },
  { id: 'C', title: 'Acute and critical illness patient care' },
  { id: 'D', title: 'Peri-procedural patient care' },
] as const;
export type ClinicalExperience = (typeof CLINICAL_EXPERIENCES)[number]['id'];
export const CLINICAL_EXPERIENCE_IDS: ClinicalExperience[] = ['A', 'B', 'C', 'D'];

export const PGY_LEVELS = ['PGY1', 'PGY2', 'both'] as const;
export type PgyLevel = (typeof PGY_LEVELS)[number];

export const SETTINGS = ['rural', 'metro', 'any'] as const;
export type Setting = (typeof SETTINGS)[number];

// ------------------------------------------------------------------ learning areas
/**
 * `domains` holds the outcome statement codes an area mostly evidences (stored on each item as
 * `domains`, 1-3 codes, so the progress map can be built from answers). `experiences` is the usual
 * clinical experience category. `share` is the area's share of the bank; shares sum to 1.
 */
export interface CurriculumArea { area: string; share: number; domains: string[]; experiences: ClinicalExperience[]; presentations: string[] }

export const CURRICULUM: CurriculumArea[] = [
  { area: 'Deteriorating patient', share: 0.09, domains: ['1.9', '1.1'], experiences: ['C'], presentations: ['hypotension on the ward', 'tachycardia after surgery', 'reduced level of consciousness', 'oliguria', 'hypoxia on the ward', 'fever and rigors', 'chest pain on the ward', 'head strike on an anticoagulant', 'seizure on the ward', 'anaphylaxis to a ward medication', 'rapid response criteria and escalation', 'cardiac arrest recognition and basic life support'] },
  { area: 'General medicine', share: 0.08, domains: ['4.1', '1.7'], experiences: ['A', 'B'], presentations: ['community-acquired pneumonia', 'heart failure', 'COPD exacerbation', 'atrial fibrillation', 'venous thromboembolism', 'anaemia work-up', 'hyperglycaemia in hospital', 'insulin on the ward', 'thyroid disease', 'upper gastrointestinal bleed', 'acute kidney injury', 'hypertension on the ward', 'syncope work-up', 'gout flare in hospital'] },
  { area: 'Prescribing and medication safety', share: 0.08, domains: ['1.8', '1.1'], experiences: ['B'], presentations: ['writing a safe medication chart', 'antibiotic choice and duration', 'opioid prescribing and discharge', 'anticoagulant dosing and reversal', 'drug interactions', 'renal dose adjustment', 'insulin prescribing errors', 'high-risk medicines', 'allergy documentation', 'medication reconciliation at admission', 'paracetamol and NSAID safety', 'venous thromboembolism prophylaxis'] },
  { area: 'Surgery and perioperative care', share: 0.07, domains: ['1.4', '1.7', '1.6'], experiences: ['D'], presentations: ['preoperative assessment', 'perioperative medication management', 'postoperative fever', 'postoperative ileus', 'wound infection', 'appendicitis', 'bowel obstruction', 'surgical drains and wound care', 'postoperative pain management', 'fasting and fluids before theatre', 'consent for a procedure', 'postoperative urinary retention'] },
  { area: 'Emergency presentations', share: 0.06, domains: ['1.4', '1.9'], experiences: ['C', 'A'], presentations: ['undifferentiated chest pain', 'acute shortness of breath', 'acute abdominal pain', 'headache red flags', 'minor head injury', 'overdose and poisoning', 'acute asthma', 'diabetic ketoacidosis', 'stroke recognition', 'limb fracture initial management', 'burns first aid', 'acute back pain red flags'] },
  { area: 'Investigations and interpretation', share: 0.06, domains: ['1.5'], experiences: ['A'], presentations: ['ECG interpretation', 'arterial blood gas', 'chest X-ray interpretation', 'full blood count abnormalities', 'liver function tests', 'troponin interpretation', 'coagulation studies', 'urinalysis', 'choosing imaging wisely', 'abdominal X-ray', 'D-dimer and pretest probability', 'thyroid function tests'] },
  { area: 'Fluids, electrolytes and renal', share: 0.05, domains: ['1.8', '1.5'], experiences: ['B', 'C'], presentations: ['maintenance intravenous fluids', 'hypokalaemia', 'hyperkalaemia', 'hyponatraemia', 'hypernatraemia', 'fluid resuscitation', 'acute kidney injury', 'hypercalcaemia', 'hypomagnesaemia', 'blood product prescribing'] },
  { area: 'Infection and sepsis', share: 0.05, domains: ['1.9', '1.8'], experiences: ['C'], presentations: ['sepsis recognition and the sepsis pathway', 'urinary tract infection', 'cellulitis', 'line-related infection', 'antimicrobial stewardship', 'neutropenic fever', 'meningitis', 'infection control and isolation', 'respiratory virus on the ward', 'notifiable diseases'] },
  { area: 'Communication, handover and consent', share: 0.05, domains: ['1.1', '1.2', '1.7'], experiences: ['A'], presentations: ['ISBAR clinical handover', 'graded assertiveness', 'escalation call to a registrar', 'informed consent', 'breaking bad news', 'discharge summary quality', 'phone call about a deteriorating patient', 'communication with family', 'shared decision-making', 'working with an interpreter'] },
  { area: 'Mental health and behavioural emergencies', share: 0.05, domains: ['1.4', '1.9', '2.4'], experiences: ['A', 'C'], presentations: ['acute agitation', 'suicide risk assessment', 'delirium versus psychosis', 'alcohol withdrawal', 'capacity to refuse treatment', 'self-harm presentation', 'depression on the ward', 'involuntary treatment under the Mental Health Act', 'refeeding risk in an eating disorder'] },
  { area: 'Older people, delirium and falls', share: 0.05, domains: ['1.4', '3.2'], experiences: ['B'], presentations: ['delirium', 'falls on the ward', 'polypharmacy and deprescribing', 'dementia with behavioural symptoms', 'pressure injury prevention', 'advance care directives', 'discharge planning for an older person', 'hip fracture', 'constipation', 'urinary retention'] },
  { area: 'Aboriginal and Torres Strait Islander health', share: 0.05, domains: ['1.3', '2.7', '3.3', '3.4', '3.5', '4.4'], experiences: ['A', 'B'], presentations: ['culturally safe communication', 'working with Aboriginal Liaison Officers', 'discharge against medical advice', 'acute rheumatic fever and rheumatic heart disease', 'chronic kidney disease', 'health assessment and Closing the Gap PBS', 'family and kinship in decision-making', 'systemic racism and health inequity', 'Sorry Business and cultural obligations', 'language and interpreter needs'] },
  { area: 'Paediatrics', share: 0.04, domains: ['4.1', '1.4'], experiences: ['A', 'C'], presentations: ['febrile child', 'bronchiolitis', 'gastroenteritis and dehydration', 'paediatric fluid prescribing', 'febrile seizure', 'paediatric asthma', 'child protection concern', 'neonatal jaundice', 'paediatric drug dosing'] },
  { area: 'Professionalism, ethics and law', share: 0.04, domains: ['2.1', '2.4', '2.6'], experiences: ['A'], presentations: ['confidentiality and privacy', 'mandatory notification', 'open disclosure after an error', 'bullying and harassment', 'impaired colleague', 'social media and professional boundaries', 'fitness to drive', 'death certification and coronial reporting', 'scope of practice', 'gifts and conflicts of interest'] },
  { area: 'Procedures and practical skills', share: 0.04, domains: ['1.6'], experiences: ['D'], presentations: ['intravenous cannulation', 'urinary catheterisation', 'venepuncture and blood cultures', 'arterial puncture', 'nasogastric tube insertion', 'local anaesthetic and wound closure', 'ECG acquisition', 'basic airway management', 'sharps injury', 'plaster and splint check'] },
  { area: "Obstetrics and women's health", share: 0.03, domains: ['4.1', '1.7'], experiences: ['A'], presentations: ['bleeding in early pregnancy', 'hypertension in pregnancy', 'prescribing in pregnancy and breastfeeding', 'contraception counselling', 'postpartum fever', 'ectopic pregnancy', 'pregnant patient in the emergency department'] },
  { area: 'Patient safety, quality and systems', share: 0.03, domains: ['1.1', '1.10', '4.3'], experiences: ['A'], presentations: ['incident reporting', 'clinical handover failure', 'electronic medical record documentation', 'medication error', 'clinical audit', 'wrong-patient error', 'National Safety and Quality Health Service Standards', 'root cause analysis', 'alert fatigue and decision support'] },
  { area: 'Palliative care and goals of care', share: 0.03, domains: ['1.7', '3.2', '1.2'], experiences: ['B'], presentations: ['goals of care conversation', 'resuscitation plan', 'terminal symptoms', 'opioid titration in palliative care', 'recognising dying', 'syringe driver', 'request for information about voluntary assisted dying'] },
  { area: 'Chronic disease, prevention and advocacy', share: 0.03, domains: ['3.1', '3.2', '3.6'], experiences: ['B'], presentations: ['type 2 diabetes review', 'smoking cessation', 'adult immunisation', 'screening programs', 'social determinants and discharge', 'alcohol brief intervention', 'obesity', 'chronic pain'] },
  { area: 'Doctor wellbeing, teamwork and workload', share: 0.02, domains: ['2.2', '2.3', '2.5', '2.8'], experiences: ['A'], presentations: ['fatigue and safe working hours', 'prioritising a ward call list', 'asking for help', 'feedback and supervision', 'interprofessional teamwork', 'managing a heavy workload', "a doctor's own health", 'teaching students'] },
];

export const CURRICULUM_AREAS = CURRICULUM.map((c) => c.area);
export const curriculumArea = (area: string) => CURRICULUM.find((c) => c.area === area) ?? null;

/** Where a case happens. Kept generic so other tracks can reuse the schema. */
export const CONTEXTS = ['ward', 'ed', 'clinic', 'theatre', 'after_hours', 'rural', 'telehealth'] as const;
export type Context = (typeof CONTEXTS)[number];

/** What an item asks of the trainee. `prioritisation` replaces the ACRRM track's rural adaptation level. */
export const COGNITIVE_LEVELS = ['recall', 'interpretation', 'management', 'prioritisation'] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];
