// Spotify playlist descriptions may contain a little HTML (mostly links).
// Parse into an inert document (scripts and image loads never run there),
// keep a small allowlist of tags, and only allow safe link schemes.

const ALLOWED_TAGS = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'BR']);
const SAFE_HREF = /^(https?:|spotify:)/i;

export function sanitizeDescription(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  // Walk children-first so unwrapping a node doesn't skip its descendants.
  for (const el of [...root.querySelectorAll('*')].reverse()) {
    if (!ALLOWED_TAGS.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    const href = el.getAttribute('href');
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
    if (el.tagName === 'A') {
      if (href && SAFE_HREF.test(href.trim())) {
        el.setAttribute('href', href.trim());
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.replaceWith(...el.childNodes);
      }
    }
  }
  return root.innerHTML;
}
