const fs = require('fs');
const data = JSON.parse(fs.readFileSync('audit_results.json', 'utf8'));

let md = '# KrishiVishal-Admin Errors & Audit Findings\n\n';

if (data.errors && data.errors.length > 0) {
    md += '## Syntax Errors\n\n';
    data.errors.forEach(err => {
        md += `- **File**: \`${err.path}\`\n`;
        md += `  - **Message**: ${err.message.replace(/\n/g, ' ')}\n`;
        if (err.spans) {
            const lines = err.spans.map(s => `Line ${s.start.line}`);
            md += `  - **Locations**: ${lines.join(', ')}\n`;
        }
        md += '\n';
    });
}

if (data.results && data.results.length > 0) {
    md += '## Audit & Security Warnings\n\n';
    data.results.forEach(res => {
        md += `- **File**: \`${res.path}\` (Line ${res.start.line})\n`;
        md += `  - **Issue**: ${res.check_id}\n`;
        md += `  - **Message**: ${res.extra.message}\n\n`;
    });
}

fs.writeFileSync('error_list.md', md);
console.log('Successfully created error_list.md with ' + (data.errors ? data.errors.length : 0) + ' errors and ' + (data.results ? data.results.length : 0) + ' warnings.');
