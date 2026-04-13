-- 1. APAGAR TABELAS EXISTENTES (Para garantir que tudo seja recriado limpo)
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. CRIAR TABELA DE PERFIS (Profiles)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('professor', 'aluno')) DEFAULT 'aluno',
  is_authorized BOOLEAN DEFAULT false, -- Novo campo para autorização
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. CRIAR TABELA DE ALUNOS (Students)
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. CRIAR TABELA DE FREQUÊNCIA (Attendance)
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('Presente', 'Falta', 'Justificado')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, date)
);

-- 5. CRIAR TABELA DE NOTAS (Grades)
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  grade_value NUMERIC(4,2) CHECK (grade_value >= 0 AND grade_value <= 10),
  term TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. HABILITAR RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE SEGURANÇA CORRIGIDAS

-- Perfis: Usuário vê o seu, Professor vê todos
CREATE POLICY "Profiles select" ON profiles FOR SELECT USING (
  auth.uid() = id OR 
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor'
);

CREATE POLICY "Profiles insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles update" ON profiles FOR UPDATE USING (
  auth.uid() = id OR 
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor'
);

CREATE POLICY "Profiles delete" ON profiles FOR DELETE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor'
);

-- Alunos: Professor gerencia tudo, Aluno vê apenas seu próprio registro (se autorizado)
CREATE POLICY "Students access" ON students
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR 
    (profile_id = auth.uid() AND (SELECT is_authorized FROM profiles WHERE id = auth.uid()) = true)
  );

-- Frequência: Professor gerencia tudo, Aluno vê apenas a sua (se autorizado)
CREATE POLICY "Attendance access" ON attendance
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR 
    (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()) AND (SELECT is_authorized FROM profiles WHERE id = auth.uid()) = true)
  );

-- Notas: Professor gerencia tudo, Aluno vê apenas a sua (se autorizado)
CREATE POLICY "Grades access" ON grades
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR 
    (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()) AND (SELECT is_authorized FROM profiles WHERE id = auth.uid()) = true)
  );
