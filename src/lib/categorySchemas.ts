import { z } from "zod";

export const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      parent: z.string().min(1),
      child:  z.string().min(1)
    })
  )
});

export type SuggestionPayload = z.infer<typeof suggestionSchema>;
