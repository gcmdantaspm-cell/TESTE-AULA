
-- 1. Tabela de Perfis (Profiles) para distinguir Professor de Aluno
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('professor', 'aluno')) DEFAULT 'aluno',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Alunos (Students) - Vinculada ao Profile se o aluno tiver login
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Tabela de Frequência (Attendance)
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('Presente', 'Falta', 'Justificado')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(student_id, date)
);

-- 4. Tabela de Notas (Grades)
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL, -- Matéria
  grade_value NUMERIC(4,2) CHECK (grade_value >= 0 AND grade_value <= 10),
  term TEXT, -- Bimestre/Trimestre
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE SEGURANÇA (EXEMPLO BÁSICO)

-- Perfis: Usuário pode ver seu próprio perfil, Professor pode ver todos
CREATE POLICY "Profiles access" ON profiles 
  FOR SELECT USING (auth.uid() = id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor');

-- Alunos: Professor gerencia tudo, Aluno vê apenas seu próprio registro
CREATE POLICY "Students access" ON students
  FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR profile_id = auth.uid());

-- Frequência: Professor gerencia tudo, Aluno vê apenas a sua
CREATE POLICY "Attendance access" ON attendance
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR 
    student_id IN (SELECT id FROM students WHERE profile_id = auth.uid())
  );

-- Notas: Professor gerencia tudo, Aluno vê apenas a sua
CREATE POLICY "Grades access" ON grades
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'professor' OR 
    student_id IN (SELECT id FROM students WHERE profile_id = auth.uid())
  );
