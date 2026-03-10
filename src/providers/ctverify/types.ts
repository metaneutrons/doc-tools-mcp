export interface CitationEntry {
  id: string;          // "filename:line:index"
  file: string;        // source markdown file path
  line: number;        // line number in source
  cite: string;        // raw citation text, e.g. "_Loewenheim/Leistner_ in: @SchrickerLoewenheim6, § 2 Rn. 51"
  context: string;     // ~200 chars before the footnote (the claim being supported)
  claim: string;       // what the text asserts (filled by LLM)
  status: 'pending' | 'under_review' | 'verified' | 'disputed' | 'not_found';
  note: string;        // free text notes
}
