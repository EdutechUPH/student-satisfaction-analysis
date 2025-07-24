"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

// --- Type Definitions ---
type Faculty = { id: string; name: string; };
type StudyProgram = { id: string; name: string; faculty_id: string; };
type ParentCategory = { id: string; name: string; };
type SubCategory = { id: string; name: string; parent_category_id: string; };
type SurveyResponse = { comment_text: string; sentiment: string; human_selected_categories: string[]; is_suggestion: boolean; };
type SentimentData = { name: string; value: number };
type SubcategoryData = { name: string; count: number };
type SentimentByCategoryData = { name: string; Positive: number; Negative: number; Neutral: number; };

export default function DashboardPage() {
    // --- State for filter options ---
    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [studyPrograms, setStudyPrograms] = useState<StudyProgram[]>([]);
    const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);

    // --- State for filter selections ---
    const [selectedFaculty, setSelectedFaculty] = useState<string>('all');
    const [selectedProgram, setSelectedProgram] = useState<string>('all');
    const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
    const [selectedSuggestion, setSelectedSuggestion] = useState<string>('all');
    const [selectedParentCategory, setSelectedParentCategory] = useState<string>('all');
    const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
    const [topN, setTopN] = useState<string>('5');

    // --- State for data display ---
    const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
    const [subcategoryData, setSubcategoryData] = useState<SubcategoryData[]>([]);
    const [sentimentByCategoryData, setSentimentByCategoryData] = useState<SentimentByCategoryData[]>([]);
    const [filteredComments, setFilteredComments] = useState<SurveyResponse[]>([]);
    const [totalResponses, setTotalResponses] = useState(0);
    const [totalSuggestions, setTotalSuggestions] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // --- Fetch initial filter options ---
    useEffect(() => {
        const fetchFilterData = async () => {
            const [facRes, progRes, pCatRes, sCatRes] = await Promise.all([
                supabase.from('faculties').select('id, name').order('name'),
                supabase.from('study_programs').select('id, name, faculty_id').order('name'),
                supabase.from('parent_categories').select('id, name').order('name'),
                supabase.from('sub_categories').select('id, name, parent_category_id').order('name')
            ]);
            if (facRes.data) setFaculties(facRes.data);
            if (progRes.data) setStudyPrograms(progRes.data);
            if (pCatRes.data) setParentCategories(pCatRes.data);
            if (sCatRes.data) setSubCategories(sCatRes.data);
        };
        fetchFilterData();
    }, []);

    // --- Fetch and process dashboard data when filters change ---
    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            
            // --- THIS IS THE CORRECTED AND FINAL FETCH LOGIC ---
            let data: SurveyResponse[] | null = null;
            let error: any = null;

            // Determine if we need to use the RPC for parent category filtering
            const useRpcForParentCategory = selectedSubCategory === 'all' && selectedParentCategory !== 'all';

            if (useRpcForParentCategory) {
                const subCategoryNames = subCategories
                    .filter(sc => sc.parent_category_id === selectedParentCategory)
                    .map(sc => sc.name);

                if (subCategoryNames.length > 0) {
                    const rpcResult = await supabase.rpc('filter_survey_by_categories', {
                        p_category_names: subCategoryNames
                    });
                    data = rpcResult.data;
                    error = rpcResult.error;
                } else {
                    data = [];
                }
            } else {
                // Use standard filters if not filtering by a parent category
                let query = supabase.from('survey_responses').select('comment_text, sentiment, human_selected_categories, is_suggestion');
                if (selectedSubCategory !== 'all') {
                    query = query.contains('human_selected_categories', `["${selectedSubCategory}"]`);
                }
                const queryResult = await query;
                data = queryResult.data;
                error = queryResult.error;
            }

            if (error) {
                console.error("Error fetching data:", error);
                data = []; // Ensure data is an empty array on error
            }

            if (data) {
                // Apply remaining filters client-side
                const clientFilteredData = data.filter(item => {
                    if (selectedSentiment !== 'all' && item.sentiment !== selectedSentiment) return false;
                    if (selectedSuggestion !== 'all' && String(item.is_suggestion) !== selectedSuggestion) return false;
                    
                    if (selectedProgram !== 'all') {
                        // This assumes your RPC/query returns study_program_id
                        // If not, you'll need to add it to the select() and the function's return columns
                        // @ts-ignore
                        if (item.study_program_id !== selectedProgram) return false;
                    } else if (selectedFaculty !== 'all') {
                        const programIds = new Set(studyPrograms.filter(p => p.faculty_id === selectedFaculty).map(p => p.id));
                        // @ts-ignore
                        if (!programIds.has(item.study_program_id)) return false;
                    }
                    return true;
                });

                setFilteredComments(clientFilteredData);
                setTotalResponses(clientFilteredData.length);
                setTotalSuggestions(clientFilteredData.filter(r => r.is_suggestion).length);

                // Process data for charts using the client-filtered data
                const sentimentCounts = clientFilteredData.reduce((acc, { sentiment }) => {
                    if (sentiment) acc[sentiment] = (acc[sentiment] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                setSentimentData(Object.entries(sentimentCounts).map(([name, value]) => ({ name, value })));

                const subcategoryCounts = clientFilteredData.reduce((acc, { human_selected_categories }) => {
                    if (human_selected_categories && Array.isArray(human_selected_categories)) {
                        human_selected_categories.forEach(subcategory => {
                            acc[subcategory] = (acc[subcategory] || 0) + 1;
                        });
                    }
                    return acc;
                }, {} as Record<string, number>);
                const sortedSubcategoryData = Object.entries(subcategoryCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count);
                setSubcategoryData(sortedSubcategoryData);

                const subCatToParentMap = new Map(subCategories.map(sc => [sc.name, sc.parent_category_id]));
                const parentIdToNameMap = new Map(parentCategories.map(pc => [pc.id, pc.name]));
                const countsByParent = parentCategories.reduce((acc, pc) => {
                    acc[pc.name] = { name: pc.name, Positive: 0, Negative: 0, Neutral: 0 };
                    return acc;
                }, {} as Record<string, SentimentByCategoryData>);

                clientFilteredData.forEach(response => {
                    const countedParents = new Set<string>();
                    if (response.human_selected_categories?.length && response.sentiment) {
                        response.human_selected_categories.forEach(subCatName => {
                            const parentId = subCatToParentMap.get(subCatName);
                            if (parentId) {
                                const parentName = parentIdToNameMap.get(parentId);
                                if (parentName && !countedParents.has(parentName)) {
                                    countsByParent[parentName][response.sentiment as keyof Omit<SentimentByCategoryData, 'name'>]++;
                                    countedParents.add(parentName);
                                }
                            }
                        });
                    }
                });
                setSentimentByCategoryData(Object.values(countsByParent));
            }
            
            setIsLoading(false);
        };

        if (faculties.length > 0 && studyPrograms.length > 0 && parentCategories.length > 0 && subCategories.length > 0) {
            fetchDashboardData();
        }
    }, [selectedFaculty, selectedProgram, selectedSentiment, selectedSuggestion, selectedParentCategory, selectedSubCategory, faculties, studyPrograms, parentCategories, subCategories]);

    // --- Helper variables for cascading filters and charts ---
    const filteredPrograms = selectedFaculty !== 'all' ? studyPrograms.filter(p => p.faculty_id === selectedFaculty) : [];
    const filteredSubcategories = selectedParentCategory !== 'all' ? subCategories.filter(sc => sc.parent_category_id === selectedParentCategory) : [];
    const displayedSubcategoryData = (selectedParentCategory !== 'all' 
        ? subcategoryData.filter(item => filteredSubcategories.some(sc => sc.name === item.name))
        : subcategoryData
    ).slice(0, topN === 'all' ? subcategoryData.length : parseInt(topN));
    const PIE_COLORS = { 'Positive': '#10B981', 'Negative': '#EF4444', 'Neutral': '#6B7280' };
    const BAR_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    return (
        <div className="p-4 md:p-8 space-y-4 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold">Analysis Dashboard</h1>

            {/* KPI Cards Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Responses</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : totalResponses}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Suggestions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : totalSuggestions}</div></CardContent></Card>
            </div>
            
            {/* Filter Controls */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Faculty</label><Select value={selectedFaculty} onValueChange={(value) => { setSelectedFaculty(value); setSelectedProgram('all'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Faculties</SelectItem>{faculties.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Study Program</label><Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={selectedFaculty === 'all'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Programs in Faculty</SelectItem>{filteredPrograms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Sentiment</label><Select value={selectedSentiment} onValueChange={setSelectedSentiment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Sentiments</SelectItem><SelectItem value="Positive">Positive</SelectItem><SelectItem value="Negative">Negative</SelectItem><SelectItem value="Neutral">Neutral</SelectItem></SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Comment Type</label><Select value={selectedSuggestion} onValueChange={setSelectedSuggestion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Comments</SelectItem><SelectItem value="true">Suggestions Only</SelectItem><SelectItem value="false">Non-Suggestions</SelectItem></SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Parent Category</label><Select value={selectedParentCategory} onValueChange={(value) => { setSelectedParentCategory(value); setSelectedSubCategory('all'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Parent Categories</SelectItem>{parentCategories.map(pc => <SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Subcategory</label><Select value={selectedSubCategory} onValueChange={setSelectedSubCategory} disabled={selectedParentCategory === 'all'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Subcategories</SelectItem>{filteredSubcategories.map(sc => <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-3">
                    <CardHeader><CardTitle>Sentiment Breakdown</CardTitle></CardHeader>
                    <CardContent className="pl-2">
                        {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : sentimentData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                                        {sentimentData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value, name) => [value, name]} />
                                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <p className="text-center text-gray-500 py-10">No data</p>}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Top Subcategories Mentioned</CardTitle>
                        <Select value={topN} onValueChange={setTopN}>
                            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">Top 5</SelectItem>
                                <SelectItem value="10">Top 10</SelectItem>
                                <SelectItem value="all">Show All</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent>
                         {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : displayedSubcategoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={displayedSubcategoryData} layout="vertical" margin={{ top: 5, right: 30, left: 180, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={180} interval={0} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                    <Bar dataKey="count" name="Mentions">
                                        {displayedSubcategoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                         ) : <p className="text-center text-gray-500 py-10">No data</p>}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-4">
                    <CardHeader><CardTitle>Sentiment by Parent Category</CardTitle></CardHeader>
                    <CardContent>
                        {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : sentimentByCategoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={sentimentByCategoryData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                                    <Bar dataKey="Positive" stackId="a" fill={PIE_COLORS.Positive} />
                                    <Bar dataKey="Negative" stackId="a" fill={PIE_COLORS.Negative} />
                                    <Bar dataKey="Neutral" stackId="a" fill={PIE_COLORS.Neutral} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-center text-gray-500 py-10">No data</p>}
                    </CardContent>
                </Card>
            </div>

             {/* Comments Display Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Filtered Comments ({filteredComments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4">
                    {isLoading ? <p>Loading comments...</p> : filteredComments.length > 0 ? (
                        filteredComments.map((comment, index) => (
                            <div key={index} className="border-b pb-4 last:border-b-0">
                                <p className="text-gray-800 italic">"{comment.comment_text}"</p>
                                <div className="flex items-center gap-4 mt-2">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ comment.sentiment === 'Positive' ? 'bg-green-100 text-green-800' : comment.sentiment === 'Negative' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800' }`}>{comment.sentiment}</span>
                                    {comment.is_suggestion && ( <span className="text-xs font-semibold bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Suggestion</span> )}
                                    <div className="flex flex-wrap gap-2">
                                        {comment.human_selected_categories?.map(cat => ( <span key={cat} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{cat}</span> ))}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : <p className="text-gray-500">No comments match the current filters.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}