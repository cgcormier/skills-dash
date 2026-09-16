import { ArrowLeft, ArrowUpRight, Copy, Edit3, Star, Archive } from 'lucide-react';
import type { Skill } from '../domain/workspace';

function Markdown({ text }: { text: string }) {
  // Render a deliberately small, safe Markdown subset. Raw HTML is always text.
  return <div className="markdown">{text.split('\n').map((line, index) => {
    if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h2 key={index}>{line.slice(2)}</h2>;
    if (/^---+$/.test(line)) return <hr key={index} />;
    if (/^\d+\. /.test(line) || line.startsWith('- ')) return <p className="instruction-step" key={index}>{line}</p>;
    return line.trim() ? <p key={index}>{line}</p> : null;
  })}</div>;
}

export function Dossier({ skill, skills, full, onEdit, onSelect, onExpand, onBack, onFavorite, onArchive, notify }: { skill: Skill; skills: Skill[]; full?: boolean; onEdit: () => void; onSelect: (id: string) => void; onExpand: () => void; onBack: () => void; onFavorite: () => void; onArchive: () => void; notify: (message: string) => void }) {
  const related = skills.filter(s => skill.relatedIds.includes(s.id) || s.relatedIds.includes(skill.id));
  const number = String(skills.findIndex(s => s.id === skill.id) + 1).padStart(3, '0');
  async function copy() { try { await navigator.clipboard.writeText(skill.body); notify('Instructions copied to clipboard.'); } catch { notify('Clipboard unavailable. Open Edit skill to select and copy the instructions.'); } }
  return <section className={`dossier ${full ? 'full-dossier' : ''}`} aria-label="Selected skill dossier">
    <div className="dossier-top"><span className="eyebrow">DOSSIER / {number}</span>{full ? <button onClick={onBack} className="text-button"><ArrowLeft size={14} /> Back to index</button> : <button className="icon-button" onClick={onExpand} aria-label="Open full dossier"><ArrowUpRight size={18} /></button>}</div>
    <div className="dossier-image" aria-hidden="true"><img src="/images/xray.jpg" alt="" /><span>THE HUMAN<br />IN THE MACHINE.</span><div className="image-cross">+</div></div>
    <div className="dossier-content">
      <div className="dossier-category"><span>{skill.category}</span><button className={`icon-button ${skill.favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={skill.favorite ? 'Unpin selected skill' : 'Pin selected skill'} aria-pressed={skill.favorite}><Star size={18} fill={skill.favorite ? 'currentColor' : 'none'} /></button></div>
      <h2>{skill.title}</h2><p className="dossier-summary">{skill.summary || 'No description yet. Add one to explain when this skill should be used.'}</p>
      <div className="dossier-actions"><button className="ink-button" onClick={onEdit}><Edit3 size={15} /> Edit skill <kbd>E</kbd></button><button className="paper-button" onClick={copy} aria-label="Copy instructions"><Copy size={16} /></button></div>
      <dl className="metadata"><div><dt>Status</dt><dd><span className={`status-dot ${skill.status}`} /> {skill.status}</dd></div><div><dt>Updated</dt><dd>{new Date(skill.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div><div><dt>Format</dt><dd>Markdown instruction</dd></div></dl>
      <div className="tags">{skill.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className="dossier-section-title"><span>01 / INSTRUCTIONS</span>{!full && <button className="text-button" onClick={onExpand}>Read all <ArrowUpRight size={13} /></button>}</div>
      {full ? <Markdown text={skill.body || 'No instructions yet.'} /> : <div className="instruction-preview"><p>{skill.body.split('\n').filter(line => line && !line.startsWith('#'))[0] || 'No instructions yet.'}</p></div>}
      <div className="dossier-section-title"><span>02 / CONNECTIONS</span><span>{String(related.length).padStart(2, '0')}</span></div>
      <div className="related-list">{related.length ? related.map(s => <button key={s.id} onClick={() => onSelect(s.id)}>{s.title}<ArrowUpRight size={14} /></button>) : <p className="muted">No connections yet. Add one in the editor.</p>}</div>
      <button className="archive-action" onClick={onArchive}><Archive size={14} /> {skill.status === 'archived' ? 'Restore to active' : 'Archive skill'}</button>
      <div className="dossier-stamp" aria-hidden="true"><div className="barcode" /><span>SKILL ARCHIVE / {number} / LOCAL</span></div>
    </div>
  </section>;
}
