import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, CalendarCheck, BarChart3, Plus, Trash2, Edit2, Check, X, 
  Loader2, AlertCircle, LogIn, LogOut, User, BookOpen, GraduationCap,
  ChevronRight, Award, Clock, Download, FileText
} from 'lucide-react';
import { getSupabase, getAuth } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type UserRole = 'professor' | 'aluno';

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_authorized: boolean;
};

type Student = {
  id: string;
  profile_id?: string;
  name: string;
  matricula: string;
  created_at?: string;
};

type AttendanceStatus = 'Presente' | 'Falta' | 'Justificado' | '';

type AttendanceRecord = {
  id?: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
};

type Grade = {
  id: string;
  student_id: string;
  subject: string;
  grade_value: number;
  term: string;
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'reports' | 'grades' | 'my-dashboard' | 'user-management'>('attendance');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [selectedRole, setSelectedRole] = useState<'aluno' | 'professor'>('aluno');
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const isLoadingData = useRef(false);

  // Auth State
  useEffect(() => {
    let mounted = true;
    
    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (mounted && authLoading) {
        console.warn("Auth initialization timed out");
        setAuthLoading(false);
        setLoading(false);
      }
    }, 10000);

    const initAuth = async () => {
      try {
        const auth = getAuth();
        
        // Check if we are in a password reset flow
        const hash = window.location.hash;
        if (hash && hash.includes('type=recovery')) {
          setAuthMode('reset');
        }

        // Check current session first
        const { data: { session } } = await auth.getSession();
        
        if (mounted) {
          if (session?.user) {
            setUser(session.user);
            try {
              await loadAllData(session.user);
            } catch (e) {
              console.error("Initial data load failed:", e);
            }
          } else {
            setLoading(false);
          }
          setAuthLoading(false);
          clearTimeout(timeout);
        }

        // Listen for changes
        const { data: authListener } = auth.onAuthStateChange(async (event, session) => {
          if (!mounted) return;
          
          console.log("Auth event:", event);

          if (event === 'PASSWORD_RECOVERY') {
            setAuthMode('reset');
          }

          if (session?.user) {
            setUser(session.user);
            try {
              await loadAllData(session.user);
            } catch (e) {
              console.error("Auth change data load failed:", e);
            }
          } else {
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
          setAuthLoading(false);
          clearTimeout(timeout);
        });

        return () => {
          authListener.subscription.unsubscribe();
        };
      } catch (error) {
        console.error("Auth init error:", error);
        if (mounted) {
          setDbError("Erro ao inicializar conexão com o banco de dados.");
          setAuthLoading(false);
          setLoading(false);
          clearTimeout(timeout);
        }
      }
    };

    let cleanup: (() => void) | undefined;
    initAuth().then(unsub => {
      cleanup = unsub;
    });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  const loadAllData = async (currentUser: SupabaseUser) => {
    if (isLoadingData.current) return;
    isLoadingData.current = true;
    
    setLoading(true);
    setDbError(null);
    
    const dataTimeout = setTimeout(() => {
      if (isLoadingData.current) {
        console.warn("Data loading timed out");
        setLoading(false);
        isLoadingData.current = false;
      }
    }, 15000);

    try {
      const supabase = getSupabase();
      
      // 1. Fetch Profile
      let currentProfile = null;
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profileError) {
        if (profileError.code === '42P01') {
          throw new Error('As tabelas não foram criadas no Supabase. Por favor, execute o script SQL no painel do Supabase.');
        }
        
        // Try to create profile
        const isAdmin = currentUser.email === 'gcmdantas.pm@gmail.com' || currentUser.user_metadata?.role === 'professor';
        const newProfile = {
          id: currentUser.id,
          email: currentUser.email || '',
          full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || 'Usuário',
          role: isAdmin ? 'professor' : 'aluno',
          is_authorized: isAdmin // Admin is authorized by default
        };
        
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single();
          
        if (createError) {
          if (createError.code === '23505') {
            // Race condition, already exists
            const { data: retryData } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
            currentProfile = retryData;
          } else {
            throw new Error(`Erro ao criar perfil: ${createError.message}`);
          }
        } else {
          currentProfile = created;
        }
      } else {
        currentProfile = profileData;
      }

      if (!currentProfile) {
         throw new Error('Não foi possível carregar o perfil.');
      }

      setProfile(currentProfile);
      if (currentProfile.role === 'aluno') setActiveTab('my-dashboard');

      // 2. Fetch Data
      const queries: any[] = [
        supabase.from('students').select('*').order('name'),
        supabase.from('attendance').select('*'),
        supabase.from('grades').select('*')
      ];

      if (currentProfile.role === 'professor') {
        queries.push(supabase.from('profiles').select('*').order('created_at', { ascending: false }));
      }

      const results = await Promise.all(queries);
      
      const [studentsRes, attendanceRes, gradesRes] = results;
      
      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (gradesRes.error) throw gradesRes.error;

      setStudents(studentsRes.data || []);
      setAttendance(attendanceRes.data || []);
      setGrades(gradesRes.data || []);

      if (currentProfile.role === 'professor' && results[3]) {
        setAllProfiles(results[3].data || []);
      }

    } catch (error: any) {
      console.error('Error loading data:', error);
      setDbError(error.message || 'Erro de conexão. Verifique o console.');
    } finally {
      clearTimeout(dataTimeout);
      setLoading(false);
      isLoadingData.current = false;
    }
  };

  // --- Data State ---
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date().toISOString().split('T')[0];
    return localStorage.getItem('lastSelectedDate') || today;
  });

  // --- Auth UI ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        const { error } = await auth.signUp({
          email,
          password,
          options: { 
            data: { 
              full_name: fullName,
              role: selectedRole
            },
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        alert('Cadastro realizado! Verifique seu email para confirmar sua conta.');
        setAuthMode('login');
      } else if (authMode === 'forgot') {
        const { error } = await auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        alert('Email de recuperação enviado! Verifique sua caixa de entrada.');
        setAuthMode('login');
      } else if (authMode === 'reset') {
        const { error } = await auth.updateUser({ password });
        if (error) throw error;
        alert('Senha atualizada com sucesso!');
        setAuthMode('login');
      } else {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      alert(error.message || 'Erro na autenticação');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const auth = getAuth();
    await auth.signOut();
    setUser(null);
    setProfile(null);
    setDbError(null);
  };

  // --- Render Helpers ---

  if (configMissing) {
    return <ConfigMissingView />;
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-red-100 text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Erro de Banco de Dados</h2>
          <p className="text-gray-600 mb-6">{dbError}</p>
          <button 
            onClick={handleLogout} 
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Sair / Voltar
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return <LoadingView message="Verificando autenticação..." />;
  }

  if (!user) {
    const getTitle = () => {
      if (authMode === 'register') return 'Criar Conta';
      if (authMode === 'forgot') return 'Recuperar Senha';
      if (authMode === 'reset') return 'Nova Senha';
      return 'Bem-vindo de volta';
    };

    const getSubtitle = () => {
      if (authMode === 'register') return 'Cadastre-se para acessar o portal escolar';
      if (authMode === 'forgot') return 'Enviaremos um link para seu email';
      if (authMode === 'reset') return 'Digite sua nova senha abaixo';
      return 'Acesse seu painel de controle';
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-blue-100 p-4 rounded-2xl text-blue-600">
                <GraduationCap size={48} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-2">
              {getTitle()}
            </h2>
            <p className="text-center text-gray-500 mb-8">
              {getSubtitle()}
            </p>

            {authMode === 'login' && (
              <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Atenção:</strong> Se você acabou de se cadastrar, verifique seu e-mail para confirmar sua conta antes de entrar.
                </p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Seu nome"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Eu sou...</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('aluno')}
                        className={`py-3 px-4 rounded-xl border font-medium transition-all ${
                          selectedRole === 'aluno'
                            ? 'bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Aluno
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRole('professor')}
                        className={`py-3 px-4 rounded-xl border font-medium transition-all ${
                          selectedRole === 'professor'
                            ? 'bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Professor
                      </button>
                    </div>
                  </div>
                </>
              )}
              
              {authMode !== 'reset' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="exemplo@escola.com"
                    required
                  />
                </div>
              )}

              {authMode !== 'forgot' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {authMode === 'reset' ? 'Nova Senha' : 'Senha'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              {authMode === 'login' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAuthMode('forgot')}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all transform active:scale-[0.98] shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {authLoading && <Loader2 className="animate-spin" size={20} />}
                {authMode === 'register' ? 'Cadastrar' : 
                 authMode === 'forgot' ? 'Enviar Link' :
                 authMode === 'reset' ? 'Atualizar Senha' : 'Entrar'}
              </button>
            </form>

            <div className="mt-8 text-center space-y-4">
              <button
                onClick={() => {
                  if (authMode === 'login') setAuthMode('register');
                  else setAuthMode('login');
                }}
                className="text-gray-600 font-medium hover:text-blue-600 transition-colors block w-full"
              >
                {authMode === 'login' ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login'}
              </button>
              
              {authMode !== 'login' && (
                <button
                  onClick={() => setAuthMode('login')}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Voltar para o login
                </button>
              )}
            </div>
            
            {authMode === 'login' && (
              <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-xs text-gray-400 text-center uppercase tracking-widest font-bold mb-2">Admin Demo</p>
                <p className="text-xs text-gray-500 text-center">Email: gcmdantas.pm@gmail.com</p>
                <p className="text-xs text-gray-500 text-center">Senha: 123456A</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col md:flex-row">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-gray-200 h-screen sticky top-0">
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="bg-blue-600 p-2 rounded-xl text-white">
            <GraduationCap size={28} />
          </div>
          <span className="text-xl font-bold tracking-tight">EduPortal</span>
        </div>

        <div className="p-6 flex-1 space-y-2">
          {profile?.role === 'professor' ? (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Administração</p>
              <SidebarItem 
                icon={<CalendarCheck size={20} />} 
                label="Frequência" 
                active={activeTab === 'attendance'} 
                onClick={() => setActiveTab('attendance')} 
              />
              <SidebarItem 
                icon={<Users size={20} />} 
                label="Alunos" 
                active={activeTab === 'students'} 
                onClick={() => setActiveTab('students')} 
              />
              <SidebarItem 
                icon={<Award size={20} />} 
                label="Lançar Notas" 
                active={activeTab === 'grades'} 
                onClick={() => setActiveTab('grades')} 
              />
              <SidebarItem 
                icon={<BarChart3 size={20} />} 
                label="Relatórios" 
                active={activeTab === 'reports'} 
                onClick={() => setActiveTab('reports')} 
              />
              <SidebarItem 
                icon={<User size={20} />} 
                label="Usuários" 
                active={activeTab === 'user-management'} 
                onClick={() => setActiveTab('user-management')} 
              />
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Meu Espaço</p>
              <SidebarItem 
                icon={<BarChart3 size={20} />} 
                label="Meu Desempenho" 
                active={activeTab === 'my-dashboard'} 
                onClick={() => setActiveTab('my-dashboard')} 
              />
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{profile?.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-all font-medium"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen pb-24 md:pb-8">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <GraduationCap className="text-blue-600" size={24} />
            <span className="font-bold">EduPortal</span>
          </div>
          <button onClick={handleLogout} className="text-red-500 p-2">
            <LogOut size={20} />
          </button>
        </header>

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {loading ? (
            <LoadingView message="Buscando dados..." />
          ) : profile?.role === 'aluno' && !profile.is_authorized ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <Clock className="text-blue-500 mb-4 animate-pulse" size={64} />
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Aguardando Autorização</h2>
              <p className="text-gray-600 max-w-md leading-relaxed">
                Sua conta foi criada com sucesso, mas ainda precisa ser autorizada por um administrador. 
                Por favor, aguarde a liberação do seu acesso.
              </p>
              <button 
                onClick={handleLogout}
                className="mt-8 text-blue-600 font-bold hover:underline"
              >
                Sair e verificar mais tarde
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'attendance' && <AttendanceView students={students} attendance={attendance} selectedDate={selectedDate} setSelectedDate={setSelectedDate} setAttendance={setAttendance} />}
              {activeTab === 'students' && <StudentsView students={students} setStudents={setStudents} />}
              {activeTab === 'grades' && <GradesView students={students} grades={grades} setGrades={setGrades} />}
              {activeTab === 'reports' && <ReportsView students={students} attendance={attendance} grades={grades} />}
              {activeTab === 'user-management' && <UserManagementView profiles={allProfiles} setProfiles={setAllProfiles} setStudents={setStudents} />}
              {activeTab === 'my-dashboard' && <StudentDashboard profile={profile} students={students} attendance={attendance} grades={grades} />}
            </>
          )}
        </div>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around z-30">
        {profile?.role === 'professor' ? (
          <>
            <MobileNavItem icon={<CalendarCheck size={20} />} active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} />
            <MobileNavItem icon={<Users size={20} />} active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
            <MobileNavItem icon={<Award size={20} />} active={activeTab === 'grades'} onClick={() => setActiveTab('grades')} />
            <MobileNavItem icon={<BarChart3 size={20} />} active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
            <MobileNavItem icon={<User size={20} />} active={activeTab === 'user-management'} onClick={() => setActiveTab('user-management')} />
          </>
        ) : (
          <MobileNavItem icon={<BarChart3 size={20} />} active={activeTab === 'my-dashboard'} onClick={() => setActiveTab('my-dashboard')} />
        )}
      </nav>
    </div>
  );
}

// --- Sub-Views ---

function SidebarItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 font-bold' 
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: { icon: any, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-2xl transition-all ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400'
      }`}
    >
      {icon}
    </button>
  );
}

function AttendanceView({ students, attendance, selectedDate, setSelectedDate, setAttendance }: any) {
  const handleAttendanceChange = async (studentId: string, status: AttendanceStatus) => {
    try {
      const supabase = getSupabase();
      const existingRecord = attendance.find((a: any) => a.student_id === studentId && a.date === selectedDate);
      
      if (existingRecord) {
        const { error } = await supabase
          .from('attendance')
          .update({ status })
          .eq('id', existingRecord.id);
        if (error) throw error;
        setAttendance(attendance.map((a: any) => a.id === existingRecord.id ? { ...a, status } : a));
      } else {
        const { data, error } = await supabase
          .from('attendance')
          .insert([{ student_id: studentId, date: selectedDate, status }])
          .select();
        if (error) throw error;
        if (data) setAttendance([...attendance, data[0]]);
      }
    } catch (e) { alert('Erro ao salvar'); }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Diário de Classe</h2>
          <p className="text-gray-500">Controle de presença diária dos alunos</p>
        </div>
        <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
          <Clock className="text-blue-600 ml-2" size={20} />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent border-none focus:ring-0 font-bold text-gray-700 outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {students.map((student: any) => {
          const record = attendance.find((a: any) => a.student_id === student.id && a.date === selectedDate);
          const status = record?.status || '';
          return (
            <div key={student.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{student.name}</h3>
                  <p className="text-sm text-gray-400">Matrícula: {student.matricula}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <StatusButton 
                  active={status === 'Presente'} 
                  color="green" 
                  label="P" 
                  fullLabel="Presente"
                  onClick={() => handleAttendanceChange(student.id, 'Presente')} 
                />
                <StatusButton 
                  active={status === 'Falta'} 
                  color="red" 
                  label="F" 
                  fullLabel="Falta"
                  onClick={() => handleAttendanceChange(student.id, 'Falta')} 
                />
                <StatusButton 
                  active={status === 'Justificado'} 
                  color="yellow" 
                  label="J" 
                  fullLabel="Justificado"
                  onClick={() => handleAttendanceChange(student.id, 'Justificado')} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusButton({ active, color, label, fullLabel, onClick }: any) {
  const colors: any = {
    green: active ? 'bg-green-500 text-white shadow-lg shadow-green-100' : 'bg-green-50 text-green-600 hover:bg-green-100',
    red: active ? 'bg-red-500 text-white shadow-lg shadow-red-100' : 'bg-red-50 text-red-600 hover:bg-red-100',
    yellow: active ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-100' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100',
  };

  return (
    <button
      onClick={onClick}
      className={`h-12 px-4 rounded-2xl font-bold transition-all flex items-center gap-2 ${colors[color]}`}
    >
      <span className="sm:hidden">{label}</span>
      <span className="hidden sm:inline">{fullLabel}</span>
    </button>
  );
}

function StudentsView({ students, setStudents }: any) {
  const [name, setName] = useState('');
  const [matricula, setMatricula] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('students').insert([{ name, matricula }]).select();
      if (error) throw error;
      if (data) {
        setStudents([...students, data[0]].sort((a, b) => a.name.localeCompare(b.name)));
        setName(''); setMatricula('');
      }
    } catch (e) { alert('Erro ao adicionar'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir aluno?')) return;
    try {
      const supabase = getSupabase();
      await supabase.from('students').delete().eq('id', id);
      setStudents(students.filter((s: any) => s.id !== id));
    } catch (e) { alert('Erro ao excluir'); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold mb-6">Cadastrar Aluno</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            placeholder="Nome Completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            required
          />
          <input
            placeholder="Matrícula"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            required
          />
          <button className="bg-blue-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-blue-100 flex items-center justify-center gap-2">
            <Plus size={20} /> Adicionar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {students.map((s: any) => (
          <div key={s.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                {s.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-sm text-gray-400">{s.matricula}</p>
              </div>
            </div>
            <button onClick={() => handleDelete(s.id)} className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GradesView({ students, grades, setGrades }: any) {
  const [selectedStudent, setSelectedStudent] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [term, setTerm] = useState('1º Bimestre');

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('grades').insert([{
        student_id: selectedStudent,
        subject,
        grade_value: parseFloat(grade),
        term
      }]).select();
      if (error) throw error;
      if (data) setGrades([...grades, data[0]]);
      setGrade('');
    } catch (e) { alert('Erro ao salvar nota'); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold mb-6">Lançamento de Notas</h2>
        <form onSubmit={handleAddGrade} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <select 
            value={selectedStudent} 
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none"
            required
          >
            <option value="">Selecionar Aluno</option>
            {students.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input 
            placeholder="Matéria (ex: Matemática)" 
            value={subject} 
            onChange={(e) => setSubject(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none"
            required
          />
          <input 
            type="number" step="0.1" min="0" max="10"
            placeholder="Nota (0-10)" 
            value={grade} 
            onChange={(e) => setGrade(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none"
            required
          />
          <select 
            value={term} 
            onChange={(e) => setTerm(e.target.value)}
            className="px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 outline-none"
          >
            <option>1º Bimestre</option>
            <option>2º Bimestre</option>
            <option>3º Bimestre</option>
            <option>4º Bimestre</option>
          </select>
          <button className="bg-blue-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-blue-100">
            Lançar Nota
          </button>
        </form>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-6 font-bold text-gray-500">Aluno</th>
              <th className="p-6 font-bold text-gray-500">Matéria</th>
              <th className="p-6 font-bold text-gray-500">Bimestre</th>
              <th className="p-6 font-bold text-gray-500 text-right">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {grades.map((g: any) => {
              const student = students.find((s: any) => s.id === g.student_id);
              return (
                <tr key={g.id} className="hover:bg-gray-50 transition-all">
                  <td className="p-6 font-medium">{student?.name || 'Excluído'}</td>
                  <td className="p-6">{g.subject}</td>
                  <td className="p-6">{g.term}</td>
                  <td className="p-6 text-right">
                    <span className={`font-bold px-3 py-1 rounded-lg ${g.grade_value >= 6 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {g.grade_value.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsView({ students, attendance, grades }: any) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold">Relatórios Gerais</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Alunos" value={students.length} icon={<Users />} color="blue" />
        <StatCard title="Total Presenças" value={attendance.filter((a: any) => a.status === 'Presente').length} icon={<CalendarCheck />} color="green" />
        <StatCard title="Média Geral" value={(grades.reduce((acc: number, g: any) => acc + g.grade_value, 0) / (grades.length || 1)).toFixed(1)} icon={<Award />} color="yellow" />
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold mb-6">Desempenho por Aluno</h3>
        <div className="space-y-6">
          {students.map((s: any) => {
            const studentAttendance = attendance.filter((a: any) => a.student_id === s.id && a.status !== '');
            const present = studentAttendance.filter((a: any) => a.status === 'Presente').length;
            const perc = studentAttendance.length ? Math.round((present / studentAttendance.length) * 100) : 0;
            
            const studentGrades = grades.filter((g: any) => g.student_id === s.id);
            const avg = studentGrades.length ? (studentGrades.reduce((acc: number, g: any) => acc + g.grade_value, 0) / studentGrades.length).toFixed(1) : 'N/A';

            return (
              <div key={s.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="font-bold">{s.name}</p>
                  <p className="text-xs text-gray-400">Freq: {perc}% | Média: {avg}</p>
                </div>
                <div className="flex gap-2">
                  <div className={`w-3 h-3 rounded-full ${perc >= 75 ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StudentDashboard({ profile, students, attendance, grades }: any) {
  // Encontra o registro de aluno vinculado a este perfil
  const student = students.find((s: any) => s.profile_id === profile.id);
  
  const handleExportPDF = () => {
    if (!student) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Relatório Escolar Individual', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Aluno: ${profile.full_name}`, 20, 35);
    doc.text(`Matrícula: ${student.matricula}`, 20, 42);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 20, 49);

    // Grades Table
    doc.setFontSize(16);
    doc.text('Notas por Matéria', 20, 65);
    
    const gradesData = grades
      .filter((g: any) => g.student_id === student.id)
      .map((g: any) => [g.subject, g.term, g.grade_value.toFixed(1)]);

    autoTable(doc, {
      startY: 70,
      head: [['Matéria', 'Bimestre', 'Nota']],
      body: gradesData.length ? gradesData : [['Nenhuma nota lançada', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    // Attendance Summary
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(16);
    doc.text('Resumo de Frequência', 20, finalY);

    const myAttendance = attendance.filter((a: any) => a.student_id === student.id);
    const present = myAttendance.filter((a: any) => a.status === 'Presente').length;
    const absent = myAttendance.filter((a: any) => a.status === 'Falta').length;
    const justified = myAttendance.filter((a: any) => a.status === 'Justificado').length;
    const perc = myAttendance.length ? Math.round((present / myAttendance.length) * 100) : 0;

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Total de Aulas', 'Presenças', 'Faltas', 'Justificativas', 'Frequência %']],
      body: [[myAttendance.length, present, absent, justified, `${perc}%`]],
      theme: 'plain',
      headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }
    });

    doc.save(`Relatorio_${profile.full_name.replace(/\s+/g, '_')}.pdf`);
  };

  if (!student) {
    return (
      <div className="text-center p-12 bg-white rounded-3xl border border-gray-100">
        <AlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold mb-2">Vínculo não encontrado</h2>
        <p className="text-gray-500">Seu perfil ainda não foi vinculado a um registro de aluno pelo professor.</p>
      </div>
    );
  }

  const myAttendance = attendance.filter((a: any) => a.student_id === student.id);
  const myGrades = grades.filter((g: any) => g.student_id === student.id);
  
  const present = myAttendance.filter((a: any) => a.status === 'Presente').length;
  const absent = myAttendance.filter((a: any) => a.status === 'Falta').length;
  const perc = myAttendance.length ? Math.round((present / myAttendance.length) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Olá, {profile.full_name}!</h2>
          <p className="opacity-80">Acompanhe suas notas e sua frequência escolar.</p>
        </div>
        <button 
          onClick={handleExportPDF}
          className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 border border-white/30"
        >
          <Download size={20} />
          Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Frequência" value={`${perc}%`} icon={<CalendarCheck />} color="blue" />
        <StatCard title="Faltas" value={absent} icon={<X />} color="red" />
        <StatCard title="Aulas Totais" value={myAttendance.length} icon={<Clock />} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Award className="text-yellow-500" /> Minhas Notas
          </h3>
          <div className="space-y-4">
            {myGrades.length === 0 ? <p className="text-gray-400">Nenhuma nota lançada.</p> : 
              myGrades.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <p className="font-bold">{g.subject}</p>
                    <p className="text-xs text-gray-400">{g.term}</p>
                  </div>
                  <span className={`text-xl font-bold ${g.grade_value >= 6 ? 'text-green-600' : 'text-red-600'}`}>
                    {g.grade_value.toFixed(1)}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Clock className="text-blue-500" /> Histórico de Presença
          </h3>
          <div className="space-y-3">
            {myAttendance.slice(-5).reverse().map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 border-b border-gray-50">
                <span className="text-gray-600 font-medium">{new Date(a.date).toLocaleDateString('pt-BR')}</span>
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                  a.status === 'Presente' ? 'bg-green-100 text-green-700' : 
                  a.status === 'Falta' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserManagementView({ profiles, setProfiles, setStudents }: any) {
  const handleAuthorize = async (id: string, authorize: boolean) => {
    try {
      const supabase = getSupabase();
      const profileToAuth = profiles.find((p: any) => p.id === id);
      
      const { error } = await supabase.from('profiles').update({ is_authorized: authorize }).eq('id', id);
      if (error) throw error;

      // Se for aluno e estiver sendo autorizado, garantir que existe um registro na tabela 'students'
      if (authorize && profileToAuth?.role === 'aluno') {
        const { data: existingStudent } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', id)
          .single();

        if (!existingStudent) {
          // Criar registro automático na tabela students
          await supabase.from('students').insert([{
            profile_id: id,
            name: profileToAuth.full_name,
            matricula: `MAT-${id.substring(0, 8).toUpperCase()}`
          }]);
        }
      }

      setProfiles(profiles.map((p: any) => p.id === id ? { ...p, is_authorized: authorize } : p));
      // Recarregar alunos para refletir o novo vínculo
      const { data: updatedStudents } = await supabase.from('students').select('*').order('name');
      if (updatedStudents) setStudents(updatedStudents);
      
    } catch (e) { alert('Erro ao atualizar status'); }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'aluno' | 'professor'>('aluno');

  const handleUpdateProfile = async (id: string) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('profiles').update({ 
        full_name: editName,
        role: editRole 
      }).eq('id', id);
      
      if (error) throw error;
      
      setProfiles(profiles.map((p: any) => p.id === id ? { ...p, full_name: editName, role: editRole } : p));
      setEditingId(null);
    } catch (e) { alert('Erro ao atualizar perfil'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este usuário permanentemente?')) return;
    try {
      const supabase = getSupabase();
      // Note: This only deletes from the profiles table. 
      // To delete from auth.users, you would need a service role or edge function.
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      setProfiles(profiles.filter((p: any) => p.id !== id));
    } catch (e) { alert('Erro ao excluir usuário'); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Usuários</h2>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500 font-bold uppercase">Autorizado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-xs text-gray-500 font-bold uppercase">Pendente</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {profiles.map((p: any) => (
          <div key={p.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 group">
            {editingId === p.id ? (
              <div className="flex-1 flex flex-col md:flex-row gap-4">
                <input 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 outline-none"
                  placeholder="Nome Completo"
                />
                <select 
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="px-4 py-2 rounded-xl border border-gray-200 outline-none"
                >
                  <option value="aluno">Aluno</option>
                  <option value="professor">Professor</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => handleUpdateProfile(p.id)} className="p-2 bg-green-500 text-white rounded-xl"><Check size={20} /></button>
                  <button onClick={() => setEditingId(null)} className="p-2 bg-gray-200 text-gray-600 rounded-xl"><X size={20} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${p.role === 'professor' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                    {p.full_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{p.full_name}</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${p.role === 'professor' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.role}
                      </span>
                      {!p.is_authorized && (
                        <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">Pendente</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{p.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setEditingId(p.id);
                      setEditName(p.full_name);
                      setEditRole(p.role);
                    }}
                    className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all"
                    title="Editar Perfil"
                  >
                    <Edit2 size={20} />
                  </button>

                  {p.role !== 'professor' && (
                    <>
                      {p.is_authorized ? (
                        <button 
                          onClick={() => handleAuthorize(p.id, false)}
                          className="px-4 py-2 bg-yellow-50 text-yellow-600 rounded-xl font-bold text-sm hover:bg-yellow-100 transition-all"
                        >
                          Bloquear
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleAuthorize(p.id, true)}
                          className="px-4 py-2 bg-green-50 text-green-600 rounded-xl font-bold text-sm hover:bg-green-100 transition-all"
                        >
                          Autorizar
                        </button>
                      )}
                    </>
                  )}
                  
                  {p.email !== 'gcmdantas.pm@gmail.com' && (
                    <button 
                      onClick={() => handleDelete(p.id)}
                      className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                      title="Excluir Usuário"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  const colors: any = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    yellow: 'text-yellow-600 bg-yellow-50',
  };
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6">
      <div className={`p-4 rounded-2xl ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-black text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function LoadingView({ message }: { message: string }) {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-gray-600 font-medium">{message}</p>
        {showRetry && (
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 text-sm text-blue-600 font-bold hover:underline"
          >
            Demorando muito? Clique para recarregar
          </button>
        )}
      </div>
    </div>
  );
}

function ConfigMissingView() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-red-100">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="bg-red-50 p-4 rounded-full text-red-500">
            <AlertCircle size={48} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Configuração Pendente</h2>
          <p className="text-gray-600">
            As variáveis do Supabase não foram configuradas. 
            Adicione <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_URL</code> e <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> nos <strong>Secrets</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
