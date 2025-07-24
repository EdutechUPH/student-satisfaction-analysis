// src/lib/data-importer.ts

import { supabase } from './supabase';
import { type VerifiedRow, type StudyProgram } from '@/app/data-processing/page'; 

export const saveVerifiedData = async (
    verifiedData: VerifiedRow[], 
    allStudyPrograms: StudyProgram[]
): Promise<{ success: boolean; message: string }> => {
    
    let firstFailedProgramName: string | null = null;

    const normalizeString = (str: string | null | undefined): string => {
        if (!str) return "";
        return str.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const dataToSave = verifiedData.map(row => {
        const csvProgramNameNormalized = normalizeString(row.Prodi);
        const studyProgram = allStudyPrograms.find(p => normalizeString(p.name) === csvProgramNameNormalized);
        
        if (!studyProgram) {
            if (!firstFailedProgramName) { firstFailedProgramName = row.Prodi; }
            return null;
        }

        return {
            original_survey_row_id: row.No,
            comment_text: row['Learning Experience_comment'],
            sentiment: row.sentiment,
            // CORRECTED: Use row.ai_subcategories
            ai_suggested_categories: row.ai_subcategories, 
            human_selected_categories: row.human_selected_categories ?? row.ai_subcategories,
            ai_reasoning: row.ai_reasoning,
            is_suggestion: row.is_suggestion,
            is_verified: true,
            study_program_id: studyProgram.id,
        };
    }).filter(Boolean);

    if (firstFailedProgramName) {
        return {
            success: false,
            message: `Could not save data. The 'Prodi' named "${firstFailedProgramName}" could not be found.`
        };
    }
    
    if (dataToSave.length === 0 && verifiedData.length > 0) {
        return { success: false, message: "No data could be saved. Please use the 'Check for Mismatches' tool." };
    }

    const { error } = await supabase.from('survey_responses').upsert(dataToSave, {
        onConflict: 'original_survey_row_id' 
    });

    if (error) {
        return { success: false, message: "Error saving data: " + error.message };
    }

    return { success: true, message: `Successfully saved ${dataToSave.length} verified responses!` };
};