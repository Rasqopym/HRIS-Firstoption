import { supabase } from './supabase'

export type ItemScoringType = 'rating_1_5' | 'rating_1_10' | 'percentage' | 'weighted_kpi' | 'open_text' | 'yes_no'

export type EvaluatorType = 'self' | 'supervisor' | 'peer_cross_reference' | 'hod' | 'all'

export interface AssessmentItem {
  id: string
  key: string
  text: string
  description?: string
  scoringType: ItemScoringType
  weight: number // percentage
  targetRoles?: string[]
  targetDepartments?: string[]
  evaluatorType: EvaluatorType
  categoryKey: string
  order: number
}

export interface AssessmentSection {
  id: string
  key: string
  title: string
  description: string
  weight: number // percentage weight towards final score
  evaluatorRole: EvaluatorType
  items: AssessmentItem[]
}

export interface CrossReferenceRule {
  id: string
  evaluatorDepartment: string
  targetDepartment: string
  description: string
  isMandatory: boolean
}

export interface AppraisalTemplate {
  id: string
  name: string
  code: string
  description: string
  frameworkType: 'annual_360' | 'probation_confirmation' | 'cross_department' | 'leadership' | 'technical_field' | 'custom'
  targetRoles: string[]
  targetDepartments: string[]
  isDefault: boolean
  isActive: boolean
  sections: AssessmentSection[]
  crossReferences: CrossReferenceRule[]
  createdAt: string
  updatedAt: string
}

// ════════════════════════════════════════════════════════════
// FULL 46 STATEMENTS FOR 360° & CROSS-REFERENCE PEER EVALUATION
// ════════════════════════════════════════════════════════════

const STATEMENTS_360_FULL: AssessmentItem[] = [
  // 1. Work Performance & Results (1-10)
  { id: 'item-360-1', key: '1', text: 'Consistently completes assigned responsibilities effectively.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 1 },
  { id: 'item-360-2', key: '2', text: 'Meets agreed targets and deadlines.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 2 },
  { id: 'item-360-3', key: '3', text: 'Produces work that is accurate and of good quality.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 3 },
  { id: 'item-360-4', key: '4', text: 'Demonstrates adequate knowledge and understanding of assigned responsibilities.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 4 },
  { id: 'item-360-5', key: '5', text: 'Effectively identifies and solves problems related to assigned tasks.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 5 },
  { id: 'item-360-6', key: '6', text: 'Takes responsibility for the outcomes of assigned work.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 6 },
  { id: 'item-360-7', key: '7', text: 'Prioritizes tasks effectively according to their importance and urgency.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 7 },
  { id: 'item-360-8', key: '8', text: 'Completes routine responsibilities with minimal supervision.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 8 },
  { id: 'item-360-9', key: '9', text: 'Demonstrates consistency in the quality of work delivered.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 9 },
  { id: 'item-360-10', key: '10', text: 'Uses available resources effectively to accomplish assigned tasks.', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'all', categoryKey: 'work_performance', order: 10 },

  // 2. Reliability & Accountability (11-18)
  { id: 'item-360-11', key: '11', text: 'Can be relied upon to complete assigned tasks as promised.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'reliability', order: 11 },
  { id: 'item-360-12', key: '12', text: 'Maintains punctuality and regular attendance as required.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'reliability', order: 12 },
  { id: 'item-360-13', key: '13', text: 'Communicates promptly when unable to meet a deadline or commitment.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'reliability', order: 13 },
  { id: 'item-360-14', key: '14', text: 'Takes ownership of mistakes and works to correct them.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'reliability', order: 14 },
  { id: 'item-360-15', key: '15', text: 'Follows through on commitments made to colleagues and supervisors.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'reliability', order: 15 },
  { id: 'item-360-16', key: '16', text: 'Remains dependable when working under pressure.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'reliability', order: 16 },
  { id: 'item-360-17', key: '17', text: 'Accepts responsibility for assigned duties without unnecessary excuses.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'reliability', order: 17 },
  { id: 'item-360-18', key: '18', text: 'Keeps colleagues and supervisors informed about the progress of assigned tasks.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'reliability', order: 18 },

  // 3. Teamwork & Collaboration (19-26)
  { id: 'item-360-19', key: '19', text: 'Works effectively with colleagues across different teams or departments.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'teamwork', order: 19 },
  { id: 'item-360-20', key: '20', text: 'Supports colleagues when assistance is reasonably required.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'teamwork', order: 20 },
  { id: 'item-360-21', key: '21', text: 'Communicates respectfully with team members.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'teamwork', order: 21 },
  { id: 'item-360-22', key: '22', text: 'Makes constructive contributions to team projects and activities.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'teamwork', order: 22 },
  { id: 'item-360-23', key: '23', text: 'Handles disagreements and differences of opinion professionally.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'teamwork', order: 23 },
  { id: 'item-360-24', key: '24', text: 'Shares relevant information that can help colleagues perform their duties.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'teamwork', order: 24 },
  { id: 'item-360-25', key: '25', text: 'Respects the roles, responsibilities, and contributions of other team members.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'teamwork', order: 25 },
  { id: 'item-360-26', key: '26', text: 'Promotes a cooperative and positive working environment.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'teamwork', order: 26 },

  // 4. Communication & Professionalism (27-34)
  { id: 'item-360-27', key: '27', text: 'Communicates information clearly and effectively.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'communication', order: 27 },
  { id: 'item-360-28', key: '28', text: 'Responds to work-related messages and requests in a timely manner.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'communication', order: 28 },
  { id: 'item-360-29', key: '29', text: 'Maintains a professional attitude when dealing with challenging situations.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'communication', order: 29 },
  { id: 'item-360-30', key: '30', text: 'Listens carefully to instructions, feedback, and the views of others.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'communication', order: 30 },
  { id: 'item-360-31', key: '31', text: 'Communicates important issues before they become serious problems.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'communication', order: 31 },
  { id: 'item-360-32', key: '32', text: 'Conducts themselves professionally when representing Firstoption.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'communication', order: 32 },
  { id: 'item-360-33', key: '33', text: 'Demonstrates courtesy and respect in workplace interactions.', scoringType: 'rating_1_5', weight: 12, evaluatorType: 'all', categoryKey: 'communication', order: 33 },
  { id: 'item-360-34', key: '34', text: 'Maintains professionalism when communicating with customers and external stakeholders.', scoringType: 'rating_1_5', weight: 13, evaluatorType: 'all', categoryKey: 'communication', order: 34 },

  // 5. Customer Focus (35-41)
  { id: 'item-360-35', key: '35', text: 'Demonstrates a clear understanding of customer needs.', scoringType: 'rating_1_5', weight: 14, evaluatorType: 'all', categoryKey: 'customer_focus', order: 35 },
  { id: 'item-360-36', key: '36', text: 'Treats customers respectfully and professionally.', scoringType: 'rating_1_5', weight: 14, evaluatorType: 'all', categoryKey: 'customer_focus', order: 36 },
  { id: 'item-360-37', key: '37', text: 'Handles customer complaints and concerns appropriately.', scoringType: 'rating_1_5', weight: 14, evaluatorType: 'all', categoryKey: 'customer_focus', order: 37 },
  { id: 'item-360-38', key: '38', text: 'Follows up with customers when necessary.', scoringType: 'rating_1_5', weight: 14, evaluatorType: 'all', categoryKey: 'customer_focus', order: 38 },
  { id: 'item-360-39', key: '39', text: 'Demonstrates commitment to customer satisfaction.', scoringType: 'rating_1_5', weight: 14, evaluatorType: 'all', categoryKey: 'customer_focus', order: 39 },
  { id: 'item-360-40', key: '40', text: 'Provides accurate and helpful information to customers.', scoringType: 'rating_1_5', weight: 15, evaluatorType: 'all', categoryKey: 'customer_focus', order: 40 },
  { id: 'item-360-41', key: '41', text: 'Protects and promotes Firstoption\'s reputation during customer interactions.', scoringType: 'rating_1_5', weight: 15, evaluatorType: 'all', categoryKey: 'customer_focus', order: 41 },

  // 6. Initiative, Growth & Work Ethics (42-46)
  { id: 'item-360-42', key: '42', text: 'Takes initiative rather than waiting for instructions for every task.', scoringType: 'rating_1_5', weight: 20, evaluatorType: 'all', categoryKey: 'initiative', order: 42 },
  { id: 'item-360-43', key: '43', text: 'Identifies potential problems and suggests practical solutions.', scoringType: 'rating_1_5', weight: 20, evaluatorType: 'all', categoryKey: 'initiative', order: 43 },
  { id: 'item-360-44', key: '44', text: 'Demonstrates willingness to learn new skills and improve existing ones.', scoringType: 'rating_1_5', weight: 20, evaluatorType: 'all', categoryKey: 'initiative', order: 44 },
  { id: 'item-360-45', key: '45', text: 'Responds positively to constructive feedback.', scoringType: 'rating_1_5', weight: 20, evaluatorType: 'all', categoryKey: 'initiative', order: 45 },
  { id: 'item-360-46', key: '46', text: 'Demonstrates honesty, integrity, and respect for Firstoption\'s policies and resources.', scoringType: 'rating_1_5', weight: 20, evaluatorType: 'all', categoryKey: 'initiative', order: 46 },
]

// ════════════════════════════════════════════════════════════
// FULL DEPARTMENT KPIS ITEMS
// ════════════════════════════════════════════════════════════

const DEPARTMENT_KPIS_FULL: AssessmentItem[] = [
  // Sales / Business Development
  { id: 'kpi-sales-1', key: 'sales_target', text: 'Sales/revenue target achievement', scoringType: 'weighted_kpi', weight: 30, evaluatorType: 'supervisor', categoryKey: 'sales', order: 1 },
  { id: 'kpi-sales-2', key: 'new_customers', text: 'New customer acquisition', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'sales', order: 2 },
  { id: 'kpi-sales-3', key: 'lead_conversion', text: 'Lead conversion rate', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'sales', order: 3 },
  { id: 'kpi-sales-4', key: 'customer_followup', text: 'Customer follow-up & retention', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'sales', order: 4 },
  { id: 'kpi-sales-5', key: 'product_knowledge', text: 'Product/service knowledge', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'sales', order: 5 },
  { id: 'kpi-sales-6', key: 'sales_reporting', text: 'Sales reporting & documentation', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'sales', order: 6 },
  { id: 'kpi-sales-7', key: 'business_growth', text: 'Contribution to business growth', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'sales', order: 7 },

  // Technical / Solar Installation
  { id: 'kpi-tech-1', key: 'install_quality', text: 'Installation/service quality', scoringType: 'weighted_kpi', weight: 25, evaluatorType: 'supervisor', categoryKey: 'technical', order: 8 },
  { id: 'kpi-tech-2', key: 'tech_accuracy', text: 'Technical accuracy & competence', scoringType: 'weighted_kpi', weight: 20, evaluatorType: 'supervisor', categoryKey: 'technical', order: 9 },
  { id: 'kpi-tech-3', key: 'job_completion', text: 'Job completion/timeliness', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'technical', order: 10 },
  { id: 'kpi-tech-4', key: 'safety_compliance', text: 'Safety & compliance standards', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'technical', order: 11 },
  { id: 'kpi-tech-5', key: 'troubleshooting', text: 'Troubleshooting/problem-solving', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'technical', order: 12 },
  { id: 'kpi-tech-6', key: 'equipment_mgmt', text: 'Equipment & material management', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'technical', order: 13 },
  { id: 'kpi-tech-7', key: 'tech_documentation', text: 'Technical reporting & site logs', scoringType: 'weighted_kpi', weight: 5, evaluatorType: 'supervisor', categoryKey: 'technical', order: 14 },

  // Customer Service
  { id: 'kpi-cs-1', key: 'csat', text: 'Customer satisfaction (CSAT) rating', scoringType: 'weighted_kpi', weight: 25, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 15 },
  { id: 'kpi-cs-2', key: 'response_time', text: 'Inquiry response time & first contact resolution', scoringType: 'weighted_kpi', weight: 20, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 16 },
  { id: 'kpi-cs-3', key: 'complaint_resolution', text: 'Complaint escalation & resolution', scoringType: 'weighted_kpi', weight: 20, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 17 },
  { id: 'kpi-cs-4', key: 'followup_effectiveness', text: 'Follow-up effectiveness with clients', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 18 },
  { id: 'kpi-cs-5', key: 'comm_quality', text: 'Communication courtesy & clarity', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 19 },
  { id: 'kpi-cs-6', key: 'record_keeping', text: 'CRM log and client ticket record keeping', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'customer_service', order: 20 },

  // Administration / Operations
  { id: 'kpi-adm-1', key: 'task_completion', text: 'Core administrative task completion', scoringType: 'weighted_kpi', weight: 20, evaluatorType: 'supervisor', categoryKey: 'admin', order: 21 },
  { id: 'kpi-adm-2', key: 'accuracy_docs', text: 'Accuracy & documentation filing', scoringType: 'weighted_kpi', weight: 20, evaluatorType: 'supervisor', categoryKey: 'admin', order: 22 },
  { id: 'kpi-adm-3', key: 'admin_efficiency', text: 'Operational & administrative efficiency', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'admin', order: 23 },
  { id: 'kpi-adm-4', key: 'process_compliance', text: 'Internal SOP & process compliance', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'admin', order: 24 },
  { id: 'kpi-adm-5', key: 'timeliness', text: 'Timeliness in deliverables & vendor coordination', scoringType: 'weighted_kpi', weight: 15, evaluatorType: 'supervisor', categoryKey: 'admin', order: 25 },
  { id: 'kpi-adm-6', key: 'internal_support', text: 'Cross-functional internal support to other units', scoringType: 'weighted_kpi', weight: 10, evaluatorType: 'supervisor', categoryKey: 'admin', order: 26 },
  { id: 'kpi-adm-7', key: 'admin_reporting', text: 'Weekly/Monthly administrative reporting', scoringType: 'weighted_kpi', weight: 5, evaluatorType: 'supervisor', categoryKey: 'admin', order: 27 },
]

// ════════════════════════════════════════════════════════════
// FULL SUPERVISOR ASSESSMENT (10 AREAS)
// ════════════════════════════════════════════════════════════

const SUPERVISOR_AREAS_FULL: AssessmentItem[] = [
  { id: 'sup-1', key: 'kpi_targets', text: 'Achievement of assigned KPIs and targets', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 1 },
  { id: 'sup-2', key: 'quality_accuracy', text: 'Quality and accuracy of work output', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 2 },
  { id: 'sup-3', key: 'reliability', text: 'Reliability and accountability', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 3 },
  { id: 'sup-4', key: 'initiative', text: 'Initiative and proactive problem-solving', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 4 },
  { id: 'sup-5', key: 'team_contribution', text: 'Team contribution and cross-department support', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 5 },
  { id: 'sup-6', key: 'customer_impact', text: 'Customer and stakeholder impact', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 6 },
  { id: 'sup-7', key: 'professional_conduct', text: 'Professional conduct and corporate ethics', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 7 },
  { id: 'sup-8', key: 'leadership_potential', text: 'Leadership potential and autonomy', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 8 },
  { id: 'sup-9', key: 'learning_dev', text: 'Continuous learning and self-development', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 9 },
  { id: 'sup-10', key: 'readiness', text: 'Readiness for additional responsibilities & promotion', scoringType: 'rating_1_5', weight: 10, evaluatorType: 'supervisor', categoryKey: 'supervisor', order: 10 },
]

// ════════════════════════════════════════════════════════════
// FULL QUALITATIVE QUESTIONS (10 QUESTIONS)
// ════════════════════════════════════════════════════════════

const QUALITATIVE_QUESTIONS_FULL: AssessmentItem[] = [
  { id: 'qual-1', key: 'q1', text: 'What does this staff member do particularly well?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 1 },
  { id: 'qual-2', key: 'q2', text: 'What is the staff member\'s most valuable contribution to Firstoption or your team?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 2 },
  { id: 'qual-3', key: 'q3', text: 'What area of the staff member\'s performance requires the most improvement?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 3 },
  { id: 'qual-4', key: 'q4', text: 'What challenges, if any, have you experienced while working with this staff member?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 4 },
  { id: 'qual-5', key: 'q5', text: 'Can you provide an example of a situation where this staff member demonstrated excellent performance?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 5 },
  { id: 'qual-6', key: 'q6', text: 'Can you provide an example of a situation where this staff member could have handled things better?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 6 },
  { id: 'qual-7', key: 'q7', text: 'What should this staff member continue doing?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 7 },
  { id: 'qual-8', key: 'q8', text: 'What should this staff member stop doing or do differently?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 8 },
  { id: 'qual-9', key: 'q9', text: 'What should this staff member start doing to become more effective in their role?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 9 },
  { id: 'qual-10', key: 'q10', text: 'What specific recommendation would you make to help this staff member improve their overall contribution?', scoringType: 'open_text', weight: 10, evaluatorType: 'all', categoryKey: 'qualitative', order: 10 },
]

// ════════════════════════════════════════════════════════════
// PRE-BUILT COMPREHENSIVE STARTER TEMPLATES
// ════════════════════════════════════════════════════════════

export const DEFAULT_APPRAISAL_TEMPLATES: AppraisalTemplate[] = [
  {
    id: 'tmpl-annual-360',
    name: 'Standard Comprehensive 360° & Role KPI Appraisal',
    code: 'ANNUAL-360-V1',
    description: 'Complete institutional appraisal covering all 46 statements across 6 core competency categories, role-specific KPIs, supervisor evaluations, and qualitative cross-feedback.',
    frameworkType: 'annual_360',
    targetRoles: ['all'],
    targetDepartments: ['all'],
    isDefault: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-09-08T12:00:00Z',
    crossReferences: [
      { id: 'cr-1', evaluatorDepartment: 'Sales & Marketing', targetDepartment: 'General Operations', description: 'Evaluate operational turnaround time and support for client deliverables', isMandatory: true },
      { id: 'cr-2', evaluatorDepartment: 'Accounting & Finance', targetDepartment: 'Sales & Marketing', description: 'Evaluate billing documentation and invoicing accuracy', isMandatory: true },
      { id: 'cr-3', evaluatorDepartment: 'General Operations', targetDepartment: 'Customer Support', description: 'Evaluate customer service coordination, issue escalation, and response turnaround', isMandatory: false },
    ],
    sections: [
      {
        id: 'sec-360',
        key: 'core_360',
        title: '360° Core Competency & Cross-Reference Statements (46 Items)',
        description: 'Complete 46 statements across Work Performance, Reliability, Teamwork, Communication, Customer Focus, and Initiative.',
        weight: 30,
        evaluatorRole: 'all',
        items: STATEMENTS_360_FULL
      },
      {
        id: 'sec-kpis',
        key: 'role_kpis',
        title: 'Department & Role-Specific KPIs',
        description: 'Quantitative metric and goal achievement tailored to functional units.',
        weight: 50,
        evaluatorRole: 'supervisor',
        items: DEPARTMENT_KPIS_FULL
      },
      {
        id: 'sec-supervisor',
        key: 'supervisor_eval',
        title: 'Supervisor Assessment & Growth Potential (10 Areas)',
        description: 'Direct manager evaluation of readiness for higher responsibility and problem solving.',
        weight: 20,
        evaluatorRole: 'supervisor',
        items: SUPERVISOR_AREAS_FULL
      },
      {
        id: 'sec-qualitative',
        key: 'qualitative_feedback',
        title: 'Qualitative Cross-Feedback & Recommendations',
        description: '10 in-depth qualitative evaluation and developmental questions.',
        weight: 0,
        evaluatorRole: 'all',
        items: QUALITATIVE_QUESTIONS_FULL
      }
    ]
  },
  {
    id: 'tmpl-probation-confirm',
    name: 'Probation & Staff Confirmation Review',
    code: 'PROBATION-CONF-V1',
    description: 'Specialized 3-month and 6-month evaluation framework to determine staff confirmation readiness.',
    frameworkType: 'probation_confirmation',
    targetRoles: ['staff'],
    targetDepartments: ['all'],
    isDefault: false,
    isActive: true,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-09-08T12:00:00Z',
    crossReferences: [],
    sections: [
      {
        id: 'sec-prob-core',
        key: 'probation_core',
        title: 'Probation Learning & Core Skill Acquisition',
        description: 'Assessment of how quickly the employee mastered core company tools and responsibilities.',
        weight: 40,
        evaluatorRole: 'supervisor',
        items: [
          { id: 'item-pc-1', key: 'learning_curve', text: 'Speed of learning job processes, tools, and technical procedures.', scoringType: 'rating_1_5', weight: 30, evaluatorType: 'supervisor', categoryKey: 'probation', order: 1 },
          { id: 'item-pc-2', key: 'task_accuracy', text: 'Accuracy and quality of deliverables with routine guidance.', scoringType: 'rating_1_5', weight: 35, evaluatorType: 'supervisor', categoryKey: 'probation', order: 2 },
          { id: 'item-pc-3', key: 'cultural_fit', text: 'Cultural alignment, work ethic, and positive workplace demeanor.', scoringType: 'rating_1_5', weight: 35, evaluatorType: 'supervisor', categoryKey: 'probation', order: 3 },
        ]
      },
      {
        id: 'sec-prob-attendance',
        key: 'probation_discipline',
        title: 'Attendance, Punctuality & Discipline',
        description: 'Tracking adherence to work hours, geofence check-ins, and office rules.',
        weight: 30,
        evaluatorRole: 'supervisor',
        items: [
          { id: 'item-pc-4', key: 'punctuality_score', text: 'Consistent punctuality and absence of unexplained lateness/absence.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'probation', order: 1 },
          { id: 'item-pc-5', key: 'rules_compliance', text: 'Adherence to internal policies, IT guidelines, and dress code.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'probation', order: 2 },
        ]
      },
      {
        id: 'sec-prob-recommendation',
        key: 'confirmation_verdict',
        title: 'Confirmation Recommendation & Milestone Verdict',
        description: 'Supervisor and HR verdict on confirming, extending probation, or concluding appointment.',
        weight: 30,
        evaluatorRole: 'supervisor',
        items: [
          { id: 'item-pc-6', key: 'confirmation_readiness', text: 'Readiness for immediate full staff confirmation.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'probation', order: 1 },
          { id: 'item-pc-7', key: 'independent_delivery', text: 'Ability to deliver core duties independently without close supervision.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'probation', order: 2 },
        ]
      }
    ]
  },
  {
    id: 'tmpl-leadership-exec',
    name: 'Executive & Leadership Competency Assessment',
    code: 'LEADERSHIP-EXEC-V1',
    description: 'Tailored for Department Heads, Managers, and Supervisors covering team leadership, strategic delivery, budget control, and mentorship.',
    frameworkType: 'leadership',
    targetRoles: ['superadmin', 'hr', 'accountant'],
    targetDepartments: ['all'],
    isDefault: false,
    isActive: true,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-09-08T12:00:00Z',
    crossReferences: [],
    sections: [
      {
        id: 'sec-ldr-strategic',
        key: 'strategic_execution',
        title: 'Strategic Vision & Target Execution',
        description: 'Driving high-level business goals, quarterly execution plans, and ROI.',
        weight: 40,
        evaluatorRole: 'supervisor',
        items: [
          { id: 'item-ldr-1', key: 'goal_alignment', text: 'Translates corporate vision into concrete departmental milestones.', scoringType: 'rating_1_5', weight: 35, evaluatorType: 'supervisor', categoryKey: 'leadership', order: 1 },
          { id: 'item-ldr-2', key: 'budget_resource_mgmt', text: 'Efficient management of company budgets and material assets.', scoringType: 'rating_1_5', weight: 35, evaluatorType: 'supervisor', categoryKey: 'leadership', order: 2 },
          { id: 'item-ldr-3', key: 'crisis_decision_making', text: 'Decisive and sound judgment during complex or emergency situations.', scoringType: 'rating_1_5', weight: 30, evaluatorType: 'supervisor', categoryKey: 'leadership', order: 3 },
        ]
      },
      {
        id: 'sec-ldr-people',
        key: 'people_management',
        title: 'People Leadership, Mentorship & Delegation',
        description: 'Developing team capacity, constructive feedback, and talent retention.',
        weight: 35,
        evaluatorRole: 'all',
        items: [
          { id: 'item-ldr-4', key: 'team_motivation', text: 'Inspires, motivates, and maintains high morale across team members.', scoringType: 'rating_1_5', weight: 40, evaluatorType: 'all', categoryKey: 'leadership', order: 1 },
          { id: 'item-ldr-5', key: 'effective_delegation', text: 'Delegates responsibilities clearly with clear accountability metrics.', scoringType: 'rating_1_5', weight: 30, evaluatorType: 'all', categoryKey: 'leadership', order: 2 },
          { id: 'item-ldr-6', key: 'mentorship_coaching', text: 'Invests time in coaching junior colleagues and developing team capability.', scoringType: 'rating_1_5', weight: 30, evaluatorType: 'all', categoryKey: 'leadership', order: 3 },
        ]
      },
      {
        id: 'sec-ldr-governance',
        key: 'governance_integrity',
        title: 'Corporate Governance & Ethical Leadership',
        description: 'Championing compliance, security, and transparent operational practices.',
        weight: 25,
        evaluatorRole: 'supervisor',
        items: [
          { id: 'item-ldr-7', key: 'compliance_champion', text: 'Ensures 100% compliance with statutory and internal regulatory guidelines.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'leadership', order: 1 },
          { id: 'item-ldr-8', key: 'exemplary_ethics', text: 'Acts as a role model of corporate integrity and fairness.', scoringType: 'rating_1_5', weight: 50, evaluatorType: 'supervisor', categoryKey: 'leadership', order: 2 },
        ]
      }
    ]
  }
]

// ════════════════════════════════════════════════════════════
// LOCAL STORAGE & SUPABASE CRUD HELPERS
// ════════════════════════════════════════════════════════════

const STORAGE_KEY = 'hris_appraisal_templates_v4'

/**
 * Retrieve all appraisal templates (from Supabase with LocalStorage fallback)
 */
export async function getAppraisalTemplates(): Promise<AppraisalTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('appraisal_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data && data.length > 0) {
      const mapped = data.map((t: any) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        description: t.description || '',
        frameworkType: t.framework_type || 'custom',
        targetRoles: t.target_roles || ['all'],
        targetDepartments: t.target_departments || ['all'],
        isDefault: t.is_default || false,
        isActive: t.is_active ?? true,
        sections: t.sections || [],
        crossReferences: t.cross_references || [],
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }))
      const mainT = mapped.find(m => m.id === 'tmpl-annual-360')
      if (mainT && mainT.sections[0]?.items?.length >= 46) {
        return mapped
      }
    }
  } catch (err) {
    console.warn('Supabase appraisal_templates fetch warning, using local cache:', err)
  }

  // Fallback to localStorage
  try {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const mainTmpl = parsed.find(p => p.id === 'tmpl-annual-360')
        if (mainTmpl && mainTmpl.sections[0]?.items?.length >= 46) {
          return parsed
        }
      }
    }
  } catch (e) {}

  // Clean old caches and load full institutional standards
  try {
    localStorage.removeItem('hris_appraisal_templates_v2')
    localStorage.removeItem('hris_appraisal_templates_v3')
  } catch (e) {}

  saveTemplatesLocally(DEFAULT_APPRAISAL_TEMPLATES)
  return DEFAULT_APPRAISAL_TEMPLATES
}

/**
 * Reset and reload full institutional standards (46 statements + all KPIs)
 */
export async function resetTemplatesToDefault(): Promise<AppraisalTemplate[]> {
  try {
    localStorage.removeItem('hris_appraisal_templates_v2')
    localStorage.removeItem('hris_appraisal_templates_v3')
    localStorage.removeItem('hris_appraisal_templates_v4')
  } catch (e) {}

  saveTemplatesLocally(DEFAULT_APPRAISAL_TEMPLATES)

  // Sync defaults to Supabase if possible
  try {
    for (const tmpl of DEFAULT_APPRAISAL_TEMPLATES) {
      await supabase.from('appraisal_templates').upsert({
        id: tmpl.id,
        name: tmpl.name,
        code: tmpl.code,
        description: tmpl.description,
        framework_type: tmpl.frameworkType,
        target_roles: tmpl.targetRoles,
        target_departments: tmpl.targetDepartments,
        is_default: tmpl.isDefault,
        is_active: tmpl.isActive,
        sections: tmpl.sections,
        cross_references: tmpl.crossReferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
    }
  } catch (e) {}

  return DEFAULT_APPRAISAL_TEMPLATES
}

/**
 * Save templates array locally
 */
export function saveTemplatesLocally(templates: AppraisalTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (e) {}
}

/**
 * Save or Update a single Appraisal Template
 */
export async function saveAppraisalTemplate(template: AppraisalTemplate): Promise<{ success: boolean; error?: string }> {
  template.updatedAt = new Date().toISOString()
  if (!template.createdAt) template.createdAt = new Date().toISOString()

  // 1. Update local cache
  try {
    const current = await getAppraisalTemplates()
    const index = current.findIndex(t => t.id === template.id)
    let updated: AppraisalTemplate[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = template
    } else {
      updated = [template, ...current]
    }
    saveTemplatesLocally(updated)
  } catch (e) {}

  // 2. Sync to Supabase
  try {
    const payload = {
      id: template.id,
      name: template.name,
      code: template.code,
      description: template.description,
      framework_type: template.frameworkType,
      target_roles: template.targetRoles,
      target_departments: template.targetDepartments,
      is_default: template.isDefault,
      is_active: template.isActive,
      sections: template.sections,
      cross_references: template.crossReferences,
      updated_at: template.updatedAt,
    }

    const { error } = await supabase
      .from('appraisal_templates')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      console.warn('Supabase template upsert note:', error.message)
    }
  } catch (err: any) {
    console.warn('Remote sync note:', err.message)
  }

  return { success: true }
}

/**
 * Delete an appraisal template
 */
export async function deleteAppraisalTemplate(templateId: string): Promise<{ success: boolean; error?: string }> {
  // 1. Remove from local cache
  try {
    const current = await getAppraisalTemplates()
    const filtered = current.filter(t => t.id !== templateId)
    saveTemplatesLocally(filtered)
  } catch (e) {}

  // 2. Remove from Supabase
  try {
    await supabase.from('appraisal_templates').delete().eq('id', templateId)
  } catch (err) {}

  return { success: true }
}
