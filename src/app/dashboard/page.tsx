"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import Papa from 'papaparse';

// --- Type Definitions ---
type Faculty = { id: string; name: string; };
type StudyProgram = { id: string; name: string; faculty_id: string; };
type ParentCategory = { id: string; name: string; };
type SubCategory = { id: string; name: string; parent_category_id: string; };
type SurveyResponse = { comment_text: string; sentiment: string; human_selected_categories: string[]; is_suggestion: boolean; study_program_id: string; };
type SentimentData = { name: string; value: number };
type SentimentByCategoryData = { name: string; Positive: number; Negative: number; Neutral: number; };
type KeywordData = { name: string; count: number };

export default function DashboardPage() {
    // --- State for filter options ---
    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [studyPrograms, setStudyPrograms] = useState<StudyProgram[]>([]);
    const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
    const [allResponses, setAllResponses] = useState<SurveyResponse[]>([]);

    // --- State for filter selections ---
    const [selectedFaculty, setSelectedFaculty] = useState<string>('all');
    const [selectedProgram, setSelectedProgram] = useState<string>('all');
    const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
    const [selectedSuggestion, setSelectedSuggestion] = useState<string>('all');
    const [selectedParentCategory, setSelectedParentCategory] = useState<string>('all');
    const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
    const [topN, setTopN] = useState<string>('10');
    const [searchTerm, setSearchTerm] = useState('');

    // --- State for data display ---
    const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
    const [sentimentByCategoryData, setSentimentByCategoryData] = useState<SentimentByCategoryData[]>([]);
    const [filteredComments, setFilteredComments] = useState<SurveyResponse[]>([]);
    const [totalResponses, setTotalResponses] = useState(0);
    const [totalSuggestions, setTotalSuggestions] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [netSentimentScore, setNetSentimentScore] = useState(0);
    const [keywordData, setKeywordData] = useState<KeywordData[]>([]);
    const [sentimentBySubcategoryData, setSentimentBySubcategoryData] = useState<any[]>([]);

    // --- Fetch all data just once on initial load ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            const [facRes, progRes, pCatRes, sCatRes, surveyRes] = await Promise.all([
                supabase.from('faculties').select('id, name').order('name'),
                supabase.from('study_programs').select('id, name, faculty_id').order('name'),
                supabase.from('parent_categories').select('id, name').order('name'),
                supabase.from('sub_categories').select('id, name, parent_category_id').order('name'),
                supabase.from('survey_responses').select('comment_text, sentiment, human_selected_categories, is_suggestion, study_program_id')
            ]);
            
            if (facRes.data) setFaculties(facRes.data);
            if (progRes.data) setStudyPrograms(progRes.data);
            if (pCatRes.data) setParentCategories(pCatRes.data);
            if (sCatRes.data) setSubCategories(sCatRes.data);
            if (surveyRes.data) setAllResponses(surveyRes.data as SurveyResponse[]);

            setIsLoading(false);
        };
        fetchInitialData();
    }, []);

    // --- This useEffect now only does client-side filtering and processing ---
    useEffect(() => {
        if (isLoading || !allResponses.length) return;

        let filteredData = allResponses;

        if (selectedFaculty !== 'all') {
            const programIds = new Set(studyPrograms.filter(p => p.faculty_id === selectedFaculty).map(p => p.id));
            filteredData = filteredData.filter(r => programIds.has(r.study_program_id));
        }
        if (selectedProgram !== 'all') {
            filteredData = filteredData.filter(r => r.study_program_id === selectedProgram);
        }
        if (selectedSentiment !== 'all') {
            filteredData = filteredData.filter(r => r.sentiment === selectedSentiment);
        }
        if (selectedSuggestion !== 'all') {
            filteredData = filteredData.filter(r => String(r.is_suggestion) === selectedSuggestion);
        }
        if (selectedSubCategory !== 'all') {
            filteredData = filteredData.filter(r => r.human_selected_categories?.includes(selectedSubCategory));
        } else if (selectedParentCategory !== 'all') {
            const subCategoryNames = new Set(subCategories.filter(sc => sc.parent_category_id === selectedParentCategory).map(sc => sc.name));
            filteredData = filteredData.filter(r => r.human_selected_categories?.some(cat => subCategoryNames.has(cat)));
        }
        if (searchTerm) {
            filteredData = filteredData.filter(r => r.comment_text?.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        setFilteredComments(filteredData);
        setTotalResponses(filteredData.length);
        setTotalSuggestions(filteredData.filter(r => r.is_suggestion).length);

        const sentimentCounts = filteredData.reduce((acc, { sentiment }) => {
            if (sentiment) acc[sentiment] = (acc[sentiment] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        setSentimentData(Object.entries(sentimentCounts).map(([name, value]) => ({ name, value })));

        const positiveCount = sentimentCounts['Positive'] || 0;
        const negativeCount = sentimentCounts['Negative'] || 0;
        const totalSentiments = positiveCount + negativeCount + (sentimentCounts['Neutral'] || 0);
        if (totalSentiments > 0) {
            setNetSentimentScore(Math.round(((positiveCount - negativeCount) / totalSentiments) * 100));
        } else {
            setNetSentimentScore(0);
        }
        
        const subCatSentiments = filteredData.reduce((acc, { human_selected_categories, sentiment }) => {
            if (human_selected_categories && sentiment) {
                human_selected_categories.forEach(cat => {
                    if (!acc[cat]) {
                        acc[cat] = { name: cat, Positive: 0, Negative: 0, Neutral: 0, total: 0 };
                    }
                    acc[cat][sentiment]++;
                    acc[cat].total++;
                });
            }
            return acc;
        }, {} as any);
        const sortedSentimentBySubcategory = Object.values(subCatSentiments).sort((a: any, b: any) => b.total - a.total);
        setSentimentBySubcategoryData(sortedSentimentBySubcategory);

        const subCatToParentMap = new Map(subCategories.map(sc => [sc.name, sc.parent_category_id]));
        const parentIdToNameMap = new Map(parentCategories.map(pc => [pc.id, pc.name]));
        const countsByParent = parentCategories.reduce((acc, pc) => {
            acc[pc.name] = { name: pc.name, Positive: 0, Negative: 0, Neutral: 0 };
            return acc;
        }, {} as Record<string, SentimentByCategoryData>);
        filteredData.forEach(response => {
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

        const stopWords = new Set(["dan", "di", "ke", "dari", "saya", "ini", "itu", "yang", "untuk", "dengan", "tidak", "ada", "sudah", "bisa", "karena", "yg", "juga", "lebih", "tapi", "sangat", "lagi", "tdk", "ada"]);
        const wordCounts = filteredData.reduce((acc, { comment_text }) => {
            if(comment_text) {
                comment_text.toLowerCase().replace(/[^a-zA-Z\s]/g, '').split(/\s+/).forEach(word => {
                    if (word && !stopWords.has(word) && word.length > 2) {
                        acc[word] = (acc[word] || 0) + 1;
                    }
                });
            }
            return acc;
        }, {} as Record<string, number>);
        const sortedKeywordData = Object.entries(wordCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
        setKeywordData(sortedKeywordData);

    }, [allResponses, selectedFaculty, selectedProgram, selectedSentiment, selectedSuggestion, selectedParentCategory, selectedSubCategory, searchTerm, isLoading, studyPrograms, parentCategories, subCategories]);

    const filteredPrograms = selectedFaculty !== 'all' ? studyPrograms.filter(p => p.faculty_id === selectedFaculty) : [];
    const filteredSubcategories = selectedParentCategory !== 'all' ? subCategories.filter(sc => sc.parent_category_id === selectedParentCategory) : [];
    const displayedSubcategoryData = (selectedParentCategory !== 'all' 
        ? sentimentBySubcategoryData.filter(item => filteredSubcategories.some(sc => sc.name === item.name))
        : sentimentBySubcategoryData
    ).slice(0, topN === 'all' ? sentimentBySubcategoryData.length : parseInt(topN));
    const PIE_COLORS = { 'Positive': '#10B981', 'Negative': '#EF4444', 'Neutral': '#6B7280' };
    const BAR_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    const handlePieClick = (data: any) => setSelectedSentiment(data.name);
    const handleBarClick = (data: any) => {
        if(data && data.activePayload && data.activePayload[0]) {
            setSelectedSubCategory(data.activePayload[0].payload.name);
            setSelectedParentCategory('all');
        }
    };
    const handleExport = () => {
        const csv = Papa.unparse(filteredComments);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'filtered_survey_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 md:p-8 space-y-4 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold">Survey Analysis Dashboard</h1>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Filtered Responses</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : totalResponses}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Filtered Suggestions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{isLoading ? '...' : totalSuggestions}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Net Sentiment Score</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${netSentimentScore > 0 ? 'text-green-600' : netSentimentScore < 0 ? 'text-red-600' : 'text-gray-600'}`}>{isLoading ? '...' : `${netSentimentScore}%`}</div><p className="text-xs text-muted-foreground">%Positive - %Negative</p></CardContent></Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Export Filtered Data</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-center pt-4">
                        <Button onClick={handleExport}>Export as CSV</Button>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader><CardTitle>Filter Data</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Faculty</label><Select value={selectedFaculty} onValueChange={(value) => { setSelectedFaculty(value); setSelectedProgram('all'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Faculties</SelectItem>{faculties.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Study Program</label><Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={selectedFaculty === 'all'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Programs in Faculty</SelectItem>{filteredPrograms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Sentiment</label><Select value={selectedSentiment} onValueChange={setSelectedSentiment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Sentiments</SelectItem><SelectItem value="Positive">Positive</SelectItem><SelectItem value="Negative">Negative</SelectItem><SelectItem value="Neutral">Neutral</SelectItem></SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Suggestions</label><Select value={selectedSuggestion} onValueChange={setSelectedSuggestion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Comments</SelectItem><SelectItem value="true">Suggestions Only</SelectItem><SelectItem value="false">Non-Suggestions</SelectItem></SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Parent Category</label><Select value={selectedParentCategory} onValueChange={(value) => { setSelectedParentCategory(value); setSelectedSubCategory('all'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Parent Categories</SelectItem>{parentCategories.map(pc => <SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="flex flex-col gap-1"><label className="text-sm font-medium">Subcategory</label><Select value={selectedSubCategory} onValueChange={setSelectedSubCategory} disabled={selectedParentCategory === 'all'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Subcategories</SelectItem>{filteredSubcategories.map(sc => <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Search Comments</label>
                        <Input placeholder="Search for keywords..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle>Sentiment Breakdown</CardTitle></CardHeader>
                    <CardContent className="pl-2">
                        {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : sentimentData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label className="cursor-pointer" onClick={handlePieClick}>
                                        {sentimentData.map((entry) => <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS]} className="focus:outline-none" />)}
                                    </Pie>
                                    <Tooltip formatter={(value, name) => [value, name]} />
                                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <p className="text-center text-gray-500 py-10">No data</p>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Top Keywords</CardTitle></CardHeader>
                    <CardContent>
                        {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : keywordData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={keywordData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" width={100} interval={0} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                    <Bar dataKey="count" name="Mentions">
                                        {keywordData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-center text-gray-500 py-10">No keywords found</p>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Sentiment by Top Subcategories</CardTitle>
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
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={displayedSubcategoryData} layout="vertical" margin={{ top: 5, right: 30, left: 180, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} stackId="stack" />
                                    <YAxis type="category" dataKey="name" width={180} interval={0} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                                    <Bar dataKey="Positive" stackId="stack" fill={PIE_COLORS.Positive} className="cursor-pointer" onClick={handleBarClick} />
                                    <Bar dataKey="Negative" stackId="stack" fill={PIE_COLORS.Negative} className="cursor-pointer" onClick={handleBarClick} />
                                    <Bar dataKey="Neutral" stackId="stack" fill={PIE_COLORS.Neutral} className="cursor-pointer" onClick={handleBarClick} />
                                </BarChart>
                            </ResponsiveContainer>
                         ) : <p className="text-center text-gray-500 py-10">No data</p>}
                    </CardContent>
                </Card>
                {/* --- UI CHANGE: The chart below is now horizontal --- */}
                <Card>
                    <CardHeader><CardTitle>Sentiment by Parent Category</CardTitle></CardHeader>
                    <CardContent>
                        {isLoading ? <p className="text-center text-gray-500 py-10">Loading...</p> : sentimentByCategoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={sentimentByCategoryData} layout="vertical" margin={{ top: 5, right: 30, left: 180, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" allowDecimals={false} stackId="a" />
                                    <YAxis type="category" dataKey="name" width={180} interval={0} tick={{ fontSize: 12 }} />
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