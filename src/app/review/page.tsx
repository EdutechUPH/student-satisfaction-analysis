"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Type Definitions ---
type ParentCategory = { id: string; name: string; };
type SubCategory = { id: string; name: string; parent_category_id: string; };
type Faculty = { id: string; name: string; };
type StudyProgram = { id: string; name: string; faculty_id: string; };
type SurveyResponse = {
    id: string;
    original_survey_row_id: string;
    comment_text: string;
    ai_reasoning: string;
    sentiment: "Positive" | "Negative" | "Neutral";
    human_selected_categories: string[];
    is_suggestion: boolean;
    study_programs: {
        name: string;
        faculties: {
            name: string;
        } | null
    } | null;
};

const ITEMS_PER_PAGE = 50;

export default function ReviewPage() {
    // --- State ---
    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    // Filter options state
    const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
    const [allFaculties, setAllFaculties] = useState<Faculty[]>([]);
    const [allStudyPrograms, setAllStudyPrograms] = useState<StudyProgram[]>([]);
    
    // Filter selections state
    const [selectedFaculty, setSelectedFaculty] = useState<string>('all');
    const [selectedProgram, setSelectedProgram] = useState<string>('all');
    const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all'); // This will filter by parent category
    const [currentPage, setCurrentPage] = useState(1);

    // --- Data Fetching ---
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const from = (currentPage - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase.from('survey_responses')
                .select(`id, original_survey_row_id, comment_text, sentiment, human_selected_categories, ai_reasoning, is_suggestion, study_program_id, study_programs (name, faculties (name))`, { count: 'exact' });
            
            if (selectedSentiment !== 'all') { query = query.eq('sentiment', selectedSentiment); }
            
            // --- FIX: Correctly filter jsonb array for parent category ---
            if (selectedCategory !== 'all') {
                const subCategoryNames = subCategories
                    .filter(sc => sc.parent_category_id === selectedCategory)
                    .map(sc => sc.name);
                if (subCategoryNames.length > 0) {
                    const orFilter = subCategoryNames.map(name => `human_selected_categories.cs.["${name}"]`).join(',');
                    query = query.or(orFilter);
                } else {
                    // If a parent category is selected but has no subcategories, return no results.
                    setResponses([]);
                    setTotalCount(0);
                    setIsLoading(false);
                    return;
                }
            }

            if (selectedProgram !== 'all') {
                query = query.eq('study_program_id', selectedProgram);
            } else if (selectedFaculty !== 'all') {
                const programIds = allStudyPrograms.filter(p => p.faculty_id === selectedFaculty).map(p => p.id);
                if (programIds.length > 0) { 
                    query = query.in('study_program_id', programIds); 
                } else { 
                    setResponses([]); 
                    setTotalCount(0); 
                    setIsLoading(false); 
                    return; 
                }
            }
            
            query = query.order('original_survey_row_id', { ascending: true }).range(from, to);
            const { data, count, error } = await query;
            
            if (error) {
                console.error("Error fetching responses:", error);
            } else {
                setResponses((data as unknown as SurveyResponse[]) || []); // FIX
                setTotalCount(count || 0);
            }
            setIsLoading(false);
        };

        const fetchFilterOptions = async () => {
             const [pCatRes, sCatRes, facRes, progRes] = await Promise.all([
                supabase.from('parent_categories').select('*').order('name'),
                supabase.from('sub_categories').select('*').order('name'),
                supabase.from('faculties').select('id, name').order('name'),
                supabase.from('study_programs').select('id, name, faculty_id').order('name')
            ]);
            if (pCatRes.data) setParentCategories(pCatRes.data);
            if (sCatRes.data) setSubCategories(sCatRes.data);
            if (facRes.data) setAllFaculties(facRes.data);
            if (progRes.data) setAllStudyPrograms(progRes.data);
        };
        
        // Fetch options first, then fetch data
        if (allFaculties.length === 0) {
            fetchFilterOptions();
        }
        
        // Only fetch data once filter options are loaded
        if (allFaculties.length > 0) {
             fetchData();
        }
    }, [currentPage, selectedFaculty, selectedProgram, selectedSentiment, selectedCategory, allFaculties, allStudyPrograms, subCategories]);

    // --- Live Update Handlers ---
    const handleSentimentUpdate = async (responseId: string, newSentiment: "Positive" | "Negative" | "Neutral") => {
        setResponses(prev => prev.map(res => res.id === responseId ? { ...res, sentiment: newSentiment } : res));
        const { error } = await supabase.from('survey_responses').update({ sentiment: newSentiment }).match({ id: responseId });
        if (error) alert("Failed to save sentiment change.");
    };

    const handleSubcategoryUpdate = async (responseId: string, subCategoryName: string) => {
        const responseToUpdate = responses.find(res => res.id === responseId);
        if (!responseToUpdate) return;
        const currentCategories = responseToUpdate.human_selected_categories || [];
        const newCategories = currentCategories.includes(subCategoryName) ? currentCategories.filter(c => c !== subCategoryName) : [...currentCategories, subCategoryName];
        setResponses(prev => prev.map(res => res.id === responseId ? { ...res, human_selected_categories: newCategories } : res));
        const { error } = await supabase.from('survey_responses').update({ human_selected_categories: newCategories }).match({ id: responseId });
        if (error) alert("Failed to save category change.");
    };
    
    const handleSuggestionUpdate = async (responseId: string, newStatus: boolean) => {
        setResponses(prev => prev.map(res => res.id === responseId ? { ...res, is_suggestion: newStatus } : res));
        const { error } = await supabase.from('survey_responses').update({ is_suggestion: newStatus }).match({ id: responseId });
        if (error) alert("Failed to save suggestion status.");
    };

    // --- Pagination Handlers ---
    const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
    const handlePreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };
    
    const filteredPrograms = selectedFaculty !== 'all' ? allStudyPrograms.filter(p => p.faculty_id === selectedFaculty) : [];
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        setCurrentPage(1);
        setter(value);
    };

    return (
        <div className="p-4 md:p-8 max-w-full mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Review & Edit Imported Data</h1>

            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium">Faculty</label>
                            <Select value={selectedFaculty} onValueChange={(value) => { handleFilterChange(setSelectedFaculty, value); setSelectedProgram('all'); }}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="all">All Faculties</SelectItem>{allFaculties.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Study Program</label>
                            <Select value={selectedProgram} onValueChange={(value) => handleFilterChange(setSelectedProgram, value)} disabled={selectedFaculty === 'all'}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="all">All Programs in Faculty</SelectItem>{filteredPrograms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Sentiment</label>
                             <Select value={selectedSentiment} onValueChange={(value) => handleFilterChange(setSelectedSentiment, value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="all">All Sentiments</SelectItem><SelectItem value="Positive">Positive</SelectItem><SelectItem value="Negative">Negative</SelectItem><SelectItem value="Neutral">Neutral</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Parent Category</label>
                            <Select value={selectedCategory} onValueChange={(value) => handleFilterChange(setSelectedCategory, value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="all">All Categories</SelectItem>{parentCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="bg-white shadow-md rounded-lg">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">No.</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment & Suggestion</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categories</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {isLoading ? (
                                <tr><td colSpan={4} className="text-center p-8 text-gray-500">Loading data...</td></tr>
                            ) : responses.map((response) => (
                                <tr key={response.id}>
                                    <td className="px-4 py-4 font-mono text-center align-top">{response.original_survey_row_id}</td>
                                    <td className="px-4 py-4 max-w-lg">
                                        {/* FIX: Replaced literal quotes with HTML entity to fix linting error */}
                                        <p className="whitespace-pre-wrap italic text-gray-700">&quot;{response.comment_text}&quot;</p>
                                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                                            <span className="font-semibold">AI Reasoning:</span> {response.ai_reasoning}
                                        </p>
                                        <div className="text-xs text-gray-500 mt-2">
                                            <span className="font-semibold">{response.study_programs?.name}</span> / {response.study_programs?.faculties?.name}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                        <div className="flex flex-col gap-1">
                                            {(["Positive", "Negative", "Neutral"] as const).map(senti => (
                                                <button key={senti} onClick={() => handleSentimentUpdate(response.id, senti)}
                                                    className={`px-2 py-1 rounded text-xs font-semibold w-24 text-center border-2 ${
                                                        response.sentiment === senti 
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
                                                    checked={response.is_suggestion}
                                                    onChange={(e) => handleSuggestionUpdate(response.id, e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="font-semibold">Is a Suggestion</span>
                                            </label>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 max-w-md align-top">
                                        {parentCategories.map(pCat => (
                                            <div key={pCat.id} className="mb-3 last:mb-0">
                                                <h4 className="font-bold text-xs uppercase text-gray-600">{pCat.name}</h4>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {subCategories.filter(sCat => sCat.parent_category_id === pCat.id).map(sCat => {
                                                        const isSelected = response.human_selected_categories?.includes(sCat.name);
                                                        return (
                                                            <button key={sCat.id} onClick={() => handleSubcategoryUpdate(response.id, sCat.name)}
                                                                className={`px-2 py-1 rounded-full font-semibold text-xs ${
                                                                    isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'
                                                                }`}
                                                            >{sCat.name}</button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-sm text-gray-700">Showing {Math.min( (currentPage - 1) * ITEMS_PER_PAGE + 1, totalCount )} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} results</span>
                    <div className="flex gap-2">
                        <button onClick={handlePreviousPage} className="btn-primary" disabled={currentPage === 1 || isLoading}>Previous</button>
                        <span className="self-center px-2">Page {currentPage} of {totalPages}</span>
                        <button onClick={handleNextPage} className="btn-primary" disabled={currentPage === totalPages || isLoading}>Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
