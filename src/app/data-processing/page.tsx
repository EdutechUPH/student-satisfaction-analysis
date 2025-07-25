"use client";

import React, { useEffect, useState } from 'react'; // FIX: Imported React for event types
import Papa, { ParseError, ParseResult } from 'papaparse'; // FIX: Imported specific types from papaparse
import { supabase } from '@/lib/supabase';
import { saveVerifiedData } from '@/lib/data-importer';

// --- Type Definitions ---
export type ParentCategory = { id: string; name: string; description: string | null };
export type SubCategory = { id: string; name: string; parent_category_id: string; parent_categories: { name: string } | null };
export type StudyProgram = { id: string; name: string; faculty_id: string; faculties: { name: string; institution_id: string; institutions: { name: string; } | null; } | null; };

// 1️⃣ UPDATED TYPE DEFINITION
export type RawCsvRow = {
    No: string;
    Institusi: string;
    Fakultas: string;
    /** cleaned file uses “Prodi”, original uses “Program Studi” */
    Prodi?: string;
    "Program Studi"?: string;
    "Learning Experience_comment": string;
    ai_subcategories?: string;
    is_suggestion?: boolean | string;
    [key: string]: string | number | boolean | undefined | null;
};

// FIX: Made this type more specific to avoid 'any'
export type VerifiedRow = {
    No: string;
    Prodi: string;
    "Learning Experience_comment": string;
    sentiment: "Positive" | "Negative" | "Neutral";
    ai_subcategories: string[];
    human_selected_categories: string[] | null;
    is_verified: boolean;
    is_suggestion: boolean;
    [key: string]: unknown; // Allow other properties but avoid 'any'
};

export default function DataProcessingPage() {
    // --- State ---
    const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
    const [allStudyPrograms, setAllStudyPrograms] = useState<StudyProgram[]>([]);
    const [verifiedData, setVerifiedData] = useState<VerifiedRow[]>([]);
    const [fileName, setFileName] = useState("");
    
    // --- State for Forms ---
    const [newParentCategoryName, setNewParentCategoryName] = useState("");
    const [newSubCategoryName, setNewSubCategoryName] = useState("");
    const [selectedParent, setSelectedParent] = useState("");
    
    // --- State for Editing ---
    const [editingParentId, setEditingParentId] = useState<string | null>(null);
    const [editingParentName, setEditingParentName] = useState("");
    const [editingSubId, setEditingSubId] = useState<string | null>(null);
    const [editingSubName, setEditingSubName] = useState("");
    const [editingSubParentId, setEditingSubParentId] = useState("");

    // --- State for page functionality ---
    const [isSaving, setIsSaving] = useState(false);
    const [mismatchedPrograms, setMismatchedPrograms] = useState<string[]>([]);
    const [checkClicked, setCheckClicked] = useState(false);

    // --- DATA FETCHING ---
    const fetchData = async () => {
        const [pCatRes, sCatRes, progRes] = await Promise.all([
            supabase.from('parent_categories').select('*').order('name'),
            supabase.from('sub_categories').select('*, parent_categories(name)').order('name'),
            supabase.from('study_programs').select('*, faculties(*, institutions(*))').order('name')
        ]);

        if (pCatRes.data) setParentCategories(pCatRes.data);
        if (sCatRes.data) setSubCategories(sCatRes.data as SubCategory[]);
        if (progRes.data) setAllStudyPrograms(progRes.data as StudyProgram[]);
    };

    useEffect(() => { fetchData(); }, []);
    
    // --- CATEGORY CRUD HANDLERS ---
    const handleCreateParentCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newParentCategoryName.trim() === "") return;
        const { error } = await supabase.from('parent_categories').insert({ name: newParentCategoryName.trim() });
        if (error) { alert("Error: " + error.message); } 
        else { setNewParentCategoryName(""); fetchData(); }
    };

    const handleCreateSubCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newSubCategoryName.trim() === "" || !selectedParent) {
            alert("Please provide a name and select a parent category.");
            return;
        }
        const { error } = await supabase.from('sub_categories').insert({ name: newSubCategoryName.trim(), parent_category_id: selectedParent });
        if (error) { alert("Error: " + error.message); } 
        else { setNewSubCategoryName(""); setSelectedParent(""); fetchData(); }
    };
    
    const handleUpdateParentCategory = async () => {
        if (!editingParentId || editingParentName.trim() === "") return;
        const { error } = await supabase.from('parent_categories').update({ name: editingParentName.trim() }).match({ id: editingParentId });
        if (error) { alert("Error: " + error.message); } 
        else { setEditingParentId(null); setEditingParentName(""); fetchData(); }
    };

    const handleUpdateSubCategory = async () => {
        if (!editingSubId || editingSubName.trim() === "" || !editingSubParentId) return;
        const { error } = await supabase.from('sub_categories').update({ name: editingSubName.trim(), parent_category_id: editingSubParentId }).match({ id: editingSubId });
        if (error) { alert("Error: " + error.message); } 
        else { setEditingSubId(null); setEditingSubName(""); setEditingSubParentId(""); fetchData(); }
    };

    const handleDeleteParentCategory = async (id: string) => {
        if (window.confirm("Are you sure? Deleting a parent category will also delete all of its subcategories.")) {
            const { error } = await supabase.from('parent_categories').delete().match({ id });
            if (error) { alert("Error: " + error.message); } 
            else { fetchData(); }
        }
    };

    const handleDeleteSubCategory = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this subcategory?")) {
            const { error } = await supabase.from('sub_categories').delete().match({ id });
            if (error) { alert("Error: " + error.message); } 
            else { fetchData(); }
        }
    };
    
    // --- FILE HANDLING & VERIFICATION HANDLERS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setVerifiedData([]);
        setMismatchedPrograms([]);
        setCheckClicked(false);
        
        // 2️⃣ UPDATED PARSING LOGIC
        Papa.parse(file, {
            header: true,
            skipEmptyLines: "greedy",     // handles blank lines
            delimiter: "",                // auto-detects comma or tab
            dynamicTyping: true,
            complete: (results: ParseResult<RawCsvRow>) => {
                const parsedData = results.data;

                const structuredData = parsedData
                    .filter(r => r && typeof r === "object" && r.No)
                    .map(row => {
                        // pick whichever column exists
                        const prodiName = row.Prodi ?? row["Program Studi"] ?? "";
                        let aiSub: string[] = [];
                        try { aiSub = JSON.parse(row.ai_subcategories || "[]"); } catch {/* ignore */}
                        return {
                            ...row,
                            Prodi: prodiName,
                            ai_subcategories: aiSub,
                            human_selected_categories: null,
                            is_verified: false,
                            is_suggestion:
                                row.is_suggestion === true ||
                                String(row.is_suggestion).toLowerCase() === "true",
                        };
                    });

                if (results.errors.length) {
                    alert(
                        `Warning: ${results.errors.length} rows had parsing issues. Check your file if data seems missing.`
                    );
                }
                setVerifiedData(structuredData as VerifiedRow[]);
            },
        });
    };
    
    const handleSubcategoryToggle = (rowIndex: number, subCategoryName: string) => {
        setVerifiedData(prevData => {
            const newData = [...prevData];
            const row = newData[rowIndex];
            const currentSelection = row.human_selected_categories ?? row.ai_subcategories;
            const newSelection = currentSelection.includes(subCategoryName) ? currentSelection.filter(c => c !== subCategoryName) : [...currentSelection, subCategoryName];
            newData[rowIndex] = { ...row, human_selected_categories: newSelection };
            return newData;
        });
    };
    
    const handleSentimentChange = (rowIndex: number, newSentiment: "Positive" | "Negative" | "Neutral") => {
        setVerifiedData(prevData => {
            const newData = [...prevData];
            newData[rowIndex] = { ...newData[rowIndex], sentiment: newSentiment };
            return newData;
        });
    };

    const handleSuggestionToggle = (rowIndex: number) => {
        setVerifiedData(prevData => {
            const newData = [...prevData];
            const currentStatus = newData[rowIndex].is_suggestion;
            newData[rowIndex] = { ...newData[rowIndex], is_suggestion: !currentStatus };
            return newData;
        });
    };

    // --- SAVE & CHECK HANDLERS ---
    const handleSave = async () => {
        setIsSaving(true);
        const result = await saveVerifiedData(verifiedData, allStudyPrograms);
        alert(result.message);
        if (result.success) {
            setVerifiedData([]); setFileName(""); setMismatchedPrograms([]); setCheckClicked(false);
        }
        setIsSaving(false);
    };

    const checkMismatches = () => {
        if (verifiedData.length === 0) { alert("Please upload a CSV file first."); return; }
        setCheckClicked(true);
        const normalizeString = (str: string | null | undefined): string => {
            if (!str) return "";
            return str.toLowerCase().replace(/[^a-z0-9]/g, '');
        };
        const dbProgramNames = new Set(allStudyPrograms.map(p => normalizeString(p.name)));
        const mismatched = new Set<string>();
        for (const row of verifiedData) {
            const csvProgramName = row.Prodi;
            const normalizedCsvName = normalizeString(csvProgramName);
            if (normalizedCsvName && !dbProgramNames.has(normalizedCsvName)) {
                mismatched.add(csvProgramName);
            }
        }
        setMismatchedPrograms(Array.from(mismatched));
    };

    return (
        <div className="p-4 md:p-8 max-w-full mx-auto space-y-8">
            <h1 className="text-3xl font-bold">Survey Data Processing</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white shadow-md rounded-lg p-6 border-l-4 border-blue-500 col-span-1 lg:col-span-2">
                    <h2 className="text-xl font-semibold mb-4">Manage Master Category List</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-bold text-lg mb-2">Parent Categories</h3>
                            <form onSubmit={handleCreateParentCategory} className="flex gap-2 mb-4">
                                <input type="text" value={newParentCategoryName} onChange={(e) => setNewParentCategoryName(e.target.value)} placeholder="New parent category" className="flex-grow input-class"/>
                                <button type="submit" className="btn-primary">Add</button>
                            </form>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                {parentCategories.map(cat => (
                                    <div key={cat.id} className="li-class flex justify-between items-center">
                                        {editingParentId === cat.id ? (
                                            <>
                                                <input type="text" value={editingParentName} onChange={(e) => setEditingParentName(e.target.value)} className="flex-grow input-class" />
                                                <div className="flex gap-1 ml-2">
                                                    <button onClick={handleUpdateParentCategory} className="btn-primary bg-green-500 hover:bg-green-700 text-sm py-1">Save</button>
                                                    <button onClick={() => setEditingParentId(null)} className="btn-danger bg-gray-500 hover:bg-gray-700 text-sm py-1">X</button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span>{cat.name}</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setEditingParentId(cat.id); setEditingParentName(cat.name); }} className="btn-danger bg-yellow-500 hover:bg-yellow-700">Edit</button>
                                                    <button onClick={() => handleDeleteParentCategory(cat.id)} className="btn-danger">Delete</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-2">Subcategories</h3>
                            <form onSubmit={handleCreateSubCategory} className="space-y-2 mb-4">
                                <input type="text" value={newSubCategoryName} onChange={(e) => setNewSubCategoryName(e.target.value)} placeholder="New subcategory name" className="w-full input-class"/>
                                <select value={selectedParent} onChange={(e) => setSelectedParent(e.target.value)} className="w-full input-class" required>
                                    <option value="" disabled>Select a Parent Category</option>
                                    {parentCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                </select>
                                <button type="submit" className="btn-primary w-full">Add Subcategory</button>
                            </form>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                               {subCategories.map(cat => (
                                    <div key={cat.id} className="li-class">
                                        {editingSubId === cat.id ? (
                                            <div className="space-y-2">
                                                <input type="text" value={editingSubName} onChange={(e) => setEditingSubName(e.target.value)} className="w-full input-class" />
                                                <select value={editingSubParentId} onChange={(e) => setEditingSubParentId(e.target.value)} className="w-full input-class">
                                                    {parentCategories.map(pCat => <option key={pCat.id} value={pCat.id}>{pCat.name}</option>)}
                                                </select>
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={handleUpdateSubCategory} className="btn-primary bg-green-500 hover:bg-green-700 text-sm py-1">Save</button>
                                                    <button onClick={() => setEditingSubId(null)} className="btn-danger bg-gray-500 hover:bg-gray-700 text-sm py-1">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-center">
                                                <span>{cat.name} <span className="text-xs text-gray-500">({cat.parent_categories?.name})</span></span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setEditingSubId(cat.id); setEditingSubName(cat.name); setEditingSubParentId(cat.parent_category_id); }} className="btn-danger bg-yellow-500 hover:bg-yellow-700">Edit</button>
                                                    <button onClick={() => handleDeleteSubCategory(cat.id)} className="btn-danger">Delete</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white shadow-md rounded-lg p-6 border-l-4 border-green-500">
                    <h2 className="text-xl font-semibold mb-4">Upload & Check Data</h2>
                    <p className="text-sm text-gray-600 mb-4">Upload your file, then check for mismatches before saving.</p>
                    <div className="flex items-center gap-4">
                        <label className="btn-primary bg-green-600 hover:bg-green-800 cursor-pointer">
                            <span>Choose File</span>
                            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileChange} className="hidden"/>
                        </label>
                        {fileName && <span className="text-gray-700">{fileName}</span>}
                    </div>
                    <div className="mt-4">
                        <button onClick={checkMismatches} className="btn-primary bg-yellow-500 hover:bg-yellow-700 w-full" disabled={!fileName}>
                            Check for Mismatches
                        </button>
                    </div>
                </div>

                <div className="bg-white shadow-md rounded-lg p-6 border-l-4 border-purple-500">
                  <h2 className="text-xl font-semibold mb-4">AI Category Ideas</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Let the AI scan the uploaded comments and propose new Category / Subcategory names.
                  </p>
                  <button
                    className="btn-primary w-full bg-purple-600 hover:bg-purple-800 disabled:bg-gray-300"
                    disabled={verifiedData.length === 0}
                    onClick={async () => {
                      const comments = verifiedData
                        .slice(0, 50)
                        .map(r => r["Learning Experience_comment"])
                        .filter(Boolean);

                      if (comments.length === 0) {
                        alert("Upload a CSV first, then click again.");
                        return;
                      }

                      try {
                        const res = await fetch("/api/suggest-categories", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ comments })
                        });
                        const json = await res.json();
                        alert(json.text ?? "No reply from AI");
                      } catch (err) {
                        console.error(err);
                        alert("Failed to contact AI service.");
                      }
                    }}
                  >
                    Ask AI for Category Ideas
                  </button>
                </div>
            </div>
            
            {checkClicked && mismatchedPrograms.length > 0 && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert">
                    <p className="font-bold">Mismatched Program Names Found!</p>
                    <p>The following &apos;Prodi&apos; names from your file do not match any entry in the database. Please correct them in your file or add them on the &apos;Manage University Structure&apos; page:</p>
                    <ul className="list-disc list-inside mt-2">
                        {mismatchedPrograms.map(name => <li key={name}>&quot;{name}&quot;</li>)}
                    </ul>
                </div>
            )}
            {checkClicked && mismatchedPrograms.length === 0 && fileName && (
                 <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-lg" role="alert">
                    <p className="font-bold">All Program Names Match!</p>
                    <p>It looks like all &apos;Prodi&apos; names in the file have a match in the database. You are ready to save.</p>
                </div>
            )}
            
            {verifiedData.length > 0 && (
                <div className="bg-white shadow-md rounded-lg mt-8">
                    <div className="p-6"><h2 className="text-xl font-semibold">Step 2: Verify Data</h2></div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comment</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment & Suggestion</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categories</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {verifiedData.map((row, rowIndex) => {
                                    const displayCategories = row.human_selected_categories ?? row.ai_subcategories;
                                    const isHumanVerified = row.human_selected_categories !== null;

                                    return (
                                        <tr key={rowIndex}>
                                            <td className="px-4 py-4 align-top">
                                                <p className="whitespace-pre-wrap max-w-md italic text-gray-700">&quot;{row['Learning Experience_comment']}&quot;</p>
                                                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                                                    <span className="font-semibold">AI Reasoning:</span> {String(row.ai_reasoning ?? '')}
                                                </p>
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                 <div className="flex flex-col gap-1">
                                                     {(["Positive", "Negative", "Neutral"] as const).map(senti => (
                                                         <button key={senti} onClick={() => handleSentimentChange(rowIndex, senti)}
                                                                 className={`px-2 py-1 rounded text-xs font-semibold w-24 text-center border-2 ${
                                                                     row.sentiment === senti 
                                                                         ? (senti === 'Positive' ? 'bg-green-500 text-white border-green-500' 
                                                                         : senti === 'Negative' ? 'bg-red-500 text-white border-red-500' 
                                                                         : 'bg-gray-500 text-white border-gray-500')
                                                                         : 'bg-transparent hover:bg-gray-100'
                                                                 }`}
                                                         >{senti}</button>
                                                     ))}
                                                 </div>
                                                 <div className="mt-4 pt-4 border-t">
                                                     <label className="flex items-center gap-2 cursor-pointer">
                                                         <input 
                                                             type="checkbox" 
                                                             checked={row.is_suggestion}
                                                             onChange={() => handleSuggestionToggle(rowIndex)}
                                                             className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                         />
                                                         <span className="font-semibold">Is a Suggestion</span>
                                                     </label>
                                                 </div>
                                            </td>
                                            <td className="px-4 py-4 max-w-lg align-top">
                                                {parentCategories.map(pCat => (
                                                    <div key={pCat.id} className="mb-3 last:mb-0">
                                                        <h4 className="font-bold text-xs uppercase text-gray-600">{pCat.name}</h4>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {subCategories.filter(sCat => sCat.parent_category_id === pCat.id).map(sCat => {
                                                                const isSelected = displayCategories.includes(sCat.name);
                                                                const bgColor = isSelected 
                                                                    ? (isHumanVerified ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800')
                                                                    : 'bg-gray-200 text-gray-800';
                                                                return (
                                                                    <button key={sCat.id} onClick={() => handleSubcategoryToggle(rowIndex, sCat.name)}
                                                                            className={`px-2 py-1 rounded-full font-semibold text-xs ${bgColor}`}
                                                                    >
                                                                        {sCat.name}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-6 border-t border-gray-200 flex justify-end">
                        <button onClick={handleSave} disabled={isSaving} className="btn-primary bg-green-600 hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold py-3 px-8 text-lg">
                            {isSaving ? 'Saving...' : 'Save Verified Data to Database'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}