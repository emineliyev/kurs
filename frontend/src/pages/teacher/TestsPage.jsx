import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { testsApi } from '@/api/tests'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import PageSpinner from '@/components/common/PageSpinner'

export default function TestsPage() {
  const { t } = useTranslation(['common', 'teacher'])
  const { accessToken } = useAuthStore()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [duplicatingId, setDuplicatingId] = useState(null)

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

  const visibleTests = tests.filter((t) =>
    filter === 'all' ? true : filter === 'published' ? t.is_published : !t.is_published
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('tests')}</h1>
        <Link to="/teacher/tests/create" className="btn-primary">
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
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('grade', { ns: 'teacher' })}</th>
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
                    <td className="px-5 py-3 text-slate-500">
                      {test.class_names?.length
                        ? test.class_names.map(c => (
                            <span key={c.id} className="inline-block mr-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{c.name}</span>
                          ))
                        : <span className="text-slate-400">{t('general', { ns: 'teacher' })}</span>
                      }
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
                        <Link to={`/teacher/tests/${test.id}`} title={t('edit')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                          <i className="bi bi-pencil text-xs"></i>
                        </Link>
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
                      {test.class_names?.length ? test.class_names.map(c => c.name).join(', ') : t('general', { ns: 'teacher' })} · {t('question_count', { ns: 'teacher', count: test.question_count })}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${test.is_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {test.is_published ? t('published', { ns: 'teacher' }) : t('draft', { ns: 'teacher' })}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{test.created_at ? format(new Date(test.created_at), 'dd.MM.yyyy') : '—'}</span>
                  <div className="flex items-center gap-1.5">
                    <Link to={`/teacher/tests/${test.id}`} title={t('edit')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                      <i className="bi bi-pencil text-sm"></i>
                    </Link>
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
    </div>
  )
}
