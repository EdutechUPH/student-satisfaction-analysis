"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Papa, { ParseError, ParseResult } from 'papaparse'; // Import ParseResult

// --- Type Definitions ---
type Institution = {
  id: string;
  name:string;
};

type Faculty = {
  id: string;
  name: string;
  institution_id: string;
  institutions: { name: string } | null;
};

type StudyProgram = {
  id: string;
  name: string;
  faculty_id: string;
  faculties: {
    name: string;
    institution_id: string;
    institutions: { name: string; } | null;
  } | null;
};

type CsvRow = {
    Institusi: string;
    Fakultas: string;
    Prodi: string;
};

export default function StructurePage() {
  // --- Data State ---
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [studyPrograms, setStudyPrograms] = useState<StudyProgram[]>([]);

  // --- Create Form State ---
  const [newInstitutionName, setNewInstitutionName] = useState("");
  const [newFacultyName, setNewFacultyName] = useState("");
  const [newFacultyInstitution, setNewFacultyInstitution] = useState("");
  const [newProgramName, setNewProgramName] = useState("");
  const [newProgramFaculty, setNewProgramFaculty] = useState("");

  // --- Edit Form State ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingParentId, setEditingParentId] = useState("");

  // --- CSV Import State ---
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // --- DATA FETCHING ---
  const fetchData = async () => {
    const [instRes, facRes, progRes] = await Promise.all([
      supabase.from("institutions").select("id, name").order("name"),
      supabase.from("faculties").select("*, institutions(name)").order("name"),
      supabase.from("study_programs").select("*, faculties(*, institutions(*))").order("name")
    ]);
    if (instRes.data) setInstitutions(instRes.data);
    if (facRes.data) setFaculties(facRes.data as Faculty[]);
    if (progRes.data) setStudyPrograms(progRes.data as StudyProgram[]);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingParentId("");
  };
  
  // --- GENERIC CRUD Handlers ---
  const createHandler = async (tableName: string, value: object) => {
    const { error } = await supabase.from(tableName).insert(value);
    if (error) alert("Error: " + error.message); else fetchData();
  };
  
  const updateHandler = async (tableName: string, value: object) => {
    if (!editingId) return;
    const { error } = await supabase.from(tableName).update(value).match({ id: editingId });
    if (error) alert("Error: " + error.message); else {
      handleCancelEdit();
      fetchData();
    }
  };

  const deleteHandler = async (tableName: string, id: string, message: string) => {
    if (window.confirm(message)) {
      const { error } = await supabase.from(tableName).delete().match({ id });
      if (error) alert("Error: " + error.message); else fetchData();
    }
  };

  // --- FIX: UPDATED CSV Import Handler to use FileReader ---
  const handleFileImport = () => {
    if (!csvFile) {
      alert("Please select a CSV file first.");
      return;
    }
    setIsImporting(true);

    const reader = new FileReader();

    reader.onload = async (event) => {
        const csvText = event.target?.result as string;
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: ParseResult<CsvRow>) => {
                const rows = results.data;
                let newItemsCount = 0;
                
                const localInstitutions = [...institutions];
                const localFaculties = [...faculties];
                const localStudyPrograms = [...studyPrograms];

                for (const row of rows) {
                    try {
                        const instName = row.Institusi?.trim();
                        if (!instName) continue;

                        let institution = localInstitutions.find(i => i.name === instName);
                        if (!institution) {
                            const { data, error } = await supabase.from('institutions').insert({ name: instName }).select().single();
                            if (error) throw error;
                            institution = data;
                            localInstitutions.push(institution);
                        }

                        const facName = row.Fakultas?.trim();
                        if (!facName) continue;

                        let faculty = localFaculties.find(f => f.name === facName && f.institution_id === institution.id);
                        if (!faculty) {
                            const { data, error } = await supabase.from('faculties').insert({ name: facName, institution_id: institution.id }).select('*, institutions(name)').single();
                            if (error) throw error;
                            faculty = data as Faculty;
                            localFaculties.push(faculty);
                        }

                        const progName = row.Prodi?.trim();
                        if (!progName) continue;

                        const program = localStudyPrograms.find(p => p.name === progName && p.faculty_id === faculty.id);
                        if (!program) {
                            const { data, error } = await supabase.from('study_programs').insert({ name: progName, faculty_id: faculty.id }).select().single();
                            if (error) throw error;
                            localStudyPrograms.push(data as StudyProgram);
                            newItemsCount++;
                        }
                    } catch (error) {
                        let errorMessage = "An unknown error occurred.";
                        if (error instanceof Error) {
                            errorMessage = error.message;
                        }
                        alert(`An error occurred during import: ${errorMessage}`);
                        setIsImporting(false);
                        return;
                    }
                }
                
                setIsImporting(false);
                alert(`Import complete! ${newItemsCount} new item(s) were processed.`);
                fetchData();
            },
            error: (error: ParseError) => {
                console.error("Error parsing CSV:", error);
                alert("An error occurred while parsing the CSV file.");
                setIsImporting(false);
            },
        });
    };

    reader.readAsText(csvFile);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Manage University Structure</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 border-l-4 border-purple-500">
        <h2 className="text-xl font-semibold mb-4">Bulk Import from CSV</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload a CSV file with headers: <strong>Institusi, Fakultas, Prodi</strong>. The system will add any new entries.
        </p>
        <div className="flex gap-2">
            <input 
                type="file" 
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files ? e.target.files[0] : null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
            />
            <button onClick={handleFileImport} className="btn-primary bg-purple-600 hover:bg-purple-800" disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import Data'}
            </button>
        </div>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Institutions</h2>
        <form onSubmit={(e) => { e.preventDefault(); createHandler('institutions', { name: newInstitutionName }); setNewInstitutionName(""); }} className="flex gap-2 mb-6">
          <input type="text" value={newInstitutionName} onChange={(e) => setNewInstitutionName(e.target.value)} placeholder="New institution name" className="flex-grow input-class" />
          <button type="submit" className="btn-primary">Add</button>
        </form>
        <ul className="space-y-2">
          {institutions.map((inst) => (
            <li key={inst.id} className="li-class">
              {editingId === inst.id ? (
                <div className="flex justify-between items-center w-full gap-2">
                  <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-grow input-class"/>
                  <button onClick={() => updateHandler('institutions', { name: editingName })} className="btn-primary bg-green-500 hover:bg-green-700">Save</button>
                  <button onClick={handleCancelEdit} className="btn-danger bg-gray-500 hover:bg-gray-700">Cancel</button>
                </div>
              ) : (
                <div className="flex justify-between items-center w-full">
                  <span>{inst.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(inst.id); setEditingName(inst.name); }} className="btn-danger bg-yellow-500 hover:bg-yellow-700">Edit</button>
                    <button onClick={() => deleteHandler('institutions', inst.id, "Are you sure? This will delete all related faculties and programs.")} className="btn-danger">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Faculties</h2>
        <form onSubmit={(e) => { e.preventDefault(); createHandler('faculties', { name: newFacultyName, institution_id: newFacultyInstitution }); setNewFacultyName(""); setNewFacultyInstitution(""); }} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
          <input type="text" value={newFacultyName} onChange={(e) => setNewFacultyName(e.target.value)} placeholder="New faculty name" className="md:col-span-2 input-class" />
          <select value={newFacultyInstitution} onChange={(e) => setNewFacultyInstitution(e.target.value)} className="input-class" required><option value="" disabled>Select Institution</option>{institutions.map((inst) => (<option key={inst.id} value={inst.id}>{inst.name}</option>))}</select>
          <button type="submit" className="md:col-span-3 btn-primary">Add Faculty</button>
        </form>
        <ul className="space-y-2">
          {faculties.map((fac) => (
            <li key={fac.id} className="li-class">
              {editingId === fac.id ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full items-center">
                  <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} className="md:col-span-2 input-class" />
                  <select value={editingParentId} onChange={(e) => setEditingParentId(e.target.value)} className="input-class"><option value="" disabled>Select Institution</option>{institutions.map((inst) => (<option key={inst.id} value={inst.id}>{inst.name}</option>))}</select>
                  <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                    <button onClick={() => updateHandler('faculties', { name: editingName, institution_id: editingParentId })} className="btn-primary bg-green-500 hover:bg-green-700">Save</button>
                    <button onClick={handleCancelEdit} className="btn-danger bg-gray-500 hover:bg-gray-700">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center w-full">
                  <span>{fac.name} <span className="text-gray-500 text-sm">({fac.institutions?.name})</span></span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(fac.id); setEditingName(fac.name); setEditingParentId(fac.institution_id); }} className="btn-danger bg-yellow-500 hover:bg-yellow-700">Edit</button>
                    <button onClick={() => deleteHandler('faculties', fac.id, "Are you sure? This will delete all related study programs.")} className="btn-danger">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Study Programs</h2>
        <form onSubmit={(e) => { e.preventDefault(); createHandler('study_programs', { name: newProgramName, faculty_id: newProgramFaculty }); setNewProgramName(""); setNewProgramFaculty(""); }} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
            <input type="text" value={newProgramName} onChange={(e) => setNewProgramName(e.target.value)} placeholder="New program name" className="md:col-span-2 input-class"/>
            <select value={newProgramFaculty} onChange={(e) => setNewProgramFaculty(e.target.value)} className="input-class" required><option value="" disabled>Select Faculty</option>{faculties.map((fac) => (<option key={fac.id} value={fac.id}>{fac.name} ({fac.institutions?.name})</option>))}</select>
            <button type="submit" className="md:col-span-3 btn-primary">Add Program</button>
        </form>
        <ul className="space-y-2">
          {studyPrograms.map((prog) => (
            <li key={prog.id} className="li-class">
                {editingId === prog.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full items-center">
                    <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} className="md:col-span-2 input-class"/>
                    <select value={editingParentId} onChange={(e) => setEditingParentId(e.target.value)} className="input-class"><option value="" disabled>Select Faculty</option>{faculties.map((fac) => (<option key={fac.id} value={fac.id}>{fac.name} ({fac.institutions?.name})</option>))}</select>
                    <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                      <button onClick={() => updateHandler('study_programs', { name: editingName, faculty_id: editingParentId })} className="btn-primary bg-green-500 hover:bg-green-700">Save</button>
                      <button onClick={handleCancelEdit} className="btn-danger bg-gray-500 hover:bg-gray-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center w-full">
                    <span>{prog.name} <span className="text-gray-500 text-sm">({prog.faculties?.name} - {prog.faculties?.institutions?.name})</span></span>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(prog.id); setEditingName(prog.name); setEditingParentId(prog.faculty_id); }} className="btn-danger bg-yellow-500 hover:bg-yellow-700">Edit</button>
                      <button onClick={() => deleteHandler('study_programs', prog.id, "Are you sure?")} className="btn-danger">Delete</button>
                    </div>
                  </div>
                )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}