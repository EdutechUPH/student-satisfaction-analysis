import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { suggestionSchema } from "@/lib/categorySchemas";

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

  // parse JSON safely
  let payload;
  try {
    payload = suggestionSchema.parse(JSON.parse(completion.choices[0].message.content ?? ""));
  } catch (err) {
    console.error("Failed to parse AI response", err);
    return NextResponse.json({ error: "bad_format" }, { status: 422 });
  }

  /** OPTIONAL: Save to DB right here */
  // const { error } = await supabase.from("category_suggestions").insert(
  //   payload.suggestions.map(s => ({
  //     parent_name: s.parent,
  //     child_name:  s.child
  //   }))
  // );
  // if (error) console.error(error);

  return NextResponse.json(payload);     // now returns clean JSON
}
