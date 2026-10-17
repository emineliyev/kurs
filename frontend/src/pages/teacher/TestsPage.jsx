import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from '@/utils/swal'
import { testsApi } from '@/api/tests'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'
import ScheduleExamModal from '@/components/teacher/ScheduleExamModal'
import { toastApiError } from '@/api/errors'

export default function TestsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const { accessToken } = useAuthStore()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [duplicatingId, setDuplicatingId] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    testsApi.list()
      .then((res) => setTests(res.data.results || res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!accessToken) return
    load()
  }, [accessToken])

  const onDelete = async (test) => {
    const result = await Swal.fire({
      title: t('confirm_delete'),
      text: test.title,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('yes_delete'),
      cancelButtonText: t('no_cancel'),
    })
    if (result.isConfirmed) {
      try {
        await testsApi.delete(test.id)
        toast.success(t('test_deleted', { ns: 'teacher' }))
        load()
      } catch (err) {
        const msg = err.response?.data?.detail || t('delete_failed')
        Swal.fire({ title: t('delete_failed'), text: msg, icon: 'error', confirmButtonText: t('close') })
      }
    }
  }

  const onDuplicate = async (id) => {
    setDuplicatingId(id)
    try {
      await testsApi.duplicate(id)
      toast.success(t('test_duplicated', { ns: 'teacher' }))
      load()
    } catch { toast.error(t('error')) } finally { setDuplicatingId(null) }
  }

  // Why a ready test can't go back to draft (null = it can)
  const draftBlocker = (test) =>
    test.has_results ? t('to_draft_used', { ns: 'teacher' })
      : test.open_exam_count > 0 ? t('to_draft_open_exams', { ns: 'teacher', count: test.open_exam_count })
      : null

  const onToDraft = async (test) => {
    const blocker = draftBlocker(test)
    if (blocker) {
      Swal.fire({ title: t('to_draft', { ns: 'teacher' }), text: blocker, icon: 'info', confirmButtonText: t('close') })
      return
    }
    const r = await Swal.fire({
      title: t('to_draft_confirm', { ns: 'teacher', title: test.title }),
      text: t('to_draft_text', { ns: 'teacher' }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('to_draft_yes', { ns: 'teacher' }),
      cancelButtonText: t('cancel'),
    })
    if (!r.isConfirmed) return
    try {
      await testsApi.update(test.id, { is_published: false })
      toast.success(t('to_draft_done', { ns: 'teacher' }))
      navigate(`/teacher/tests/${test.id}/edit`)
    } catch (err) {
      toastApiError(err)
    }
  }

  const toDraftButton = (test, size) => {
    const blocked = !!draftBlocker(test)
    return (
      <button onClick={() => onToDraft(test)}
        title={draftBlocker(test) || t('to_draft', { ns: 'teacher' })}
        className={`${size} rounded-lg flex items-center justify-center transition-colors ${blocked
          ? 'bg-slate-50 text-slate-300 cursor-help'
          : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
        <i className="bi bi-arrow-counterclockwise text-sm"></i>
      </button>
    )
  }

  const visibleTests = tests.filter((t) =>
    filter === 'all' ? true : filter === 'published' ? t.is_published : !t.is_published
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t('tests')}</h1>
        <Link to="/teacher/tests/create" className="btn-primary shrink-0 whitespace-nowrap">
          <i className="bi bi-plus-lg"></i> {t('create_test', { ns: 'teacher' })}
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'all',       label: t('all') },
          { key: 'published', label: t('published', { ns: 'teacher' }) },
          { key: 'draft',     label: t('draft',     { ns: 'teacher' }) },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageSpinner />
      ) : tests.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <i className="bi bi-file-text text-4xl mb-3 block"></i>
          <p className="mb-4">{t('no_tests_yet', { ns: 'teacher' })}</p>
          <Link to="/teacher/tests/create" className="btn-primary inline-flex">
            <i className="bi bi-plus-lg"></i> {t('create_first_test', { ns: 'teacher' })}
          </Link>
        </div>
      ) : visibleTests.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">{t('no_tests_filter', { ns: 'teacher' })}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('test_title', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('questions', { ns: 'teacher' })}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('status')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('created_at')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTests.map((test) => (
                  <tr key={test.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/teacher/tests/${test.id}`} className="font-medium hover:text-primary-700">{test.title}</Link>
                    </td>
                    <td className="px-5 py-3">{test.question_count}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${test.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {test.is_published ? t('published', { ns: 'teacher' }) : t('draft', { ns: 'teacher' })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{test.created_at ? format(new Date(test.created_at), 'dd.MM.yyyy') : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        {test.is_published && (
                          <button onClick={() => setScheduling(test)}
                            className="h-7 px-2.5 rounded-lg flex items-center gap-1 bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors">
                            <i className="bi bi-calendar-plus"></i> {t('schedule_exam', { ns: 'teacher' })}
                          </button>
                        )}
                        {test.is_published && toDraftButton(test, 'w-7 h-7')}
                        {!test.is_published && (
                          <Link to={`/teacher/tests/${test.id}/edit`} title={t('edit')}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                            <i className="bi bi-pencil text-xs"></i>
                          </Link>
                        )}
                        {test.question_count > 0 && (
                          <Link to={`/teacher/tests/${test.id}/print`} title={t('print_open', { ns: 'teacher' })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                            <i className="bi bi-printer text-xs"></i>
                          </Link>
                        )}
                        <button onClick={() => onDuplicate(test.id)} title={t('copy')} disabled={duplicatingId === test.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors disabled:opacity-50">
                          <i className={`bi ${duplicatingId === test.id ? 'bi-arrow-repeat animate-spin' : 'bi-copy'} text-xs`}></i>
                        </button>
                        <button onClick={() => onDelete(test)} title={t('delete')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <i className="bi bi-trash text-xs"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visibleTests.map((test) => (
              <div key={test.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/teacher/tests/${test.id}`} className="font-semibold text-slate-900 hover:text-primary-700">
                      {test.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t('question_count', { ns: 'teacher', count: test.question_count })}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${test.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {test.is_published ? t('published', { ns: 'teacher' }) : t('draft', { ns: 'teacher' })}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{test.created_at ? format(new Date(test.created_at), 'dd.MM.yyyy') : '—'}</span>
                  <div className="flex items-center gap-1.5">
                    {test.is_published && (
                      <button onClick={() => setScheduling(test)} title={t('schedule_exam', { ns: 'teacher' })}
                        className="h-8 px-2.5 rounded-lg flex items-center gap-1 bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors">
                        <i className="bi bi-calendar-plus"></i> {t('schedule_exam', { ns: 'teacher' })}
                      </button>
                    )}
                    {test.is_published && toDraftButton(test, 'w-8 h-8')}
                    {!test.is_published && (
                      <Link to={`/teacher/tests/${test.id}/edit`} title={t('edit')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                        <i className="bi bi-pencil text-sm"></i>
                      </Link>
                    )}
                    {test.question_count > 0 && (
                          <Link to={`/teacher/tests/${test.id}/print`} title={t('print_open', { ns: 'teacher' })}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                            <i className="bi bi-printer text-sm"></i>
                          </Link>
                        )}
                        <button onClick={() => onDuplicate(test.id)} title={t('copy')} disabled={duplicatingId === test.id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors disabled:opacity-50">
                      <i className={`bi ${duplicatingId === test.id ? 'bi-arrow-repeat animate-spin' : 'bi-copy'} text-sm`}></i>
                    </button>
                    <button onClick={() => onDelete(test)} title={t('delete')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                      <i className="bi bi-trash text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {scheduling && (
        <ScheduleExamModal
          test={scheduling}
          onClose={() => setScheduling(null)}
          onDone={() => { setScheduling(null); navigate('/teacher/exams') }}
        />
      )}
    </div>
  )
}
