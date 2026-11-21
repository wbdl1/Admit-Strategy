// A manual copy/paste bridge only. No external service receives student material.
export const studyFormatterPrompt=`Use ONLY the material already provided in this conversation or uploaded file.

Extract the important vocabulary, concepts, processes or factual questions a student should know for an assessment. Do not add outside information. Do not invent definitions. If something is unclear, leave it out rather than guessing. Do not turn math exercises into question-answer pairs to memorize.

For each item create one clear term/question and one concise answer. Prefer terminology from the original material. Avoid duplicates.

Output ONLY tab-separated rows, with a real tab between the two columns:
Term or Question[TAB]Answer

Do not include numbering, bullets, headings, Markdown tables, or explanations before or after the rows.`;

export function formatterBridgeMarkup(){return `<details class="form-panel"><summary>Already have this in an AI chat?</summary><p>If your material is already in ChatGPT, Claude, Gemini or another chatbot, copy this formatting prompt into that chat. Then paste its result below.</p><p>Nothing is sent from Admit Strategy. Check the result before adding it.</p><button type="button" class="btn secondary" data-study-action="copy-formatter">Copy formatting prompt</button><p role="status" data-formatter-status></p><label hidden data-formatter-fallback>Copy this prompt<textarea readonly rows="8"></textarea></label></details>`;}
