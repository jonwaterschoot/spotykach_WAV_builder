export const mdToHtml = (md: string) => {
    if (!md) return '';
    let escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = escaped.split('\n');
    let html = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Inline formatting
        line = line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        line = line.replace(/__(.*?)__/g, '<u>$1</u>');
        line = line.replace(/~~(.*?)~~/g, '<s>$1</s>');
        line = line.replace(/\*(.*?)\*/g, '<i>$1</i>');
        line = line.replace(/_(.*?)_/g, '<i>$1</i>'); // italic single underscore

        // Block formatting
        if (line.match(/^#\s+(.*)/)) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h1>${line.replace(/^#\s+/, '')}</h1>`;
        } else if (line.match(/^##\s+(.*)/)) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<h2>${line.replace(/^##\s+/, '')}</h2>`;
        } else if (line.match(/^-\s+(.*)/)) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${line.replace(/^-\s+/, '')}</li>`;
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            // Let contentEditable manage raw text if it's the first line, otherwise wrap in div to simulate standard browser br handling
            if (i === 0 && line !== '') {
                html += line;
            } else {
                html += `<div>${line === '' ? '<br>' : line}</div>`;
            }
        }
    }
    if (inList) html += '</ul>';
    return html;
};

export const htmlToMd = (html: string) => {
    if (!html) return '';
    const span = document.createElement('div');
    span.innerHTML = html;

    let md = '';

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            md += node.textContent;
            return;
        }

        const el = node as HTMLElement;
        const tag = el.tagName?.toLowerCase();

        let prefix = '';
        let suffix = '';

        if (tag === 'b' || tag === 'strong') { prefix = '**'; suffix = '**'; }
        else if (tag === 'i' || tag === 'em') { prefix = '*'; suffix = '*'; }
        else if (tag === 'u') { prefix = '__'; suffix = '__'; }
        else if (tag === 's' || tag === 'strike') { prefix = '~~'; suffix = '~~'; }
        else if (tag === 'h1') { prefix = '\n# '; suffix = '\n'; }
        else if (tag === 'h2') { prefix = '\n## '; suffix = '\n'; }
        else if (tag === 'li') { prefix = '- '; suffix = '\n'; }
        else if (tag === 'ul') { prefix = '\n'; suffix = '\n'; }
        else if (tag === 'div' || tag === 'p') { prefix = '\n'; suffix = ''; }
        else if (tag === 'br') {
            // Avoid double newline if the <br> is just a spacer inside an empty <div>
            if (el.parentNode && el.parentNode.childNodes.length === 1 && (el.parentNode as HTMLElement).tagName.toLowerCase() === 'div') {
                return;
            }
            md += '\n';
            return;
        }

        md += prefix;
        el.childNodes.forEach(walk);
        md += suffix;
    };

    span.childNodes.forEach(walk);

    // Remove the leading newline if the editor generated multiple divs
    let result = md.replace(/\n{3,}/g, '\n\n');
    if (result.startsWith('\n')) {
        result = result.substring(1);
    }
    return result;
};
