// ════════════════════════════════════════════════════════════
// Performance Appraisal — Static Data Constants
// ════════════════════════════════════════════════════════════

// ── Rating Scale ──────────────────────────────────────────
export const RATING_OPTIONS = [
  { value: 5, label: '5 — Excellent' },
  { value: 4, label: '4 — Very Good' },
  { value: 3, label: '3 — Good' },
  { value: 2, label: '2 — Needs Improvement' },
  { value: 1, label: '1 — Poor' },
  { value: 0, label: 'N/A' },
]

// ── Section Weights ───────────────────────────────────────
export const SECTION_WEIGHTS = {
  section360: 0.30,
  kpi: 0.50,
  supervisor: 0.20,
}

// ── Classification Bands ──────────────────────────────────
export const CLASSIFICATION_BANDS = [
  { min: 90, max: 100, label: 'Excellent', color: '#059669', bg: '#d1fae5' },
  { min: 75, max: 89, label: 'Very Good', color: '#2563eb', bg: '#dbeafe' },
  { min: 60, max: 74, label: 'Good', color: '#7c3aed', bg: '#ede9fe' },
  { min: 40, max: 59, label: 'Needs Improvement', color: '#d97706', bg: '#fef3c7' },
  { min: 0, max: 39, label: 'Poor', color: '#dc2626', bg: '#fee2e2' },
]

export function getClassification(scorePercent: number) {
  for (const band of CLASSIFICATION_BANDS) {
    if (scorePercent >= band.min && scorePercent <= band.max) return band
  }
  return CLASSIFICATION_BANDS[CLASSIFICATION_BANDS.length - 1]
}


// ══════════════════════════════════════════════════════════
// SECTION 1 — 360° ASSESSMENT (46 statements, 6 categories)
// ══════════════════════════════════════════════════════════

export interface Statement360 {
  id: number
  text: string
}

export interface Category360 {
  key: string
  label: string
  statements: Statement360[]
}

export const CATEGORIES_360: Category360[] = [
  {
    key: 'work_performance',
    label: 'Work Performance & Results',
    statements: [
      { id: 1, text: 'Consistently completes assigned responsibilities effectively.' },
      { id: 2, text: 'Meets agreed targets and deadlines.' },
      { id: 3, text: 'Produces work that is accurate and of good quality.' },
      { id: 4, text: 'Demonstrates adequate knowledge and understanding of assigned responsibilities.' },
      { id: 5, text: 'Effectively identifies and solves problems related to assigned tasks.' },
      { id: 6, text: 'Takes responsibility for the outcomes of assigned work.' },
      { id: 7, text: 'Prioritizes tasks effectively according to their importance and urgency.' },
      { id: 8, text: 'Completes routine responsibilities with minimal supervision.' },
      { id: 9, text: 'Demonstrates consistency in the quality of work delivered.' },
      { id: 10, text: 'Uses available resources effectively to accomplish assigned tasks.' },
    ],
  },
  {
    key: 'reliability',
    label: 'Reliability & Accountability',
    statements: [
      { id: 11, text: 'Can be relied upon to complete assigned tasks as promised.' },
      { id: 12, text: 'Maintains punctuality and regular attendance as required.' },
      { id: 13, text: 'Communicates promptly when unable to meet a deadline or commitment.' },
      { id: 14, text: 'Takes ownership of mistakes and works to correct them.' },
      { id: 15, text: 'Follows through on commitments made to colleagues and supervisors.' },
      { id: 16, text: 'Remains dependable when working under pressure.' },
      { id: 17, text: 'Accepts responsibility for assigned duties without unnecessary excuses.' },
      { id: 18, text: 'Keeps colleagues and supervisors informed about the progress of assigned tasks.' },
    ],
  },
  {
    key: 'teamwork',
    label: 'Teamwork & Collaboration',
    statements: [
      { id: 19, text: 'Works effectively with colleagues across different teams or departments.' },
      { id: 20, text: 'Supports colleagues when assistance is reasonably required.' },
      { id: 21, text: 'Communicates respectfully with team members.' },
      { id: 22, text: 'Makes constructive contributions to team projects and activities.' },
      { id: 23, text: 'Handles disagreements and differences of opinion professionally.' },
      { id: 24, text: 'Shares relevant information that can help colleagues perform their duties.' },
      { id: 25, text: 'Respects the roles, responsibilities, and contributions of other team members.' },
      { id: 26, text: 'Promotes a cooperative and positive working environment.' },
    ],
  },
  {
    key: 'communication',
    label: 'Communication & Professionalism',
    statements: [
      { id: 27, text: 'Communicates information clearly and effectively.' },
      { id: 28, text: 'Responds to work-related messages and requests in a timely manner.' },
      { id: 29, text: 'Maintains a professional attitude when dealing with challenging situations.' },
      { id: 30, text: 'Listens carefully to instructions, feedback, and the views of others.' },
      { id: 31, text: 'Communicates important issues before they become serious problems.' },
      { id: 32, text: 'Conducts themselves professionally when representing Firstoption.' },
      { id: 33, text: 'Demonstrates courtesy and respect in workplace interactions.' },
      { id: 34, text: 'Maintains professionalism when communicating with customers and external stakeholders.' },
    ],
  },
  {
    key: 'customer_focus',
    label: 'Customer Focus',
    statements: [
      { id: 35, text: 'Demonstrates a clear understanding of customer needs.' },
      { id: 36, text: 'Treats customers respectfully and professionally.' },
      { id: 37, text: 'Handles customer complaints and concerns appropriately.' },
      { id: 38, text: 'Follows up with customers when necessary.' },
      { id: 39, text: 'Demonstrates commitment to customer satisfaction.' },
      { id: 40, text: 'Provides accurate and helpful information to customers.' },
      { id: 41, text: 'Protects and promotes Firstoption\'s reputation during customer interactions.' },
    ],
  },
  {
    key: 'initiative',
    label: 'Initiative, Growth & Work Ethics',
    statements: [
      { id: 42, text: 'Takes initiative rather than waiting for instructions for every task.' },
      { id: 43, text: 'Identifies potential problems and suggests practical solutions.' },
      { id: 44, text: 'Demonstrates willingness to learn new skills and improve existing ones.' },
      { id: 45, text: 'Responds positively to constructive feedback.' },
      { id: 46, text: 'Demonstrates honesty, integrity, and respect for Firstoption\'s policies and resources.' },
    ],
  },
]


// ══════════════════════════════════════════════════════════
// SECTION 2 — ROLE-SPECIFIC KPIs (5 departments)
// ══════════════════════════════════════════════════════════

export interface KPIItem {
  key: string
  label: string
  weight: number  // as percentage (e.g. 30 = 30%)
}

export interface DepartmentKPI {
  key: string
  label: string
  items: KPIItem[]
}

export const DEPARTMENT_KPIS: DepartmentKPI[] = [
  {
    key: 'sales',
    label: 'Sales / Business Development',
    items: [
      { key: 'sales_target', label: 'Sales/revenue target achievement', weight: 30 },
      { key: 'new_customers', label: 'New customer acquisition', weight: 15 },
      { key: 'lead_conversion', label: 'Lead conversion rate', weight: 15 },
      { key: 'customer_followup', label: 'Customer follow-up & retention', weight: 10 },
      { key: 'product_knowledge', label: 'Product/service knowledge', weight: 10 },
      { key: 'sales_reporting', label: 'Sales reporting & documentation', weight: 10 },
      { key: 'business_growth', label: 'Contribution to business growth', weight: 10 },
    ],
  },
  {
    key: 'technical',
    label: 'Technical / Solar Installation',
    items: [
      { key: 'install_quality', label: 'Installation/service quality', weight: 25 },
      { key: 'tech_accuracy', label: 'Technical accuracy & competence', weight: 20 },
      { key: 'job_completion', label: 'Job completion/timeliness', weight: 15 },
      { key: 'safety_compliance', label: 'Safety & compliance', weight: 15 },
      { key: 'troubleshooting', label: 'Troubleshooting/problem-solving', weight: 10 },
      { key: 'equipment_mgmt', label: 'Equipment & material management', weight: 10 },
      { key: 'tech_documentation', label: 'Documentation/reporting', weight: 5 },
    ],
  },
  {
    key: 'customer_service',
    label: 'Customer Service',
    items: [
      { key: 'csat', label: 'Customer satisfaction', weight: 25 },
      { key: 'response_time', label: 'Response time', weight: 20 },
      { key: 'complaint_resolution', label: 'Complaint resolution', weight: 20 },
      { key: 'followup_effectiveness', label: 'Follow-up effectiveness', weight: 15 },
      { key: 'comm_quality', label: 'Communication quality', weight: 10 },
      { key: 'record_keeping', label: 'Record keeping', weight: 10 },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing / Branding',
    items: [
      { key: 'campaign_performance', label: 'Campaign performance', weight: 20 },
      { key: 'lead_gen', label: 'Lead generation/conversion contribution', weight: 20 },
      { key: 'content_output', label: 'Content output & quality', weight: 15 },
      { key: 'brand_consistency', label: 'Brand consistency', weight: 15 },
      { key: 'digital_engagement', label: 'Digital engagement/growth', weight: 10 },
      { key: 'campaign_execution', label: 'Campaign execution', weight: 10 },
      { key: 'mkt_reporting', label: 'Reporting & analytics', weight: 10 },
    ],
  },
  {
    key: 'admin',
    label: 'Administration / Operations',
    items: [
      { key: 'task_completion', label: 'Task completion', weight: 20 },
      { key: 'accuracy_docs', label: 'Accuracy & documentation', weight: 20 },
      { key: 'admin_efficiency', label: 'Administrative efficiency', weight: 15 },
      { key: 'process_compliance', label: 'Process compliance', weight: 15 },
      { key: 'timeliness', label: 'Timeliness', weight: 15 },
      { key: 'internal_support', label: 'Internal support', weight: 10 },
      { key: 'admin_reporting', label: 'Reporting', weight: 5 },
    ],
  },
]


// ══════════════════════════════════════════════════════════
// SECTION 3 — SELF APPRAISAL (10 open-text questions)
// ══════════════════════════════════════════════════════════

export const SELF_APPRAISAL_QUESTIONS = [
  { key: 'q1', text: 'What were your major accomplishments during the appraisal period?' },
  { key: 'q2', text: 'Which of your targets did you achieve?' },
  { key: 'q3', text: 'Which targets did you not achieve, and why?' },
  { key: 'q4', text: 'What challenges affected your performance?' },
  { key: 'q5', text: 'What skills have you developed during the appraisal period?' },
  { key: 'q6', text: 'What support or resources would help you perform better?' },
  { key: 'q7', text: 'What areas of your performance do you believe require improvement?' },
  { key: 'q8', text: 'What are your key objectives for the next appraisal period?' },
  { key: 'q9', text: 'What additional responsibilities would you be interested in taking on?' },
  { key: 'q10', text: 'What suggestions do you have for improving Firstoption\'s operations or work environment?' },
]


// ══════════════════════════════════════════════════════════
// SECTION 4 — SUPERVISOR ASSESSMENT (10 areas, rated 1-5)
// ══════════════════════════════════════════════════════════

export const SUPERVISOR_AREAS = [
  { key: 'kpi_targets', label: 'Achievement of assigned KPIs and targets' },
  { key: 'quality_accuracy', label: 'Quality and accuracy of work' },
  { key: 'reliability', label: 'Reliability and accountability' },
  { key: 'initiative', label: 'Initiative and problem-solving' },
  { key: 'team_contribution', label: 'Team contribution' },
  { key: 'customer_impact', label: 'Customer impact' },
  { key: 'professional_conduct', label: 'Professional conduct' },
  { key: 'leadership_potential', label: 'Leadership potential' },
  { key: 'learning_dev', label: 'Learning and development' },
  { key: 'readiness', label: 'Readiness for additional responsibility' },
]


// ══════════════════════════════════════════════════════════
// SECTION 5 — QUALITATIVE FEEDBACK (10 open-text questions)
// ══════════════════════════════════════════════════════════

export const QUALITATIVE_QUESTIONS = [
  { key: 'q1', text: 'What does this staff member do particularly well?' },
  { key: 'q2', text: 'What is the staff member\'s most valuable contribution to Firstoption or your team?' },
  { key: 'q3', text: 'What area of the staff member\'s performance requires the most improvement?' },
  { key: 'q4', text: 'What challenges, if any, have you experienced while working with this staff member?' },
  { key: 'q5', text: 'Can you provide an example of a situation where this staff member demonstrated excellent performance or made a significant positive contribution?' },
  { key: 'q6', text: 'Can you provide an example of a situation where this staff member could have handled things better?' },
  { key: 'q7', text: 'What should this staff member continue doing?' },
  { key: 'q8', text: 'What should this staff member stop doing or do differently?' },
  { key: 'q9', text: 'What should this staff member start doing to become more effective in their role?' },
  { key: 'q10', text: 'What specific recommendation would you make to help this staff member improve their overall performance and contribution to Firstoption?' },
]


// ══════════════════════════════════════════════════════════
// CALCULATION HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Calculate category average for 360° ratings, ignoring N/A (0 or null).
 */
export function calc360CategoryAvg(ratings: Record<string, number | null>, statementIds: number[]): number {
  const validRatings = statementIds
    .map(id => ratings[String(id)])
    .filter((r): r is number => r !== null && r !== undefined && r > 0)
  if (validRatings.length === 0) return 0
  return validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length
}

/**
 * Calculate overall 360° average across all 6 categories.
 */
export function calc360OverallAvg(categoryAverages: Record<string, number>): number {
  const vals = Object.values(categoryAverages).filter(v => v > 0)
  if (vals.length === 0) return 0
  return vals.reduce((sum, v) => sum + v, 0) / vals.length
}

/**
 * Calculate weighted KPI average.
 * weightedAvg = Σ(rating × weight%) / 100
 */
export function calcKPIWeightedAvg(ratings: Record<string, number | null>, items: KPIItem[]): number {
  let totalWeighted = 0
  let totalWeight = 0
  for (const item of items) {
    const rating = ratings[item.key]
    if (rating !== null && rating !== undefined && rating > 0) {
      totalWeighted += rating * item.weight
      totalWeight += item.weight
    }
  }
  if (totalWeight === 0) return 0
  return totalWeighted / totalWeight
}

/**
 * Calculate supervisor assessment average (mean of 10 ratings).
 */
export function calcSupervisorAvg(ratings: Record<string, number | null>): number {
  const validRatings = Object.values(ratings).filter((r): r is number => r !== null && r !== undefined && r > 0)
  if (validRatings.length === 0) return 0
  return validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length
}

/**
 * Calculate final appraisal score as a percentage.
 * finalScore = (weighted360 + weightedKPI + weightedSupervisor) / 5 * 100
 */
export function calcFinalScore(avg360: number, avgKPI: number, avgSupervisor: number): number {
  const weighted360 = avg360 * SECTION_WEIGHTS.section360
  const weightedKPI = avgKPI * SECTION_WEIGHTS.kpi
  const weightedSupervisor = avgSupervisor * SECTION_WEIGHTS.supervisor
  const totalWeighted = weighted360 + weightedKPI + weightedSupervisor
  return (totalWeighted / 5) * 100
}
