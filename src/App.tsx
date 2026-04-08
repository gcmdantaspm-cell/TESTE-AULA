import React, { useState, useEffect } from 'react';
import { Users, CalendarCheck, BarChart3, Plus, Trash2, Edit2, Check, X } from 'lucide-react';

// Types
type Student = {
  id: string;
  name: string;
  matricula: string;
};

type AttendanceStatus = 'Presente' | 'Falta' | 'Justificado' | '';

type AttendanceRecord = {
  studentId: string;
  status: AttendanceStatus;
};

type DailyAttendance = {
  date: string;
  records: AttendanceRecord[];
};

export default function App() {
  // State
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date().toISOString().split('T')[0];
    return localStorage.getItem('lastSelectedDate') || today;
  });
  const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'reports'>('attendance');

  // Load data on mount
  useEffect(() => {
    const storedStudents = localStorage.getItem('students');
    if (storedStudents) setStudents(JSON.parse(storedStudents));

    const storedAttendance = localStorage.getItem('attendance');
    if (storedAttendance) setAttendance(JSON.parse(storedAttendance));
  }, []);

  // Save data on change
  useEffect(() => {
    localStorage.setItem('students', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem('attendance', JSON.stringify(attendance));
  }, [attendance]);

  useEffect(() => {
    localStorage.setItem('lastSelectedDate', selectedDate);
  }, [selectedDate]);

  // --- Handlers ---
  
  // Students
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentMatricula, setNewStudentMatricula] = useState('');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentMatricula, setEditStudentMatricula] = useState('');

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentMatricula.trim()) return;
    
    const newStudent: Student = {
      id: crypto.randomUUID(),
      name: newStudentName,
      matricula: newStudentMatricula,
    };
    
    setStudents([...students, newStudent]);
    setNewStudentName('');
    setNewStudentMatricula('');
  };

  const handleDeleteStudent = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este aluno?')) {
      setStudents(students.filter(s => s.id !== id));
    }
  };

  const startEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setEditStudentName(student.name);
    setEditStudentMatricula(student.matricula);
  };

  const saveEditStudent = () => {
    setStudents(students.map(s => 
      s.id === editingStudentId 
        ? { ...s, name: editStudentName, matricula: editStudentMatricula } 
        : s
    ));
    setEditingStudentId(null);
  };

  // Attendance
  const handleAttendanceChange = (studentId: string, status: AttendanceStatus) => {
    setAttendance(prev => {
      const existingDayIndex = prev.findIndex(a => a.date === selectedDate);
      
      if (existingDayIndex >= 0) {
        const day = prev[existingDayIndex];
        const existingRecordIndex = day.records.findIndex(r => r.studentId === studentId);
        
        let newRecords = [...day.records];
        if (existingRecordIndex >= 0) {
          newRecords[existingRecordIndex] = { studentId, status };
        } else {
          newRecords.push({ studentId, status });
        }
        
        const newAttendance = [...prev];
        newAttendance[existingDayIndex] = { ...day, records: newRecords };
        return newAttendance;
      } else {
        return [...prev, { date: selectedDate, records: [{ studentId, status }] }];
      }
    });
  };

  const getStudentStatusForDate = (studentId: string, date: string): AttendanceStatus => {
    const day = attendance.find(a => a.date === date);
    if (!day) return '';
    const record = day.records.find(r => r.studentId === studentId);
    return record ? record.status : '';
  };

  // Reports
  const getStudentStats = (studentId: string) => {
    let present = 0;
    let absent = 0;
    let justified = 0;
    let total = 0;

    attendance.forEach(day => {
      const record = day.records.find(r => r.studentId === studentId);
      if (record && record.status) {
        total++;
        if (record.status === 'Presente') present++;
        if (record.status === 'Falta') absent++;
        if (record.status === 'Justificado') justified++;
      }
    });

    const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

    return { present, absent, justified, total, percentage };
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <CalendarCheck size={24} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Chamada Online</h1>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => setActiveTab('attendance')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'attendance' ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CalendarCheck size={20} />
                <span>Chamada</span>
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'students' ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Users size={20} />
                <span>Alunos</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'reports' ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <BarChart3 size={20} />
                <span>Relatório</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {activeTab === 'attendance' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Lançamento de Frequência</h2>
                <p className="text-sm text-gray-500">Selecione a data e marque a presença dos alunos.</p>
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="date" className="text-sm font-medium text-gray-700">Data:</label>
                <input
                  type="date"
                  id="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {students.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum aluno cadastrado. Vá para a aba "Alunos" para adicionar.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {students.map(student => {
                    const status = getStudentStatusForDate(student.id, selectedDate);
                    return (
                      <li key={student.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                        <div>
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-500">Matrícula: {student.matricula}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'Presente')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              status === 'Presente'
                                ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                            }`}
                          >
                            Presente
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'Falta')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              status === 'Falta'
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
                            }`}
                          >
                            Falta
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'Justificado')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              status === 'Justificado'
                                ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20'
                                : 'bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-yellow-700'
                            }`}
                          >
                            Justificado
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Cadastrar Novo Aluno</h2>
              <form onSubmit={handleAddStudent} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="sm:w-48">
                  <input
                    type="text"
                    placeholder="Matrícula/ID"
                    value={newStudentMatricula}
                    onChange={(e) => setNewStudentMatricula(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  <span>Adicionar</span>
                </button>
              </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Alunos Cadastrados ({students.length})</h2>
              </div>
              {students.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum aluno cadastrado ainda.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {students.map(student => (
                    <li key={student.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      {editingStudentId === student.id ? (
                        <div className="flex-1 flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            value={editStudentName}
                            onChange={(e) => setEditStudentName(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <input
                            type="text"
                            value={editStudentMatricula}
                            onChange={(e) => setEditStudentMatricula(e.target.value)}
                            className="sm:w-40 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-500">Matrícula: {student.matricula}</p>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {editingStudentId === student.id ? (
                          <>
                            <button onClick={saveEditStudent} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Salvar">
                              <Check size={20} />
                            </button>
                            <button onClick={() => setEditingStudentId(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Cancelar">
                              <X size={20} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditStudent(student)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                              <Edit2 size={20} />
                            </button>
                            <button onClick={() => handleDeleteStudent(student.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                              <Trash2 size={20} />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Relatório de Frequência</h2>
              <p className="text-sm text-gray-500 mb-6">Visão geral da presença de todos os alunos cadastrados.</p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-sm text-gray-500">
                      <th className="pb-3 font-medium">Aluno</th>
                      <th className="pb-3 font-medium text-center">Aulas</th>
                      <th className="pb-3 font-medium text-center text-green-600">Presenças</th>
                      <th className="pb-3 font-medium text-center text-red-600">Faltas</th>
                      <th className="pb-3 font-medium text-center text-yellow-600">Justificadas</th>
                      <th className="pb-3 font-medium text-right">% Presença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500">Nenhum dado disponível.</td>
                      </tr>
                    ) : (
                      students.map(student => {
                        const stats = getStudentStats(student.id);
                        return (
                          <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4">
                              <p className="font-medium text-gray-900">{student.name}</p>
                              <p className="text-xs text-gray-500">{student.matricula}</p>
                            </td>
                            <td className="py-4 text-center text-gray-600">{stats.total}</td>
                            <td className="py-4 text-center font-medium text-green-600">{stats.present}</td>
                            <td className="py-4 text-center font-medium text-red-600">{stats.absent}</td>
                            <td className="py-4 text-center font-medium text-yellow-600">{stats.justified}</td>
                            <td className="py-4 text-right">
                              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-sm font-medium ${
                                stats.percentage >= 75 ? 'bg-green-100 text-green-800' : 
                                stats.percentage >= 50 ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-red-100 text-red-800'
                              }`}>
                                {stats.percentage}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20 pb-2">
        <div className="flex justify-around p-2">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors flex-1 ${
              activeTab === 'attendance' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <CalendarCheck size={20} />
            <span className="text-[10px] font-medium">Chamada</span>
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors flex-1 ${
              activeTab === 'students' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <Users size={20} />
            <span className="text-[10px] font-medium">Alunos</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors flex-1 ${
              activeTab === 'reports' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <BarChart3 size={20} />
            <span className="text-[10px] font-medium">Relatório</span>
          </button>
        </div>
      </div>
    </div>
  );
}
