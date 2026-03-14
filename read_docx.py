import zipfile
import re
import sys

docx_path = r'C:\Users\23223\Desktop\麻将\01-B22040310-朱家骏-开题报告-四川双打竞技麻将比赛设计与实现.docx'

with zipfile.ZipFile(docx_path, 'r') as z:
    with z.open('word/document.xml') as f:
        xml_content = f.read().decode('utf-8')

# Extract text between <w:t> tags
texts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml_content)

# Group into paragraphs by splitting on </w:p>
para_chunks = xml_content.split('</w:p>')
para_texts = []
for chunk in para_chunks:
    t_matches = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', chunk)
    combined = ''.join(t_matches).strip()
    if combined:
        para_texts.append(combined)

output = '\n'.join(para_texts)
with open(r'c:\Users\23223\Desktop\麻将\report_content.txt', 'w', encoding='utf-8') as f:
    f.write(output)

print(f'Extracted {len(para_texts)} paragraphs')
for i, t in enumerate(para_texts[:80]):
    print(f'[{i}] {t[:200]}')
