import React, { useState, useEffect } from 'react'
import {
  AppraisalTemplate,
  AssessmentSection,
  AssessmentItem,
  CrossReferenceRule,
  ItemScoringType,
  EvaluatorType,
  getAppraisalTemplates,
  saveAppraisalTemplate,
  deleteAppraisalTemplate,
  resetTemplatesToDefault,
  DEFAULT_APPRAISAL_TEMPLATES
} from '../../lib/appraisalManager'
import { supabase } from '../../lib/supabase'

interface Props {
  onNavigate?: (page: any) => void
}

const FRAMEWORK_TYPES = [
  { value: 'annual_360', label: 'Annual 360° & KPI Review', desc: 'Standard holistic review covering competencies, KPIs, and multi-rater feedback' },
  { value: 'probation_confirmation', label: 'Probation & Confirmation', desc: '3M & 6M milestones evaluating learning curve, discipline, and permanent placement' },
  { value: 'cross_department', label: 'Cross-Departmental Collaboration', desc: 'Inter-team feedback evaluating SLA adherence and operational synergy' },
  { value: 'leadership', label: 'Executive & Leadership Framework', desc: 'Assesses strategic vision, team mentorship, and budget governance' },
  { value: 'technical_field', label: 'Technical & Field Performance', desc: 'Focuses on installation quality, safety compliance, and troubleshooting' },
  { value: 'custom', label: 'Custom Assessment Framework', desc: 'Create bespoke criteria and custom scoring models from scratch' },
]

const SCORING_TYPES: { value: ItemScoringType; label: string; desc: string }[] = [
  { value: 'rating_1_5', label: '1 to 5 Likert Scale', desc: 'Standard 5-point performance rating (1=Poor to 5=Excellent)' },
  { value: 'rating_1_10', label: '1 to 10 Scale', desc: 'Granular 10-point evaluation scale' },
  { value: 'weighted_kpi', label: 'Weighted KPI Goal (%)', desc: 'Target vs Actual percentage achievement with custom weight' },
  { value: 'percentage', label: 'Percentage Score (0-100%)', desc: 'Direct percentage score input' },
  { value: 'yes_no', label: 'Yes / No Compliance', desc: 'Binary pass/fail or compliance checklist' },
  { value: 'open_text', label: 'Qualitative Open Response', desc: 'Written commentary, feedback, or justification' },
]

const EVALUATOR_TYPES: { value: EvaluatorType; label: string }[] = [
  { value: 'all', label: 'All Evaluators (360° Multi-Rater)' },
  { value: 'self', label: 'Self Appraisal Only' },
  { value: 'supervisor', label: 'Direct Supervisor / Manager' },
  { value: 'peer_cross_reference', label: 'Peer / Cross-Department Rater' },
  { value: 'hod', label: 'Head of Department / Director' },
]

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  work_performance: 'Work Performance & Results',
  reliability: 'Reliability & Accountability',
  teamwork: 'Teamwork & Collaboration',
  communication: 'Communication & Professionalism',
  customer_focus: 'Customer Focus',
  initiative: 'Initiative, Growth & Work Ethics',
  sales: 'Sales & Marketing / Commercial',
  technical: 'Technical & Field Services / Solar',
  customer_service: 'Customer Support / Customer Service',
  marketing: 'Media & Marketing / Branding',
  finance: 'Accounting & Finance',
  hr: 'Human Resources & Admin',
  it: 'Information Technology / Systems',
  admin: 'General Operations & Admin',
  leadership_strategy: 'Strategic Vision & Leadership',
  people_dev: 'Team Mentorship & Coaching',
  operational_execution: 'Operational Governance & Execution',
  general: 'General Criteria',
}

export function getCategoryDisplayName(key: string): string {
  if (!key || key === 'all') return 'All Categories'
  if (CATEGORY_DISPLAY_NAMES[key]) return CATEGORY_DISPLAY_NAMES[key]
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export default function AppraisalBuilder({ onNavigate }: Props) {
  const [templates, setTemplates] = useState<AppraisalTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<AppraisalTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'builder' | 'cross_ref' | 'preview'>('builder')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [departments, setDepartments] = useState<string[]>([
    'Sales & Marketing',
    'Accounting & Finance',
    'General Operations',
    'Human Resources',
    'Media & Marketing',
    'Customer Support',
    'Technical & Field Services'
  ])

  // Modals
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false)
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [showCrossRefModal, setShowCrossRefModal] = useState(false)
  const [editingSection, setEditingSection] = useState<AssessmentSection | null>(null)
  const [editingItem, setEditingItem] = useState<{ sectionId: string; item: AssessmentItem | null } | null>(null)
  const [editingCrossRef, setEditingCrossRef] = useState<CrossReferenceRule | null>(null)

  // Form States for Template Modal
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: '',
    code: '',
    description: '',
    frameworkType: 'custom' as any,
    targetRoles: ['all'],
    targetDepartments: ['all'],
  })

  // Form States for Edit Template Modal
  const [editTemplateForm, setEditTemplateForm] = useState({
    name: '',
    code: '',
    description: '',
    frameworkType: 'custom' as any,
    targetRoles: ['all'],
    targetDepartments: ['all'],
  })

  // Form States for Section Modal
  const [sectionForm, setSectionForm] = useState({
    title: '',
    description: '',
    weight: 25,
    evaluatorRole: 'all' as EvaluatorType,
  })

  // Form States for Item Modal
  const [itemForm, setItemForm] = useState({
    text: '',
    description: '',
    scoringType: 'rating_1_5' as ItemScoringType,
    weight: 20,
    evaluatorType: 'all' as EvaluatorType,
    categoryKey: 'work_performance',
    targetDepartment: 'all',
  })

  // Form States for Cross Reference Modal
  const [crossRefForm, setCrossRefForm] = useState({
    evaluatorDepartment: 'Sales & Marketing',
    targetDepartment: 'General Operations',
    description: '',
    isMandatory: true,
  })

  // Preview interactive state
  const [previewRole, setPreviewRole] = useState('staff')
  const [previewDept, setPreviewDept] = useState('Sales & Marketing')
  const [previewRatings, setPreviewRatings] = useState<Record<string, number>>({})

  // Item Search and Category Filter
  const [itemSearchText, setItemSearchText] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all')

  // Load Templates & Departments on Mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch departments
      const { data: deptData } = await supabase.from('departments').select('name')
      if (deptData && deptData.length > 0) {
        setDepartments(deptData.map((d: any) => d.name))
      }

      // Fetch templates
      const tmpls = await getAppraisalTemplates()
      setTemplates(tmpls)
      if (tmpls.length > 0) {
        setSelectedTemplate(tmpls[0])
      }
    } catch (err) {
      console.error('Error loading appraisal data:', err)
      setTemplates(DEFAULT_APPRAISAL_TEMPLATES)
      setSelectedTemplate(DEFAULT_APPRAISAL_TEMPLATES[0])
    } finally {
      setLoading(false)
    }
  }

  // Save current template to DB and local cache
  const persistTemplate = async (tmplToSave: AppraisalTemplate) => {
    setSaveStatus('saving')
    try {
      await saveAppraisalTemplate(tmplToSave)
      const updated = templates.map(t => (t.id === tmplToSave.id ? tmplToSave : t))
      if (!templates.find(t => t.id === tmplToSave.id)) {
        updated.unshift(tmplToSave)
      }
      setTemplates(updated)
      setSelectedTemplate(tmplToSave)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (e) {
      setSaveStatus('error')
    }
  }

  // ────────────────────────────────────────────────────────────
  // TEMPLATE MANAGEMENT HANDLERS
  // ────────────────────────────────────────────────────────────

  const handleCreateTemplate = () => {
    if (!newTemplateForm.name.trim()) return

    const newId = `tmpl-${Date.now()}`
    const baseCode = newTemplateForm.code.trim() || newTemplateForm.name.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 12)

    // Base template sections based on type
    let starterSections: AssessmentSection[] = []
    if (newTemplateForm.frameworkType === 'probation_confirmation') {
      starterSections = DEFAULT_APPRAISAL_TEMPLATES[1].sections
    } else if (newTemplateForm.frameworkType === 'leadership') {
      starterSections = DEFAULT_APPRAISAL_TEMPLATES[2].sections
    } else if (newTemplateForm.frameworkType === 'annual_360') {
      starterSections = DEFAULT_APPRAISAL_TEMPLATES[0].sections
    } else {
      // Custom Assessment Framework - starts clean with customizable starter section
      starterSections = [
        {
          id: `sec-${Date.now()}-1`,
          key: 'custom_section_1',
          title: '1. Primary Evaluation Criteria',
          description: 'Key performance indicators and evaluation criteria for this assessment.',
          weight: 100,
          evaluatorRole: 'all',
          items: [
            {
              id: `item-${Date.now()}-1`,
              key: 'criteria_1',
              text: 'Demonstrates consistent mastery and execution of core job responsibilities.',
              scoringType: 'rating_1_5',
              weight: 50,
              evaluatorType: 'all',
              categoryKey: 'general',
              order: 1,
            },
            {
              id: `item-${Date.now()}-2`,
              key: 'criteria_2',
              text: 'Quality, accuracy, and timeliness of delivered deliverables and targets.',
              scoringType: 'rating_1_5',
              weight: 50,
              evaluatorType: 'all',
              categoryKey: 'general',
              order: 2,
            }
          ]
        }
      ]
    }

    const created: AppraisalTemplate = {
      id: newId,
      name: newTemplateForm.name.trim(),
      code: baseCode,
      description: newTemplateForm.description.trim(),
      frameworkType: newTemplateForm.frameworkType,
      targetRoles: newTemplateForm.targetRoles,
      targetDepartments: newTemplateForm.targetDepartments,
      isDefault: false,
      isActive: true,
      sections: JSON.parse(JSON.stringify(starterSections)),
      crossReferences: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setShowNewTemplateModal(false)
    setNewTemplateForm({
      name: '',
      code: '',
      description: '',
      frameworkType: 'custom',
      targetRoles: ['all'],
      targetDepartments: ['all'],
    })

    persistTemplate(created)
  }

  const openEditTemplate = (tmpl: AppraisalTemplate) => {
    setEditTemplateForm({
      name: tmpl.name,
      code: tmpl.code,
      description: tmpl.description || '',
      frameworkType: tmpl.frameworkType || 'custom',
      targetRoles: tmpl.targetRoles || ['all'],
      targetDepartments: tmpl.targetDepartments || ['all'],
    })
    setShowEditTemplateModal(true)
  }

  const handleSaveTemplateDetails = () => {
    if (!selectedTemplate || !editTemplateForm.name.trim()) return

    const updatedTmpl: AppraisalTemplate = {
      ...selectedTemplate,
      name: editTemplateForm.name.trim(),
      code: editTemplateForm.code.trim() || selectedTemplate.code,
      description: editTemplateForm.description.trim(),
      frameworkType: editTemplateForm.frameworkType,
      targetRoles: editTemplateForm.targetRoles,
      targetDepartments: editTemplateForm.targetDepartments,
      updatedAt: new Date().toISOString(),
    }

    setShowEditTemplateModal(false)
    persistTemplate(updatedTmpl)
  }

  const handleDuplicateTemplate = (tmpl: AppraisalTemplate) => {
    const dup: AppraisalTemplate = {
      ...JSON.parse(JSON.stringify(tmpl)),
      id: `tmpl-dup-${Date.now()}`,
      name: `${tmpl.name} (Copy)`,
      code: `${tmpl.code}-COPY`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    persistTemplate(dup)
  }

  const handleDeleteTemplate = async (tmplId: string) => {
    if (templates.length <= 1) {
      alert('You must have at least one appraisal template in the system.')
      return
    }
    if (!confirm('Are you sure you want to delete this Appraisal Template? This cannot be undone.')) return

    await deleteAppraisalTemplate(tmplId)
    const remaining = templates.filter(t => t.id !== tmplId)
    setTemplates(remaining)
    setSelectedTemplate(remaining[0] || null)
  }

  const handleResetToStandards = async () => {
    if (window.confirm('Reset and synchronize all templates with full database standards (46 core 360° statements, department KPIs, supervisor metrics, and qualitative questions)?')) {
      setLoading(true)
      try {
        const refreshed = await resetTemplatesToDefault()
        setTemplates(refreshed)
        if (refreshed.length > 0) {
          setSelectedTemplate(refreshed[0])
        }
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } finally {
        setLoading(false)
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // SECTION HANDLERS (Add, Edit, Delete, Reorder)
  // ────────────────────────────────────────────────────────────

  const openAddSection = () => {
    setEditingSection(null)
    setSectionForm({
      title: '',
      description: '',
      weight: 25,
      evaluatorRole: 'all',
    })
    setShowSectionModal(true)
  }

  const openEditSection = (sec: AssessmentSection) => {
    setEditingSection(sec)
    setSectionForm({
      title: sec.title,
      description: sec.description,
      weight: sec.weight,
      evaluatorRole: sec.evaluatorRole,
    })
    setShowSectionModal(true)
  }

  const handleSaveSection = () => {
    if (!selectedTemplate || !sectionForm.title.trim()) return

    let updatedSections: AssessmentSection[]
    if (editingSection) {
      // Edit
      updatedSections = selectedTemplate.sections.map(s =>
        s.id === editingSection.id
          ? {
              ...s,
              title: sectionForm.title,
              description: sectionForm.description,
              weight: Number(sectionForm.weight),
              evaluatorRole: sectionForm.evaluatorRole,
            }
          : s
      )
    } else {
      // Add
      const newSec: AssessmentSection = {
        id: `sec-${Date.now()}`,
        key: sectionForm.title.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        title: sectionForm.title,
        description: sectionForm.description,
        weight: Number(sectionForm.weight),
        evaluatorRole: sectionForm.evaluatorRole,
        items: [],
      }
      updatedSections = [...selectedTemplate.sections, newSec]
    }

    const updatedTmpl = { ...selectedTemplate, sections: updatedSections }
    setShowSectionModal(false)
    persistTemplate(updatedTmpl)
  }

  const handleDeleteSection = (secId: string) => {
    if (!selectedTemplate) return
    if (!confirm('Are you sure you want to delete this entire assessment section and its items?')) return

    const updatedSections = selectedTemplate.sections.filter(s => s.id !== secId)
    const updatedTmpl = { ...selectedTemplate, sections: updatedSections }
    persistTemplate(updatedTmpl)
  }

  // ────────────────────────────────────────────────────────────
  // ITEM / CRITERIA HANDLERS (Add, Edit, Delete, Reorder)
  // ────────────────────────────────────────────────────────────

  const openAddItem = (secId: string) => {
    const sec = selectedTemplate?.sections.find(s => s.id === secId)
    const defaultCat = sec?.key === 'competencies_360' ? 'work_performance' : (sec?.key === 'department_kpis' ? 'sales' : 'general')
    setEditingItem({ sectionId: secId, item: null })
    setItemForm({
      text: '',
      description: '',
      scoringType: 'rating_1_5',
      weight: 20,
      evaluatorType: 'all',
      categoryKey: defaultCat,
      targetDepartment: 'all',
    })
    setShowItemModal(true)
  }

  const openEditItem = (secId: string, item: AssessmentItem) => {
    setEditingItem({ sectionId: secId, item })
    setItemForm({
      text: item.text,
      description: item.description || '',
      scoringType: item.scoringType,
      weight: item.weight,
      evaluatorType: item.evaluatorType,
      categoryKey: item.categoryKey || 'general',
      targetDepartment: (item.targetDepartments && item.targetDepartments[0]) || 'all',
    })
    setShowItemModal(true)
  }

  const handleSaveItem = () => {
    if (!selectedTemplate || !editingItem || !itemForm.text.trim()) return

    const { sectionId, item } = editingItem
    const updatedSections = selectedTemplate.sections.map(sec => {
      if (sec.id !== sectionId) return sec

      let updatedItems: AssessmentItem[]
      if (item) {
        // Edit existing item
        updatedItems = sec.items.map(it =>
          it.id === item.id
            ? {
                ...it,
                text: itemForm.text,
                description: itemForm.description,
                scoringType: itemForm.scoringType,
                weight: Number(itemForm.weight),
                evaluatorType: itemForm.evaluatorType,
                categoryKey: itemForm.categoryKey,
                targetDepartments: itemForm.targetDepartment === 'all' ? ['all'] : [itemForm.targetDepartment],
              }
            : it
        )
      } else {
        // Add new item
        const newItem: AssessmentItem = {
          id: `item-${Date.now()}`,
          key: `key_${Date.now()}`,
          text: itemForm.text,
          description: itemForm.description,
          scoringType: itemForm.scoringType,
          weight: Number(itemForm.weight),
          evaluatorType: itemForm.evaluatorType,
          categoryKey: itemForm.categoryKey,
          targetDepartments: itemForm.targetDepartment === 'all' ? ['all'] : [itemForm.targetDepartment],
          order: sec.items.length + 1,
        }
        updatedItems = [...sec.items, newItem]
      }
      return { ...sec, items: updatedItems }
    })

    const updatedTmpl = { ...selectedTemplate, sections: updatedSections }
    setShowItemModal(false)
    persistTemplate(updatedTmpl)
  }

  const handleDeleteItem = (secId: string, itemId: string) => {
    if (!selectedTemplate) return
    if (!confirm('Are you sure you want to delete this assessment item?')) return

    const updatedSections = selectedTemplate.sections.map(sec => {
      if (sec.id !== secId) return sec
      return { ...sec, items: sec.items.filter(i => i.id !== itemId) }
    })

    const updatedTmpl = { ...selectedTemplate, sections: updatedSections }
    persistTemplate(updatedTmpl)
  }

  const handleMoveItem = (secId: string, itemIndex: number, direction: 'up' | 'down') => {
    if (!selectedTemplate) return
    const sec = selectedTemplate.sections.find(s => s.id === secId)
    if (!sec) return

    const items = [...sec.items]
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1
    if (targetIndex < 0 || targetIndex >= items.length) return

    const temp = items[itemIndex]
    items[itemIndex] = items[targetIndex]
    items[targetIndex] = temp

    const updatedSections = selectedTemplate.sections.map(s => (s.id === secId ? { ...s, items } : s))
    const updatedTmpl = { ...selectedTemplate, sections: updatedSections }
    persistTemplate(updatedTmpl)
  }

  // ────────────────────────────────────────────────────────────
  // CROSS-REFERENCE MATRIX HANDLERS
  // ────────────────────────────────────────────────────────────

  const handleSaveCrossRef = () => {
    if (!selectedTemplate) return

    let updatedRefs: CrossReferenceRule[]
    if (editingCrossRef) {
      updatedRefs = (selectedTemplate.crossReferences || []).map(r =>
        r.id === editingCrossRef.id
          ? {
              ...r,
              evaluatorDepartment: crossRefForm.evaluatorDepartment,
              targetDepartment: crossRefForm.targetDepartment,
              description: crossRefForm.description,
              isMandatory: crossRefForm.isMandatory,
            }
          : r
      )
    } else {
      const newRef: CrossReferenceRule = {
        id: `cr-${Date.now()}`,
        evaluatorDepartment: crossRefForm.evaluatorDepartment,
        targetDepartment: crossRefForm.targetDepartment,
        description: crossRefForm.description || `Cross-departmental performance review of ${crossRefForm.targetDepartment} by ${crossRefForm.evaluatorDepartment}`,
        isMandatory: crossRefForm.isMandatory,
      }
      updatedRefs = [...(selectedTemplate.crossReferences || []), newRef]
    }

    const updatedTmpl = { ...selectedTemplate, crossReferences: updatedRefs }
    setShowCrossRefModal(false)
    persistTemplate(updatedTmpl)
  }

  const handleDeleteCrossRef = (refId: string) => {
    if (!selectedTemplate) return
    const updatedRefs = (selectedTemplate.crossReferences || []).filter(r => r.id !== refId)
    const updatedTmpl = { ...selectedTemplate, crossReferences: updatedRefs }
    persistTemplate(updatedTmpl)
  }

  // Section weights total calculation
  const totalSectionWeight = selectedTemplate?.sections.reduce((sum, s) => sum + (Number(s.weight) || 0), 0) || 0

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto anim-fade-up">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-purple-600 animate-pulse"></span>
            <h1 className="font-display font-bold text-slate-800 dark:text-white text-xl sm:text-2xl">
              Appraisal & Assessment Frameworks
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
            Create, customize, and configure 360° competencies, role-based KPIs, cross-reference matrices, and evaluation criteria.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Indicator */}
          {saveStatus === 'saving' && (
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span className="animate-spin w-3 h-3 border border-blue-600 border-t-transparent rounded-full"></span>
              Saving changes...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              All changes saved!
            </span>
          )}

          <button
            onClick={handleResetToStandards}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800 text-xs font-semibold shadow-xs transition-colors"
            title="Re-synchronize with complete 46 statements, department KPIs, and supervisor metrics"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
            <span>Sync Standards (46 Items)</span>
          </button>

          <button
            onClick={() => setShowNewTemplateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Create New Appraisal Template</span>
          </button>
        </div>
      </div>

      {/* ── TEMPLATE SELECTOR CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map(tmpl => {
          const isSelected = selectedTemplate?.id === tmpl.id
          const totalItems = tmpl.sections.reduce((acc, s) => acc + s.items.length, 0)
          return (
            <div
              key={tmpl.id}
              onClick={() => setSelectedTemplate(tmpl)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-600/10 dark:bg-blue-900/40 border-blue-500 shadow-md ring-2 ring-blue-500/30'
                  : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isSelected
                        ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {tmpl.code}
                    </span>
                    {tmpl.isDefault && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                        Default
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      isSelected
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-700'
                        : 'bg-slate-100 dark:bg-slate-700/60 text-purple-700 dark:text-purple-300 border border-slate-200/50 dark:border-slate-600/50'
                    }`}>
                      {FRAMEWORK_TYPES.find(f => f.value === tmpl.frameworkType)?.label || tmpl.frameworkType}
                    </span>
                  </div>
                  <h3 className={`font-bold text-sm line-clamp-1 ${
                    isSelected
                      ? 'text-blue-600 dark:text-blue-300'
                      : 'text-slate-800 dark:text-white'
                  }`}>
                    {tmpl.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openEditTemplate(tmpl)}
                    title="Edit Template Details"
                    className={`p-1 rounded-lg ${
                      isSelected
                        ? 'hover:bg-blue-100 dark:hover:bg-blue-800/50 text-slate-600 dark:text-slate-200'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                  <button
                    onClick={() => handleDuplicateTemplate(tmpl)}
                    title="Duplicate Template"
                    className={`p-1 rounded-lg ${
                      isSelected
                        ? 'hover:bg-blue-100 dark:hover:bg-blue-800/50 text-slate-600 dark:text-slate-200'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    title="Delete Template"
                    className={`p-1 rounded-lg ${
                      isSelected
                        ? 'hover:bg-red-100 dark:hover:bg-red-950/60 text-slate-500 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400'
                        : 'hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600 dark:hover:text-red-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              <p className={`text-xs mt-2 line-clamp-2 ${
                isSelected
                  ? 'text-slate-700 dark:text-slate-200'
                  : 'text-slate-500 dark:text-slate-400'
              }`}>
                {tmpl.description || 'No description provided.'}
              </p>

              <div className={`flex items-center justify-between mt-3.5 pt-2.5 border-t text-[11px] ${
                isSelected
                  ? 'border-blue-200/80 dark:border-blue-800/80 text-slate-700 dark:text-slate-300'
                  : 'border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                <span>{tmpl.sections.length} Sections · {totalItems} Criteria</span>
                <span className={`font-bold ${
                  isSelected
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {tmpl.crossReferences?.length || 0} Cross-Refs
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {selectedTemplate && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* ── TEMPLATE ACTION & TAB BAR ── */}
          <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-bold text-slate-800 dark:text-white text-lg">
                  {selectedTemplate.name}
                </h2>
                
                {/* Framework Type Badge with click-to-edit */}
                <button
                  onClick={() => openEditTemplate(selectedTemplate)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-950/80 dark:hover:bg-purple-900/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors shadow-2xs cursor-pointer group"
                  title="Click to edit or change assessment framework type"
                >
                  <span>{FRAMEWORK_TYPES.find(f => f.value === selectedTemplate.frameworkType)?.label || selectedTemplate.frameworkType}</span>
                  <svg className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>

                <button
                  onClick={() => openEditTemplate(selectedTemplate)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
                  title="Edit questionnaire template name, code, framework type, and target audience"
                >
                  <svg className="w-3 h-3 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  <span>Edit Details</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedTemplate.description && <span className="text-slate-600 dark:text-slate-300 font-medium mr-1.5">{selectedTemplate.description} ·</span>}
                Target Roles: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedTemplate.targetRoles.join(', ')}</span> · Target Departments: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedTemplate.targetDepartments.join(', ')}</span>
              </p>
            </div>

            {/* Sub Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('builder')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'builder'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                Sections & Items ({selectedTemplate.sections.length})
              </button>
              <button
                onClick={() => setActiveTab('cross_ref')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'cross_ref'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                Cross-Reference Matrix ({selectedTemplate.crossReferences?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'preview'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                Live Assessment Preview
              </button>
            </div>
          </div>

          {/* ── WEIGHT ALLOCATION STATUS BAR ── */}
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Section Weight Allocation:</span>
              <div className="flex items-center gap-1">
                {selectedTemplate.sections.map((sec, idx) => (
                  <span
                    key={sec.id}
                    className="px-2 py-0.5 rounded-md font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    title={`${sec.title}: ${sec.weight}%`}
                  >
                    S{idx + 1}: {sec.weight}%
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500">Total Weight:</span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded-md ${
                totalSectionWeight === 100
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
              }`}>
                {totalSectionWeight}% {totalSectionWeight === 100 ? '✓ Balanced' : '(Must sum to 100%)'}
              </span>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 1: SECTIONS & ASSESSMENT ITEMS BUILDER */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeTab === 'builder' && (
            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base">
                    Evaluation Sections & Criteria
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add, edit, or reorder assessment statements, KPIs, and qualitative questions.
                  </p>
                </div>
                <button
                  onClick={openAddSection}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add New Section</span>
                </button>
              </div>

              {/* Global Search and Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className="flex items-center gap-2 flex-1">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    value={itemSearchText}
                    onChange={e => setItemSearchText(e.target.value)}
                    placeholder="Search across all assessment statements, KPIs, or questions..."
                    className="bg-transparent text-xs w-full text-slate-800 dark:text-white focus:outline-none"
                  />
                  {itemSearchText && (
                    <button onClick={() => setItemSearchText('')} className="text-slate-400 hover:text-slate-600 text-xs">
                      Clear
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedTemplate.sections.reduce((acc, s) => acc + s.items.length, 0)} Total Assessment Items
                </div>
              </div>

              {/* Sections List */}
              <div className="space-y-5">
                {selectedTemplate.sections.map((sec, secIdx) => {
                  const categoriesInSection = ['all', ...Array.from(new Set(sec.items.map(i => i.categoryKey).filter(Boolean)))]
                  const filteredItems = sec.items.filter(item => {
                    const matchesCat = selectedCategoryFilter === 'all' || item.categoryKey === selectedCategoryFilter
                    const matchesSearch = !itemSearchText || item.text.toLowerCase().includes(itemSearchText.toLowerCase()) || (item.description || '').toLowerCase().includes(itemSearchText.toLowerCase())
                    return matchesCat && matchesSearch
                  })

                  return (
                    <div
                      key={sec.id}
                      className="bg-slate-50/70 dark:bg-slate-900/40 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-4 sm:p-5 space-y-4"
                    >
                      {/* Section Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                              {secIdx + 1}
                            </span>
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base">
                              {sec.title}
                            </h4>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              Weight: {sec.weight}%
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              Evaluator: {EVALUATOR_TYPES.find(e => e.value === sec.evaluatorRole)?.label || sec.evaluatorRole}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] text-slate-500 font-medium">
                              ({sec.items.length} items)
                            </span>
                          </div>
                          {sec.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 pl-8">
                              {sec.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => openAddItem(sec.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>Add Item</span>
                          </button>
                          <button
                            onClick={() => openEditSection(sec)}
                            title="Edit Section"
                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteSection(sec.id)}
                            title="Delete Section"
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>

                      {/* Category Filter Chips if multiple categories */}
                      {categoriesInSection.length > 2 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[11px] font-semibold text-slate-400">Filter category:</span>
                          {categoriesInSection.map(cat => (
                            <button
                              key={cat}
                              onClick={() => setSelectedCategoryFilter(cat)}
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                selectedCategoryFilter === cat
                                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {getCategoryDisplayName(cat)}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Section Items List */}
                      {sec.items.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                          No assessment items in this section yet. Click <span className="font-semibold text-blue-600">"+ Add Item"</span> to create questions.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredItems.map((item, itIdx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 hover:border-slate-300 transition-all text-xs"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="font-mono text-slate-400 text-[11px] w-5 text-right font-bold">
                                {itIdx + 1}.
                              </span>
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                                  {item.text}
                                </p>
                                {item.description && (
                                  <p className="text-[11px] text-slate-400 line-clamp-1">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px]">
                                {item.weight}% Wt
                              </span>
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px]">
                                {SCORING_TYPES.find(s => s.value === item.scoringType)?.label || item.scoringType}
                              </span>
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[10px]">
                                {EVALUATOR_TYPES.find(e => e.value === item.evaluatorType)?.label || item.evaluatorType}
                              </span>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-1 pl-2 border-l border-slate-100 dark:border-slate-700">
                                <button
                                  onClick={() => handleMoveItem(sec.id, itIdx, 'up')}
                                  disabled={itIdx === 0}
                                  title="Move Up"
                                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-20"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                                </button>
                                <button
                                  onClick={() => handleMoveItem(sec.id, itIdx, 'down')}
                                  disabled={itIdx === sec.items.length - 1}
                                  title="Move Down"
                                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-20"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                                <button
                                  onClick={() => openEditItem(sec.id, item)}
                                  title="Edit Item"
                                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(sec.id, item.id)}
                                  title="Delete Item"
                                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 2: CROSS-REFERENCE & MULTI-RATER MATRIX */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeTab === 'cross_ref' && (
            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base">
                    Cross-Departmental Evaluation Matrix
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Define peer evaluation pairings between collaborating departments to measure inter-functional support.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingCrossRef(null)
                    setCrossRefForm({
                      evaluatorDepartment: departments[0] || 'Sales & Marketing',
                      targetDepartment: departments[1] || 'General Operations',
                      description: '',
                      isMandatory: true,
                    })
                    setShowCrossRefModal(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add Cross-Reference Rule</span>
                </button>
              </div>

              {(!selectedTemplate.crossReferences || selectedTemplate.crossReferences.length === 0) ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
                  No cross-reference assessment rules configured. Click <span className="font-semibold text-blue-600">"+ Add Cross-Reference Rule"</span> to pair departments.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedTemplate.crossReferences.map(rule => (
                    <div
                      key={rule.id}
                      className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            {rule.evaluatorDepartment}
                          </span>
                          <span>➔ Evaluates ➔</span>
                          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                            {rule.targetDepartment}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteCrossRef(rule.id)}
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {rule.description || 'Inter-departmental performance review.'}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span>Status: {rule.isMandatory ? 'Required Rater' : 'Optional Rater'}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">Active Matrix Pair</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 3: LIVE ASSESSMENT PREVIEW & SANDBOX */}
          {/* ══════════════════════════════════════════════════════ */}
          {activeTab === 'preview' && (
            <div className="p-5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-blue-50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200/80 dark:border-blue-900/50">
                <div>
                  <h3 className="font-bold text-blue-900 dark:text-blue-200 text-sm sm:text-base">
                    Interactive Live Appraisal Sandbox
                  </h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                    Test how staff members, supervisors, and cross-department peers experience this evaluation form in real-time.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={previewRole}
                    onChange={e => setPreviewRole(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-none"
                  >
                    <option value="staff">Staff Self-Review Mode</option>
                    <option value="supervisor">Direct Supervisor Review</option>
                    <option value="peer_cross_reference">Peer Cross-Department Review</option>
                    <option value="hod">HOD / Executive Review</option>
                  </select>

                  <select
                    value={previewDept}
                    onChange={e => setPreviewDept(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-none"
                  >
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Simulated Form Rendering */}
              <div className="space-y-6">
                {selectedTemplate.sections.map((sec, sIdx) => (
                  <div key={sec.id} className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 dark:text-white text-sm">
                        Section {sIdx + 1}: {sec.title} ({sec.weight}% Weight)
                      </h4>
                      <span className="text-xs text-slate-500">
                        {sec.items.length} Questions
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {sec.items.map((it, iIdx) => (
                        <div key={it.id} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
                          <div className="flex items-start justify-between gap-3 text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {iIdx + 1}. {it.text}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{it.weight}% wt</span>
                          </div>

                          {/* Scoring Control Simulation */}
                          {it.scoringType === 'rating_1_5' && (
                            <div className="flex items-center gap-2 pt-1">
                              {[1, 2, 3, 4, 5].map(val => (
                                <button
                                  key={val}
                                  onClick={() => setPreviewRatings({ ...previewRatings, [it.id]: val })}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                    previewRatings[it.id] === val
                                      ? 'bg-blue-600 text-white shadow-xs'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                                  }`}
                                >
                                  {val}
                                </button>
                              ))}
                              <span className="text-[11px] text-slate-400 pl-2">
                                {previewRatings[it.id] === 5 ? '5 — Excellent' : previewRatings[it.id] === 4 ? '4 — Very Good' : previewRatings[it.id] === 3 ? '3 — Good' : previewRatings[it.id] === 2 ? '2 — Needs Improvement' : previewRatings[it.id] === 1 ? '1 — Poor' : 'Click to rate'}
                              </span>
                            </div>
                          )}

                          {it.scoringType === 'weighted_kpi' && (
                            <div className="flex items-center gap-3 pt-1">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={previewRatings[it.id] || 85}
                                onChange={e => setPreviewRatings({ ...previewRatings, [it.id]: Number(e.target.value) })}
                                className="w-48 accent-blue-600"
                              />
                              <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                                {previewRatings[it.id] || 85}% Target Achieved
                              </span>
                            </div>
                          )}

                          {it.scoringType === 'open_text' && (
                            <textarea
                              rows={2}
                              placeholder="Type written qualitative justification or employee achievements..."
                              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL 1: CREATE NEW TEMPLATE */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                  Create New Appraisal Framework
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Build a custom evaluation framework or choose an institutional preset.
                </p>
              </div>
              <button onClick={() => setShowNewTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Framework / Appraisal Name *</label>
                <input
                  type="text"
                  value={newTemplateForm.name}
                  onChange={e => setNewTemplateForm({ ...newTemplateForm, name: e.target.value })}
                  placeholder="e.g. Sales Executive Confirmation Appraisal"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Framework Code *</label>
                  <input
                    type="text"
                    value={newTemplateForm.code}
                    onChange={e => setNewTemplateForm({ ...newTemplateForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SE-CA-01"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assessment Framework Type *</label>
                  <select
                    value={newTemplateForm.frameworkType}
                    onChange={e => setNewTemplateForm({ ...newTemplateForm, frameworkType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {FRAMEWORK_TYPES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50 space-y-1">
                <div className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  Selected Framework Tag:
                </div>
                <p className="text-purple-700 dark:text-purple-300 leading-relaxed">
                  {FRAMEWORK_TYPES.find(f => f.value === newTemplateForm.frameworkType)?.desc}
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Description & Objective</label>
                <textarea
                  rows={2}
                  value={newTemplateForm.description}
                  onChange={e => setNewTemplateForm({ ...newTemplateForm, description: e.target.value })}
                  placeholder="Describe the purpose, target audience, review policy..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowNewTemplateModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateForm.name.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL 1B: EDIT TEMPLATE DETAILS */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showEditTemplateModal && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                  Edit Appraisal Framework Details
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update questionnaire title, code, assessment framework type tag, and target audience.
                </p>
              </div>
              <button onClick={() => setShowEditTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Framework / Appraisal Name *</label>
                <input
                  type="text"
                  value={editTemplateForm.name}
                  onChange={e => setEditTemplateForm({ ...editTemplateForm, name: e.target.value })}
                  placeholder="e.g. Sales Executive Confirmation Appraisal"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Framework Code *</label>
                  <input
                    type="text"
                    value={editTemplateForm.code}
                    onChange={e => setEditTemplateForm({ ...editTemplateForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SE-CA-01"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assessment Framework Type Tag *</label>
                  <select
                    value={editTemplateForm.frameworkType}
                    onChange={e => setEditTemplateForm({ ...editTemplateForm, frameworkType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {FRAMEWORK_TYPES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50 space-y-1">
                <div className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  Framework Classification:
                </div>
                <p className="text-purple-700 dark:text-purple-300 leading-relaxed">
                  {FRAMEWORK_TYPES.find(f => f.value === editTemplateForm.frameworkType)?.desc}
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Description & Objective</label>
                <textarea
                  rows={2}
                  value={editTemplateForm.description}
                  onChange={e => setEditTemplateForm({ ...editTemplateForm, description: e.target.value })}
                  placeholder="Describe the purpose, target audience, review policy..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowEditTemplateModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplateDetails}
                disabled={!editTemplateForm.name.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL 2: ADD / EDIT SECTION */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white text-base">
                {editingSection ? 'Edit Evaluation Section' : 'Add Evaluation Section'}
              </h3>
              <button onClick={() => setShowSectionModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section Title *</label>
                <input
                  type="text"
                  value={sectionForm.title}
                  onChange={e => setSectionForm({ ...sectionForm, title: e.target.value })}
                  placeholder="e.g. Core Competencies & Values"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section Weight (%) *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={sectionForm.weight}
                    onChange={e => setSectionForm({ ...sectionForm, weight: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Evaluator Role</label>
                  <select
                    value={sectionForm.evaluatorRole}
                    onChange={e => setSectionForm({ ...sectionForm, evaluatorRole: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                  >
                    {EVALUATOR_TYPES.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Description / Instructions</label>
                <textarea
                  rows={2}
                  value={sectionForm.description}
                  onChange={e => setSectionForm({ ...sectionForm, description: e.target.value })}
                  placeholder="Instructions for raters filling this section..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowSectionModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSection}
                disabled={!sectionForm.title.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Save Section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL 3: ADD / EDIT ASSESSMENT ITEM */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white text-base">
                {editingItem?.item ? 'Edit Assessment Item' : 'Add New Assessment Item'}
              </h3>
              <button onClick={() => setShowItemModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Statement / Question / KPI Title *</label>
                <textarea
                  rows={2}
                  value={itemForm.text}
                  onChange={e => setItemForm({ ...itemForm, text: e.target.value })}
                  placeholder="e.g. Consistently meets agreed quarterly sales and revenue targets."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Scoring Scale Model *</label>
                  <select
                    value={itemForm.scoringType}
                    onChange={e => setItemForm({ ...itemForm, scoringType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                  >
                    {SCORING_TYPES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Item Weight (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={itemForm.weight}
                    onChange={e => setItemForm({ ...itemForm, weight: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Evaluator Scope</label>
                  <select
                    value={itemForm.evaluatorType}
                    onChange={e => setItemForm({ ...itemForm, evaluatorType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                  >
                    {EVALUATOR_TYPES.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Target Department (System Setting)</label>
                  <select
                    value={itemForm.targetDepartment}
                    onChange={e => setItemForm({ ...itemForm, targetDepartment: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                  >
                    <option value="all">All Departments (360° Universal)</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assessment Category *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={itemForm.categoryKey}
                    onChange={e => setItemForm({ ...itemForm, categoryKey: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none text-xs"
                  >
                    <optgroup label="360° Assessment Categories">
                      <option value="work_performance">Work Performance & Results</option>
                      <option value="reliability">Reliability & Accountability</option>
                      <option value="teamwork">Teamwork & Collaboration</option>
                      <option value="communication">Communication & Professionalism</option>
                      <option value="customer_focus">Customer Focus</option>
                      <option value="initiative">Initiative, Growth & Work Ethics</option>
                    </optgroup>
                    <optgroup label="Department / Role Categories">
                      {departments.map(d => (
                        <option key={d} value={d.toLowerCase().replace(/\s+/g, '_')}>{d}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Other Categories">
                      <option value="leadership_strategy">Strategic Vision & Leadership</option>
                      <option value="people_dev">Team Mentorship & Coaching</option>
                      <option value="operational_execution">Operational Governance</option>
                      <option value="general">General Criteria</option>
                    </optgroup>
                  </select>
                  <input
                    type="text"
                    value={itemForm.categoryKey}
                    onChange={e => setItemForm({ ...itemForm, categoryKey: e.target.value })}
                    placeholder="Or type custom category..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Rubric / Guidance for Evaluator (Optional)</label>
                <input
                  type="text"
                  value={itemForm.description}
                  onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="e.g. Rate based on CRM documented pipeline close rate."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowItemModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                disabled={!itemForm.text.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Save Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL 4: ADD / EDIT CROSS-REFERENCE RULE */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showCrossRefModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 anim-fade-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white text-base">
                Cross-Department Assessment Rule
              </h3>
              <button onClick={() => setShowCrossRefModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Evaluating Department *</label>
                <select
                  value={crossRefForm.evaluatorDepartment}
                  onChange={e => setCrossRefForm({ ...crossRefForm, evaluatorDepartment: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                >
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Target Department Being Evaluated *</label>
                <select
                  value={crossRefForm.targetDepartment}
                  onChange={e => setCrossRefForm({ ...crossRefForm, targetDepartment: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                >
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Rule Focus & Description</label>
                <textarea
                  rows={2}
                  value={crossRefForm.description}
                  onChange={e => setCrossRefForm({ ...crossRefForm, description: e.target.value })}
                  placeholder="e.g. Sales evaluates Operations on order turnaround speed."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkMandatory"
                  checked={crossRefForm.isMandatory}
                  onChange={e => setCrossRefForm({ ...crossRefForm, isMandatory: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="chkMandatory" className="text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                  Mandatory Peer Assessment before Cycle Close
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowCrossRefModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrossRef}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
