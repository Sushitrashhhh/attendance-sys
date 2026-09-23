import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  AlertCircle,
  RefreshCw,
  Fingerprint,
} from 'lucide-react';
import { fetchStudents, deleteStudent } from '../api/client';
import type { Student } from '../types';

interface StudentsListProps {
  onNavigateToRegister?: () => void;
}

export const StudentsList: React.FC<StudentsListProps> = ({ onNavigateToRegister }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadData = async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudents(searchTerm);
      setStudents(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadData(search);
    }, 250);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteStudent(id);
      setDeleteConfirmId(null);
      await loadData(search);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-400" />
            Student Directory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage enrolled students and biometric biometric profiles stored in Neon pgvector.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(search)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          {onNavigateToRegister && (
            <button
              onClick={onNavigateToRegister}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-medium text-sm transition-all shadow-lg shadow-blue-600/20"
            >
              <UserPlus className="h-4 w-4" />
              <span>Enroll New Student</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center gap-3">
        <Search className="h-5 w-5 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student name, roll number, or department..."
          className="bg-transparent border-none focus:outline-none text-sm text-white placeholder-slate-500 w-full"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      {/* Content States */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="glass-panel p-12 rounded-xl border border-slate-800 text-center">
          <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Querying Neon PostgreSQL students table...</p>
        </div>
      )}

      {!loading && students.length === 0 && (
        <div className="glass-panel p-12 rounded-xl border border-slate-800 text-center">
          <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">No students found</h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
            {search
              ? `No student matching "${search}". Try a different roll number or name.`
              : 'No students have been enrolled yet. Use the registration page to enroll students with webcam face recognition.'}
          </p>
          {onNavigateToRegister && !search && (
            <button
              onClick={onNavigateToRegister}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-all"
            >
              <UserPlus className="h-4 w-4" />
              Enroll First Student
            </button>
          )}
        </div>
      )}

      {!loading && students.length > 0 && (
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Roll Number</th>
                  <th className="px-6 py-4">Branch / Dept</th>
                  <th className="px-6 py-4">Semester</th>
                  <th className="px-6 py-4">Biometrics</th>
                  <th className="px-6 py-4">Enrolled On</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                          {student.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">{student.name}</div>
                          <div className="text-xs text-slate-400">ID #{student.id}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-blue-400 font-semibold">
                      {student.roll_number}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">{student.branch}</td>

                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                      Semester {student.semester}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Fingerprint className="h-3 w-3" />
                        ArcFace 512-D
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                      {new Date(student.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {deleteConfirmId === student.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDelete(student.id)}
                            disabled={deletingId === student.id}
                            className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                          >
                            {deletingId === student.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(student.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete student and purge biometrics"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
            <span>Showing {students.length} of {total} registered students</span>
            <span>Biometric embeddings indexed via pgvector</span>
          </div>
        </div>
      )}
    </div>
  );
};
