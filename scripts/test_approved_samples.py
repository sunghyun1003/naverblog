"""Offline extraction contract: never change source DOCX files."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("compiler", Path(__file__).with_name("build-approved-samples.py"))
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


class ExtractionTest(unittest.TestCase):
    def test_html_boundaries_and_faq(self):
        article = compiler.html_article('''<h1>제목 &amp; 조건</h1>
          <aside id="nxt_usp-summary"><ul><li>핵심 <strong>조건</strong></li></ul></aside>
          <aside id="nxt_page-toc"><p>목차 제외</p></aside>
          <article id="nxt_blog-content"><h2>판단 기준</h2><p>앞 <b>설명</b> 뒤</p>
          <table><tr><th>항목</th><td>조건</td></tr></table>
          <div class="contBanner"><p>배너 제외</p></div><script>악성 스크립트</script></article>
          <div id="faqAccordion"><h3>질문?</h3><div><span>A.</span> 답과 조건</div></div>''')
        self.assertEqual(article['title'], '제목 & 조건')
        self.assertEqual(article['corePoints'], ['핵심 조건'])
        self.assertEqual([p['text'] for p in article['paragraphs']],
                         ['판단 기준', '앞 설명 뒤', '항목 조건', '질문?', 'A. 답과 조건'])

    def test_all_source_documents_have_substantial_content(self):
        files = list(Path('samples').glob('*.docx'))
        self.assertGreater(len(files), 0)
        for file in files:
            with self.subTest(file=file.name):
                article = compiler.extract(file)
                self.assertTrue(article['title'])
                self.assertGreater(sum(len(p['text']) for p in article['paragraphs']), 1000)
                self.assertFalse(any(p['text'] == '목차' for p in article['paragraphs']))


if __name__ == '__main__':
    unittest.main()
