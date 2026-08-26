ALTER TABLE qa_results DROP CONSTRAINT IF EXISTS qa_results_category_check;

ALTER TABLE qa_results
  ADD CONSTRAINT qa_results_category_check
  CHECK (category IN ('facts', 'seo', 'geo', 'tone', 'advertising', 'editorial'));

