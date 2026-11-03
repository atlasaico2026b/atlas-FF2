// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Shogo Technologies, Inc.
import { useState, useEffect, useCallback } from 'react'
import { FolderOpen, FileText, Plus, Trash2, Copy, Download, ArrowRight, Eye, ChevronLeft, Search, Calculator } from 'lucide-react'
import { STANDARDS, type Standard } from '../lib/standards-data'
import StandardsViewer from './StandardsViewer'
import NewProjectDialog from './NewProjectDialog'
import { useLang } from '@/lib/i18n'

interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

interface DashboardProps {
  onOpenProject: (id: string) => void
  onOpenCalc?: () => void
  onBack: () => void
  role?: 'admin' | 'user' | null
  onLogout?: () => void
}

export default function Dashboard({ onOpenProject, onOpenCalc, onBack, role, onLogout }: DashboardProps) {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState<'projects' | 'standards'>('projects')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedStandard, setSelectedStandard] = useState<Standard | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json().catch(() => null)
      const list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : []
      setProjects(list)
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreateProject = useCallback(async (name: string, type: 'blank' | 'upload', dimensions?: { width: number; height: number }, mapImageBase64?: string) => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          projectType: type,
          widthMeters: dimensions?.width || 100,
          heightMeters: dimensions?.height || 100,
          mapImageUrl: mapImageBase64 || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      const id = body?.data?.id || body?.id
      if (id) {
        setShowNewProject(false)
        onOpenProject(id)
      } else {
        console.error('Project creation failed:', body)
      }
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setCreating(false)
    }
  }, [onOpenProject, creating])

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }, [])

  const handleDuplicateProject = useCallback(async (project: Project) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`)
      const resBody = await res.json()
      const full = resBody?.data || resBody
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${project.name} (Copy)`,
          description: full.description,
          projectType: full.projectType,
          widthMeters: full.widthMeters,
          heightMeters: full.heightMeters,
          layers: full.layers,
          elements: full.elements,
          checklist: full.checklist,
          zones: full.zones,
        }),
      })
      const body = await createRes.json().catch(() => ({}))
      const id = body?.data?.id || body?.id
      if (id) fetchProjects()
    } catch (err) {
      console.error('Failed to duplicate project:', err)
    }
  }, [fetchProjects])

  const handleExportProject = useCallback(async (project: Project) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`)
      const resBody = await res.json()
      const full = resBody?.data || resBody
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name}.atlas`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export project:', err)
    }
  }, [])

  const filteredStandards = STANDARDS.filter(s =>
    searchQuery === '' ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white/60 backdrop-blur-md border-b border-white/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/50 rounded-xl transition">
              <ArrowRight className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-rose-500 bg-clip-text text-transparent">
              {t('dash.appTitle')}
            </h1>
          </div>
        </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-sky-100 text-sky-600 px-2 py-1 rounded-lg">
              {role === 'admin' ? t('dash.adminName') : t('auth.role.user')}
            </span>
            {onLogout && (
              <button onClick={onLogout} className="text-xs text-gray-400 hover:text-red-400 transition px-3 py-1.5 rounded-lg hover:bg-white/50">
                {t('dash.logout')}
              </button>
            )}
          </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-6 py-3 rounded-2xl font-medium transition-all ${
              activeTab === 'projects'
                ? 'bg-white/70 backdrop-blur-md shadow-md text-sky-600 border border-white/50'
                : 'bg-white/30 text-gray-500 hover:bg-white/50'
            }`}
          >
            <FolderOpen className="w-4 h-4 inline ml-2" />
            {t('dash.projects')}
          </button>
          <button
            onClick={() => setActiveTab('standards')}
            className={`px-6 py-3 rounded-2xl font-medium transition-all ${
              activeTab === 'standards'
                ? 'bg-white/70 backdrop-blur-md shadow-md text-sky-600 border border-white/50'
                : 'bg-white/30 text-gray-500 hover:bg-white/50'
            }`}
          >
            <FileText className="w-4 h-4 inline ml-2" />
            {t('dash.standards')}
          </button>
          {onOpenCalc && (
            <button
              onClick={onOpenCalc}
              className="px-6 py-3 rounded-2xl font-medium transition-all bg-white/30 text-gray-500 hover:bg-white/50"
            >
              <Calculator className="w-4 h-4 inline ml-2" />
              {t('dash.calc')}
            </button>
          )}
        </div>

        {/* Projects Tab */}
        {activeTab === 'projects' && (
          <div>
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setShowNewProject(true)}
                className="px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-2xl font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {t('dash.newProject')}
              </button>
              <label className="px-6 py-3 bg-white/50 backdrop-blur-md text-gray-600 rounded-2xl font-medium border border-white/50 hover:bg-white/70 transition-all flex items-center gap-2 cursor-pointer">
                <Download className="w-5 h-5" />
                {t('dash.openProject')}
                <input
                  type="file"
                  accept=".atlas"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const text = await file.text()
                    const data = JSON.parse(text)
                    const res = await fetch('/api/projects', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: data.name || file.name.replace('.atlas', ''),
                        description: data.description,
                        projectType: data.projectType,
                        widthMeters: data.widthMeters,
                        heightMeters: data.heightMeters,
                        layers: data.layers,
                        elements: data.elements,
                        checklist: data.checklist,
                        zones: data.zones,
                      }),
                    })
                    const result = await res.json().catch(() => ({}))
                    const importedId = result?.data?.id || result?.id
                    if (importedId) {
                      fetchProjects()
                    }
                  }}
                />
              </label>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">{t('dash.loading')}</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-16 bg-white/30 backdrop-blur-md rounded-3xl border border-white/50">
                <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">{t('dash.noProjects')}</p>
                <p className="text-gray-400 text-sm mt-2">{t('dash.noProjectsHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="bg-white/50 backdrop-blur-md rounded-2xl p-5 border border-white/50 hover:shadow-lg transition-all cursor-pointer group"
                    onClick={() => onOpenProject(project.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-gray-700 text-lg">{project.name}</h3>
                      <Eye className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    {project.description && (
                      <p className="text-gray-500 text-sm mb-3 line-clamp-2">{project.description}</p>
                    )}
                    <div className="text-xs text-gray-400 mb-4">
                      {new Date(project.updatedAt).toLocaleDateString('fa-IR')}
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleExportProject(project)}
                        className="p-2 bg-white/50 rounded-lg hover:bg-white/80 transition"
                        title={t('dash.saveAtlas')}
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDuplicateProject(project)}
                        className="p-2 bg-white/50 rounded-lg hover:bg-white/80 transition"
                        title={t('dash.copy')}
                      >
                        <Copy className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="p-2 bg-white/50 rounded-lg hover:bg-red-50 transition"
                        title={t('dash.delete')}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Standards Tab */}
        {activeTab === 'standards' && (
          <div>
            <div className="relative mb-6">
              <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('dash.searchStandards')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-white/50 focus:outline-none focus:ring-2 focus:ring-sky-300 text-gray-700"
              />
            </div>

            <div className="space-y-2">
              {filteredStandards.map((std) => (
                <button
                  key={std.id}
                  onClick={() => setSelectedStandard(std)}
                  className="w-full text-right px-5 py-4 bg-white/50 backdrop-blur-md rounded-2xl border border-white/50 hover:bg-white/70 hover:shadow-md transition-all flex items-center justify-between group"
                >
                  <div>
                    <span className="font-bold text-sky-600 ml-3">{std.name}</span>
                    <span className="text-gray-600">{std.fullName}</span>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-sky-500 transition" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Standard Viewer Modal */}
      {selectedStandard && (
        <StandardsViewer
          standard={selectedStandard}
          onClose={() => setSelectedStandard(null)}
        />
      )}

      {/* New Project Dialog */}
      {showNewProject && (
        <NewProjectDialog
          onCreate={handleCreateProject}
          onClose={() => setShowNewProject(false)}
        />
      )}
    </div>
  )
}
