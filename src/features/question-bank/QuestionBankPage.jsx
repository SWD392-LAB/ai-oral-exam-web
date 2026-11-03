import { useEffect, useMemo, useState } from 'react'
import {
  courseMaterialsApi,
  examConfigApi,
  questionBankApi,
  questionGenerationApi,
  rubricApi,
} from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import './QuestionBank.css'

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze']
const STATUS_OPTIONS = ['All', 'Draft', 'Approved', 'Rejected']
const ORIGIN_OPTIONS = ['All', 'Manual', 'Ai']

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return isoStr
  }
}

export default function QuestionBankPage() {
  const { data: courses, loading: coursesLoading } = useLoad(() => examConfigApi.myCourses(), [])
  const [selectedCourseId, setSelectedCourseId] = useState('')

  // Tab navigation: 'questions' | 'materials'
  const [activeTab, setActiveTab] = useState('questions')

  // Auto-select first course when courses are loaded
  useEffect(() => {
    if (courses && courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id)
    }
  }, [courses, selectedCourseId])

  // Question list state
  const [questions, setQuestions] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Course Materials state
  const [materials, setMaterials] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  const [ingestingMaterialId, setIngestingMaterialId] = useState(null)

  // Filters for questions
  const [statusFilter, setStatusFilter] = useState('All')
  const [originFilter, setOriginFilter] = useState('All')
  const [bloomFilter, setBloomFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Toast feedback state
  const [toast, setToast] = useState(null) // { type: 'success' | 'error', message: string }
  const showToast = (message, type = 'success') => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [reviseModalOpen, setReviseModalOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [activeItem, setActiveItem] = useState(null) // Question being revised

  // Manual Form states
  const [topicInput, setTopicInput] = useState('')
  const [bloomInput, setBloomInput] = useState('Understand')
  const [contentInput, setContentInput] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // AI Generator Form states
  const [aiTopic, setAiTopic] = useState('')
  const [aiBloom, setAiBloom] = useState('Understand')
  const [aiCount, setAiCount] = useState(3)
  const [aiSelectedMaterialIds, setAiSelectedMaterialIds] = useState([])
  const [aiSourceExcerpts, setAiSourceExcerpts] = useState('')
  const [aiPlatformRubric, setAiPlatformRubric] = useState(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState(null)

  // Load questions when selectedCourseId changes
  const fetchQuestions = async (courseId) => {
    if (!courseId) return
    setLoadingQuestions(true)
    setErrorMsg(null)
    try {
      const data = await questionBankApi.list(courseId)
      setQuestions(Array.isArray(data) ? data : [])
    } catch (err) {
      setErrorMsg(err.message || 'Không thể tải danh sách câu hỏi.')
      setQuestions([])
    } finally {
      setLoadingQuestions(false)
    }
  }

  // Load materials when selectedCourseId changes
  const fetchMaterials = async (courseId) => {
    if (!courseId) return
    setLoadingMaterials(true)
    try {
      const data = await courseMaterialsApi.list(courseId)
      setMaterials(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('Cannot load course materials:', err)
      setMaterials([])
    } finally {
      setLoadingMaterials(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      fetchQuestions(selectedCourseId)
      fetchMaterials(selectedCourseId)
    }
  }, [selectedCourseId])

  // Open Create Manual Modal
  const handleOpenCreate = () => {
    setTopicInput('')
    setBloomInput('Understand')
    setContentInput('')
    setFormError(null)
    setCreateModalOpen(true)
  }

  // Open Revise Modal
  const handleOpenRevise = (item) => {
    setActiveItem(item)
    setTopicInput(item.topic || '')
    setBloomInput(item.bloom || 'Understand')
    setContentInput(item.content || '')
    setFormError(null)
    setReviseModalOpen(true)
  }

  // Open AI Generator Modal
  const handleOpenAiModal = async () => {
    setAiTopic('')
    setAiBloom('Understand')
    setAiCount(3)
    setAiSourceExcerpts('')
    setAiError(null)
    // Pre-select all ready materials by default
    const readyMatIds = materials.filter((m) => m.status === 'Ready').map((m) => m.id)
    setAiSelectedMaterialIds(readyMatIds)

    // Load active platform rubric
    try {
      const rubric = await rubricApi.getPlatformRubric()
      setAiPlatformRubric(rubric)
    } catch (err) {
      console.warn('Cannot fetch platform rubric:', err)
    }

    setAiModalOpen(true)
  }

  // Handle Save New Question (Draft)
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!topicInput.trim() || !contentInput.trim()) {
      setFormError('Vui lòng điền đầy đủ Chủ đề (Topic) và Nội dung câu hỏi.')
      return
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      const created = await questionBankApi.create(selectedCourseId, {
        topic: topicInput.trim(),
        bloom: bloomInput,
        content: contentInput.trim(),
      })
      // Prepend to questions list
      setQuestions((prev) => [created, ...prev])
      setCreateModalOpen(false)
      showToast('Đã tạo câu hỏi nháp thành công!')
    } catch (err) {
      if (err.status === 409 || err.code === 'question_bank_duplicate') {
        setFormError('Nội dung câu hỏi này đã tồn tại trong môn học.')
      } else {
        setFormError(err.message || 'Không thể tạo câu hỏi nháp.')
      }
    } finally {
      setFormSubmitting(false)
    }
  }

  // Handle Save Revised Question
  const handleReviseSubmit = async (e) => {
    e.preventDefault()
    if (!activeItem) return
    if (!topicInput.trim() || !contentInput.trim()) {
      setFormError('Vui lòng điền đầy đủ Chủ đề (Topic) và Nội dung câu hỏi.')
      return
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      const updated = await questionBankApi.updateDraft(selectedCourseId, activeItem.id, {
        topic: topicInput.trim(),
        bloom: bloomInput,
        content: contentInput.trim(),
      })
      // Update in local state
      setQuestions((prev) => prev.map((q) => (q.id === activeItem.id ? updated : q)))
      setReviseModalOpen(false)
      setActiveItem(null)
      showToast('Đã cập nhật câu hỏi thành công!')
    } catch (err) {
      setFormError(err.message || 'Không thể cập nhật câu hỏi.')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Handle Approve
  const handleApprove = async (item) => {
    try {
      await questionBankApi.approve(selectedCourseId, item.id)
      setQuestions((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'Approved' } : q)))
      showToast('Đã duyệt câu hỏi vào ngân hàng!')
    } catch (err) {
      showToast(err.message || 'Không thể duyệt câu hỏi.', 'error')
    }
  }

  // Handle Reject
  const handleReject = async (item) => {
    try {
      await questionBankApi.reject(selectedCourseId, item.id)
      setQuestions((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'Rejected' } : q)))
      showToast('Đã từ chối câu hỏi.', 'error')
    } catch (err) {
      showToast(err.message || 'Không thể từ chối câu hỏi.', 'error')
    }
  }

  // Handle Material Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 26 * 1024 * 1024) {
      showToast('Kích thước file không được vượt quá 25MB.', 'error')
      e.target.value = ''
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setUploadingMaterial(true)
    try {
      const uploaded = await courseMaterialsApi.upload(selectedCourseId, formData)
      setMaterials((prev) => [uploaded, ...prev])
      showToast(`Đã tải lên tài liệu: ${file.name}`)
      // Tự động ingest nếu tài liệu vừa tạo là Pending
      if (uploaded.status === 'Pending') {
        handleIngestMaterial(uploaded.id)
      }
    } catch (err) {
      showToast(err.message || 'Tải lên tài liệu thất bại.', 'error')
    } finally {
      setUploadingMaterial(false)
      e.target.value = ''
    }
  }

  // Handle Ingest Material
  const handleIngestMaterial = async (materialId) => {
    setIngestingMaterialId(materialId)
    try {
      const result = await courseMaterialsApi.ingest(selectedCourseId, materialId)
      setMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, status: result.status || 'Ready' } : m)))
      showToast('Xử lý và ingest tài liệu thành công!')
    } catch (err) {
      showToast(err.message || 'Không thể ingest tài liệu.', 'error')
    } finally {
      setIngestingMaterialId(null)
    }
  }

  // Handle AI Generate Questions Submit
  const handleAiGenerateSubmit = async (e) => {
    e.preventDefault()
    if (!aiTopic.trim()) {
      setAiError('Vui lòng nhập chủ đề câu hỏi (Topic).')
      return
    }

    if (aiSelectedMaterialIds.length === 0 && !aiSourceExcerpts.trim()) {
      setAiError('Vui lòng chọn ít nhất 1 tài liệu giáo trình hoặc nhập đoạn trích dẫn nguồn.')
      return
    }

    const payload = {
      topic: aiTopic.trim(),
      bloom: aiBloom,
      count: Number(aiCount) || 3,
      platformRubricVersionId: aiPlatformRubric?.id || aiPlatformRubric?.platformRubricVersionId || '44444444-0000-0000-0000-000000000001',
      sourceMaterialIds: aiSelectedMaterialIds,
      sourceExcerpts: aiSourceExcerpts.trim() ? [aiSourceExcerpts.trim()] : [],
    }

    setAiGenerating(true)
    setAiError(null)

    try {
      const res = await questionGenerationApi.generate(selectedCourseId, payload)
      const count = res?.drafts?.length ?? 0
      showToast(`AI đã sinh thành công ${count} câu hỏi nháp!`)
      setAiModalOpen(false)
      // Làm mới danh sách câu hỏi và chuyển về tab câu hỏi
      await fetchQuestions(selectedCourseId)
      setActiveTab('questions')
    } catch (err) {
      if (err.status === 409 || err.code === 'insufficient_source') {
        setAiError('Tài liệu nguồn chưa đủ dữ liệu trích dẫn để sinh câu hỏi. Hãy ingest lại tài liệu hoặc thêm trích đoạn.')
      } else {
        setAiError(err.message || 'Sinh câu hỏi thất bại. Vui lòng thử lại.')
      }
    } finally {
      setAiGenerating(false)
    }
  }

  // Filter questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (statusFilter !== 'All' && q.status !== statusFilter) return false
      if (originFilter !== 'All' && q.origin !== originFilter) return false
      if (bloomFilter !== 'All' && q.bloom !== bloomFilter) return false
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchTopic = (q.topic || '').toLowerCase().includes(query)
        const matchContent = (q.content || '').toLowerCase().includes(query)
        if (!matchTopic && !matchContent) return false
      }
      return true
    })
  }, [questions, statusFilter, originFilter, bloomFilter, searchQuery])

  const selectedCourse = (courses || []).find((c) => c.id === selectedCourseId)
  const readyMaterialsCount = materials.filter((m) => m.status === 'Ready').length

  return (
    <div className="pg-questionbank">
      <StaffTopBar current="questionBank" />

      <main className="qb-container">
        {/* Header */}
        <div className="qb-header">
          <div>
            <h1 className="qb-title">Question Bank & Syllabus</h1>
            <p className="qb-subtitle">
              Quản lý tài liệu giáo trình và duyệt ngân hàng câu hỏi phỏng vấn chuẩn hóa bằng AI
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Generate with AI Button */}
            <button
              type="button"
              className="qb-btn-ai-gen"
              onClick={handleOpenAiModal}
              disabled={!selectedCourseId}
              title="Sử dụng AI để phân tích giáo trình và sinh câu hỏi tự động"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Generate with AI
            </button>

            {/* Manual New Question Button */}
            <button
              type="button"
              className="qb-btn-primary"
              onClick={handleOpenCreate}
              disabled={!selectedCourseId}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Question
            </button>
          </div>
        </div>

        {/* Course Selector & Tabs */}
        <section className="qb-toolbar" aria-label="Bộ lọc ngân hàng câu hỏi">
          <div className="qb-toolbar-row" style={{ justifyContent: 'space-between' }}>
            {/* Course Selector */}
            <div className="qb-course-box">
              <label htmlFor="course-select">Course:</label>
              <div className="qb-select-wrap">
                <select
                  id="course-select"
                  className="qb-select"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  disabled={coursesLoading || !courses?.length}
                >
                  {(courses || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
                <svg className="qb-select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="qb-tabs">
              <button
                type="button"
                className={`qb-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
                onClick={() => setActiveTab('questions')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Questions ({questions.length})
              </button>
              <button
                type="button"
                className={`qb-tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
                onClick={() => setActiveTab('materials')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Course Materials ({materials.length})
              </button>
            </div>
          </div>

          {/* Sub Toolbar: Only for Questions tab */}
          {activeTab === 'questions' && (
            <>
              <div className="qb-toolbar-row">
                {/* Search Box */}
                <div className="qb-search-wrap">
                  <svg className="qb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="qb-search-input"
                    placeholder="Tìm kiếm theo chủ đề hoặc nội dung câu hỏi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="qb-toolbar-row" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* Status Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13.5px', color: 'var(--ink-2)', fontWeight: '500' }}>Status:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {STATUS_OPTIONS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={`qb-filter-pill ${statusFilter === st ? 'active' : ''}`}
                          onClick={() => setStatusFilter(st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Origin Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13.5px', color: 'var(--ink-2)', fontWeight: '500' }}>Origin:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {ORIGIN_OPTIONS.map((og) => (
                        <button
                          key={og}
                          type="button"
                          className={`qb-filter-pill ${originFilter === og ? 'active' : ''}`}
                          onClick={() => setOriginFilter(og)}
                        >
                          {og === 'Ai' ? 'AI Generated' : og}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bloom Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13.5px', color: 'var(--ink-2)', fontWeight: '500' }}>Bloom:</span>
                    <div className="qb-select-wrap" style={{ width: '140px' }}>
                      <select
                        className="qb-select"
                        style={{ height: '34px', fontSize: '13px' }}
                        value={bloomFilter}
                        onChange={(e) => setBloomFilter(e.target.value)}
                      >
                        <option value="All">All Levels</option>
                        {BLOOM_LEVELS.map((bl) => (
                          <option key={bl} value={bl}>
                            {bl}
                          </option>
                        ))}
                      </select>
                      <svg className="qb-select-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Clear filters shortcut */}
                {(statusFilter !== 'All' || originFilter !== 'All' || bloomFilter !== 'All' || searchQuery) && (
                  <button
                    type="button"
                    className="a-link"
                    onClick={() => {
                      setStatusFilter('All')
                      setOriginFilter('All')
                      setBloomFilter('All')
                      setSearchQuery('')
                    }}
                    style={{ fontSize: '13px', color: 'var(--ink-3)', cursor: 'pointer', background: 'none', border: 'none' }}
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {/* TAB 1: QUESTIONS LIST */}
        {activeTab === 'questions' && (
          <section className="qb-table-wrap" aria-label="Danh sách câu hỏi">
            <div className="qb-table-header">
              <span className="qb-count-label">
                {filteredQuestions.length} câu hỏi hiển thị
                {selectedCourse ? ` · Môn ${selectedCourse.code}` : ''}
              </span>
            </div>

            {loadingQuestions ? (
              <div className="qb-empty">
                <span style={{ fontSize: '15px', color: 'var(--ink-2)' }}>Đang tải danh sách câu hỏi…</span>
              </div>
            ) : errorMsg ? (
              <div className="qb-empty">
                <p className="qb-empty-title" style={{ color: 'var(--red-ink)' }}>Lỗi nạp dữ liệu</p>
                <p className="qb-empty-desc">{errorMsg}</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="qb-empty">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                {questions.length === 0 ? (
                  <>
                    <p className="qb-empty-title">Ngân hàng câu hỏi chưa có dữ liệu</p>
                    <p className="qb-empty-desc">
                      Môn học này hiện chưa có câu hỏi nào. Bạn có thể tự tạo câu hỏi thủ công hoặc dùng AI trích xuất từ giáo trình.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        className="qb-btn-ai-gen"
                        onClick={handleOpenAiModal}
                      >
                        Generate with AI
                      </button>
                      <button
                        type="button"
                        className="qb-btn-primary"
                        onClick={handleOpenCreate}
                      >
                        + Tạo câu hỏi thủ công
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="qb-empty-title">Không tìm thấy câu hỏi phù hợp</p>
                    <p className="qb-empty-desc">
                      Không có câu hỏi nào khớp với các bộ lọc hiện tại. Hãy thử thay đổi từ khóa hoặc bộ lọc trạng thái.
                    </p>
                    <button
                      type="button"
                      className="a-btn a-btn-secondary"
                      onClick={() => {
                        setStatusFilter('All')
                        setOriginFilter('All')
                        setBloomFilter('All')
                        setSearchQuery('')
                      }}
                      style={{
                        height: '38px',
                        padding: '0 16px',
                        borderRadius: '10px',
                        border: '1px solid var(--line-strong)',
                        fontSize: '14px',
                      }}
                    >
                      Xóa tất cả bộ lọc
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="qb-list">
                {filteredQuestions.map((q) => {
                  const isDraft = q.status === 'Draft'
                  const isApproved = q.status === 'Approved'
                  const isRejected = q.status === 'Rejected'
                  const isAi = q.origin === 'Ai'
                  const revCount = q.revisions?.length || 1

                  return (
                    <div key={q.id} className="qb-row">
                      {/* Meta: Bloom & Origin & Topic */}
                      <div className="qb-meta-col">
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="qb-badge qb-badge-bloom">{q.bloom}</span>
                          {isAi ? (
                            <span className="qb-badge qb-badge-ai" title="Câu hỏi do AI sinh từ giáo trình">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                              </svg>
                              AI
                            </span>
                          ) : (
                            <span className="qb-badge qb-badge-origin">{q.origin || 'Manual'}</span>
                          )}
                        </div>
                        <span className="qb-topic-text">{q.topic}</span>
                      </div>

                      {/* Question Content */}
                      <div className="qb-content-col">
                        <p className="qb-question-text">{q.content}</p>

                        {/* Citation provenance if any */}
                        {q.citations && q.citations.length > 0 && (
                          <div className="qb-citation-box">
                            <span className="qb-citation-label">Trích dẫn tài liệu:</span>
                            {q.citations.map((c, ci) => (
                              <p key={ci} className="qb-citation-quote">"{c.quote}"</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Status & Revisions */}
                      <div className="qb-status-col">
                        {isDraft && (
                          <span className="qb-badge qb-badge-draft">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold-ink)' }} />
                            Draft
                          </span>
                        )}
                        {isApproved && (
                          <span className="qb-badge qb-badge-approved">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0E6245' }} />
                            Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="qb-badge qb-badge-rejected">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A32020' }} />
                            Rejected
                          </span>
                        )}
                        <span className="qb-rev-text">Rev {revCount}</span>
                      </div>

                      {/* Actions */}
                      <div className="qb-actions-col">
                        {isDraft ? (
                          <>
                            <button
                              type="button"
                              className="qb-btn-action qb-btn-approve"
                              onClick={() => handleApprove(q)}
                              title="Duyệt câu hỏi này vào ngân hàng"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Duyệt
                            </button>
                            <button
                              type="button"
                              className="qb-btn-action qb-btn-reject"
                              onClick={() => handleReject(q)}
                              title="Loại bỏ câu hỏi này"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              Loại
                            </button>
                            <button
                              type="button"
                              className="qb-btn-action qb-btn-revise"
                              onClick={() => handleOpenRevise(q)}
                              title="Chỉnh sửa nội dung câu hỏi"
                            >
                              Sửa
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>Đã chốt</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: COURSE MATERIALS */}
        {activeTab === 'materials' && (
          <section className="qb-materials-wrap" aria-label="Quản lý tài liệu giáo trình">
            {/* Upload Area */}
            <div className="qb-upload-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '600', color: 'var(--night-indigo)', margin: 0 }}>
                  Tải lên tài liệu giáo trình (Syllabus & Materials)
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: 0 }}>
                  Hỗ trợ định dạng file PDF, DOCX, TXT (tối đa 25MB). AI sẽ tự động phân tách tài liệu thành các đoạn kiến thức để sinh câu hỏi.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <label className="qb-upload-label">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    disabled={uploadingMaterial || !selectedCourseId}
                  />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {uploadingMaterial ? 'Đang tải lên…' : 'Upload Material'}
                </label>
              </div>
            </div>

            {/* Materials List Table */}
            <div className="qb-table-wrap">
              <div className="qb-table-header">
                <span className="qb-count-label">
                  {materials.length} tài liệu giáo trình đã nạp ({readyMaterialsCount} đã sẵn sàng sinh câu hỏi)
                </span>
              </div>

              {loadingMaterials ? (
                <div className="qb-empty">
                  <span style={{ fontSize: '15px', color: 'var(--ink-2)' }}>Đang tải danh sách tài liệu…</span>
                </div>
              ) : materials.length === 0 ? (
                <div className="qb-empty">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <p className="qb-empty-title">Chưa có tài liệu giáo trình nào</p>
                  <p className="qb-empty-desc">
                    Hãy tải lên tài liệu giáo trình của môn học để kích hoạt tính năng sinh câu hỏi tự động bằng AI.
                  </p>
                </div>
              ) : (
                <div className="qb-mat-list">
                  {materials.map((mat) => {
                    const isReady = mat.status === 'Ready'
                    const isPending = mat.status === 'Pending'
                    const isFailed = mat.status === 'Failed'
                    const isIngesting = ingestingMaterialId === mat.id

                    return (
                      <div key={mat.id} className="qb-mat-row">
                        <div className="qb-mat-icon">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--night-indigo)" strokeWidth="1.75">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>

                        <div className="qb-mat-info">
                          <span className="qb-mat-name">{mat.fileName}</span>
                          <span className="qb-mat-sub">
                            {formatBytes(mat.sizeBytes)} · Tải lên ngày {formatDate(mat.createdAt)}
                          </span>
                          {mat.ingestError && (
                            <span className="qb-mat-error">{mat.ingestError}</span>
                          )}
                        </div>

                        <div className="qb-mat-status">
                          {isReady && (
                            <span className="qb-badge qb-badge-approved">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0E6245' }} />
                              Ready
                            </span>
                          )}
                          {isPending && (
                            <span className="qb-badge qb-badge-draft">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold-ink)' }} />
                              Pending Ingest
                            </span>
                          )}
                          {isFailed && (
                            <span className="qb-badge qb-badge-rejected">
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A32020' }} />
                              Failed
                            </span>
                          )}
                        </div>

                        <div className="qb-mat-actions">
                          {isPending && (
                            <button
                              type="button"
                              className="qb-btn-action qb-btn-approve"
                              onClick={() => handleIngestMaterial(mat.id)}
                              disabled={isIngesting}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                              </svg>
                              {isIngesting ? 'Đang Ingest…' : 'Ingest'}
                            </button>
                          )}
                          {isReady && (
                            <span style={{ fontSize: '13px', color: 'var(--jade-ink)', fontWeight: '500' }}>
                              Đã phân tách chunks
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Modal: AI Question Generator */}
      {aiModalOpen && (
        <div className="qb-modal-overlay" onClick={() => !aiGenerating && setAiModalOpen(false)}>
          <div className="qb-modal-card qb-modal-ai" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="qb-ai-icon-bubble">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                    </svg>
                  </span>
                  <h3 className="qb-modal-title">Sinh câu hỏi bằng AI</h3>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: '6px 0 0' }}>
                  AI sẽ đọc các tài liệu giáo trình đã chọn và đối chiếu Platform Rubric để sinh câu hỏi phỏng vấn chuẩn xác.
                </p>
              </div>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setAiModalOpen(false)}
                disabled={aiGenerating}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAiGenerateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {aiError && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--red-wash-day)', border: '1px solid rgba(232,69,44,0.3)', color: 'var(--red-ink)', fontSize: '13.5px' }}>
                  {aiError}
                </div>
              )}

              {/* Platform Rubric Info */}
              <div className="qb-ai-rubric-info">
                <span style={{ fontWeight: '600', color: 'var(--night-indigo)' }}>
                  Platform Rubric đang áp dụng:
                </span>{' '}
                <span>
                  {aiPlatformRubric
                    ? `Phiên bản v${aiPlatformRubric.versionNo || 1} · Thang điểm ${aiPlatformRubric.maxScore || 10}đ (${aiPlatformRubric.criteria?.length || 3} tiêu chí đánh giá)`
                    : 'Platform Rubric mặc định hệ thống'}
                </span>
              </div>

              {/* Topic & Bloom & Count */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr', gap: '14px' }}>
                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="ai-topic">Chủ đề (Topic) *</label>
                  <input
                    id="ai-topic"
                    type="text"
                    className="qb-input"
                    placeholder="ví dụ: Domain Driven Design, Microservices..."
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    required
                  />
                </div>

                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="ai-bloom">Mức Bloom *</label>
                  <div className="qb-select-wrap">
                    <select
                      id="ai-bloom"
                      className="qb-select"
                      value={aiBloom}
                      onChange={(e) => setAiBloom(e.target.value)}
                    >
                      {BLOOM_LEVELS.map((bl) => (
                        <option key={bl} value={bl}>{bl}</option>
                      ))}
                    </select>
                    <svg className="qb-select-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="ai-count">Số câu hỏi</label>
                  <input
                    id="ai-count"
                    type="number"
                    min="1"
                    max="20"
                    className="qb-input"
                    value={aiCount}
                    onChange={(e) => setAiCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                  />
                </div>
              </div>

              {/* Materials Checkbox Selection */}
              <div className="qb-field-group">
                <label className="qb-field-label">Tài liệu giáo trình tham khảo (Source Materials)</label>
                {materials.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--gold-ink)', margin: '4px 0' }}>
                    Chưa có tài liệu nào trong môn học. Hãy nhập đoạn trích dẫn bên dưới hoặc tải tài liệu lên trước.
                  </p>
                ) : (
                  <div className="qb-mat-picker">
                    {materials.map((m) => {
                      const isReady = m.status === 'Ready'
                      const isChecked = aiSelectedMaterialIds.includes(m.id)
                      return (
                        <label key={m.id} className={`qb-mat-pick-item ${!isReady ? 'disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isReady}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAiSelectedMaterialIds((prev) => [...prev, m.id])
                              } else {
                                setAiSelectedMaterialIds((prev) => prev.filter((id) => id !== m.id))
                              }
                            }}
                          />
                          <span style={{ fontSize: '13.5px', color: isReady ? 'var(--night-indigo)' : 'var(--ink-3)' }}>
                            {m.fileName} {isReady ? `(${formatBytes(m.sizeBytes)})` : `(Chưa Ingest)`}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Optional Excerpts */}
              <div className="qb-field-group">
                <label className="qb-field-label" htmlFor="ai-excerpts">
                  Trích đoạn giáo trình bổ sung (tùy chọn)
                </label>
                <textarea
                  id="ai-excerpts"
                  className="qb-textarea"
                  style={{ minHeight: '80px' }}
                  placeholder="Dán thêm đoạn văn bản giáo trình hoặc tiêu chí câu hỏi phụ nếu muốn AI tham chiếu trực tiếp..."
                  value={aiSourceExcerpts}
                  onChange={(e) => setAiSourceExcerpts(e.target.value)}
                />
              </div>

              {/* Modal Footer */}
              <div className="qb-modal-footer">
                <button
                  type="button"
                  className="a-btn a-btn-quiet"
                  onClick={() => setAiModalOpen(false)}
                  disabled={aiGenerating}
                  style={{ height: '42px', padding: '0 16px', borderRadius: '10px', border: '1px solid var(--line-strong)', fontSize: '14px' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="qb-btn-ai-gen"
                  disabled={aiGenerating}
                  style={{ height: '42px', padding: '0 24px', fontSize: '14.5px' }}
                >
                  {aiGenerating ? (
                    <>
                      <span className="qb-spinner" />
                      AI đang phân tích & sinh câu hỏi…
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                      </svg>
                      Tạo câu hỏi bằng AI
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Question (Draft Manual) */}
      {createModalOpen && (
        <div className="qb-modal-overlay" onClick={() => !formSubmitting && setCreateModalOpen(false)}>
          <div className="qb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 className="qb-modal-title">Tạo câu hỏi thủ công</h3>
                <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: '4px 0 0' }}>
                  Câu hỏi sẽ được lưu dưới dạng Nháp (Draft) để kiểm duyệt trước khi đưa vào ca thi.
                </p>
              </div>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setCreateModalOpen(false)}
                disabled={formSubmitting}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--red-wash-day)', border: '1px solid rgba(232,69,44,0.3)', color: 'var(--red-ink)', fontSize: '13.5px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="new-topic">Chủ đề (Topic) *</label>
                  <input
                    id="new-topic"
                    type="text"
                    className="qb-input"
                    placeholder="ví dụ: Design Patterns, Database..."
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    required
                  />
                </div>

                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="new-bloom">Mức Bloom *</label>
                  <div className="qb-select-wrap">
                    <select
                      id="new-bloom"
                      className="qb-select"
                      value={bloomInput}
                      onChange={(e) => setBloomInput(e.target.value)}
                    >
                      {BLOOM_LEVELS.map((bl) => (
                        <option key={bl} value={bl}>{bl}</option>
                      ))}
                    </select>
                    <svg className="qb-select-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="qb-field-group">
                <label className="qb-field-label" htmlFor="new-content">Nội dung câu hỏi *</label>
                <textarea
                  id="new-content"
                  className="qb-textarea"
                  placeholder="Nhập nội dung câu hỏi phỏng vấn chi tiết..."
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                  required
                />
              </div>

              <div className="qb-modal-footer">
                <button
                  type="button"
                  className="a-btn a-btn-quiet"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={formSubmitting}
                  style={{ height: '40px', padding: '0 16px', borderRadius: '10px', border: '1px solid var(--line-strong)', fontSize: '14px' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="qb-btn-primary"
                  disabled={formSubmitting}
                  style={{ height: '40px', padding: '0 20px', fontSize: '14px' }}
                >
                  {formSubmitting ? 'Đang lưu…' : 'Lưu câu hỏi nháp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revise Question */}
      {reviseModalOpen && (
        <div className="qb-modal-overlay" onClick={() => !formSubmitting && setReviseModalOpen(false)}>
          <div className="qb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 className="qb-modal-title">Chỉnh sửa câu hỏi nháp</h3>
                <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: '4px 0 0' }}>
                  Lưu thay đổi sẽ cập nhật nội dung và tạo một phiên bản chỉnh sửa mới (Revision).
                </p>
              </div>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setReviseModalOpen(false)}
                disabled={formSubmitting}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleReviseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--red-wash-day)', border: '1px solid rgba(232,69,44,0.3)', color: 'var(--red-ink)', fontSize: '13.5px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="edit-topic">Chủ đề (Topic) *</label>
                  <input
                    id="edit-topic"
                    type="text"
                    className="qb-input"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    required
                  />
                </div>

                <div className="qb-field-group">
                  <label className="qb-field-label" htmlFor="edit-bloom">Mức Bloom *</label>
                  <div className="qb-select-wrap">
                    <select
                      id="edit-bloom"
                      className="qb-select"
                      value={bloomInput}
                      onChange={(e) => setBloomInput(e.target.value)}
                    >
                      {BLOOM_LEVELS.map((bl) => (
                        <option key={bl} value={bl}>{bl}</option>
                      ))}
                    </select>
                    <svg className="qb-select-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="qb-field-group">
                <label className="qb-field-label" htmlFor="edit-content">Nội dung câu hỏi *</label>
                <textarea
                  id="edit-content"
                  className="qb-textarea"
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                  required
                />
              </div>

              <div className="qb-modal-footer">
                <button
                  type="button"
                  className="a-btn a-btn-quiet"
                  onClick={() => setReviseModalOpen(false)}
                  disabled={formSubmitting}
                  style={{ height: '40px', padding: '0 16px', borderRadius: '10px', border: '1px solid var(--line-strong)', fontSize: '14px' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="qb-btn-primary"
                  disabled={formSubmitting}
                  style={{ height: '40px', padding: '0 20px', fontSize: '14px' }}
                >
                  {formSubmitting ? 'Đang lưu…' : 'Lưu chỉnh sửa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`qb-toast ${toast.type === 'error' ? 'qb-toast-error' : 'qb-toast-success'}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  )
}
