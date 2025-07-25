import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { suggestionSchema } from "@/lib/categorySchemas";
import { supabase } from "@/lib/supabase"; // Added Supabase client import

export async function POST(req: NextRequest) {
    const { comments } = (await req.json()) as { comments: string[] };

    const messages = [
        {
            role: "system",
            content:
                "You are an assistant that suggests parent & child category names.\n" +
                "Return ONLY valid JSON matching this type:\n" +
                '{ "suggestions": [ { "parent": "string", "child": "string" } ] }'
        },
        {
            role: "user",
            content: `Here are some comments:\n${comments.map(c => "- " + c).join("\n")}`
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.3
    });

    // --- parse JSON safely ---
    let payload;
    try {
        let raw = (completion.choices[0].message.content ?? "").trim();

        // remove ```json ... ``` or ``` ... ```
        if (raw.startsWith("```")) {
            raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
        }

        payload = suggestionSchema.parse(JSON.parse(raw));
    } catch (err) {
        console.error("Failed to parse AI response", err);
        console.error("Raw AI text was:\n", completion.choices[0].message.content);
        return NextResponse.json({ error: "bad_format" }, { status: 422 });
    }

    // Save every suggestion as 'pending'
    const { error } = await supabase
        .from("category_suggestions")
        .insert(
            payload.suggestions.map(s => ({
                parent_name: s.parent,
                child_name:  s.child
            }))
        );

    if (error) console.error("DB insert error:", error);

    return NextResponse.json(payload);
}