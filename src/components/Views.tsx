import { ArrowUpRight, Star, Network, Link2 } from 'lucide-react';
import { relationshipEdges, type Skill, type Status } from '../domain/workspace';

type ViewProps = { skills: Skill[]; allSkills: Skill[]; selectedId: string; onSelect: (id: string) => void; onOpen: (id: string) => void };

export function SkillIndex({ skills, allSkills, selectedId, onSelect, onOpen, onFavorite, onStatus }: ViewProps & { onFavorite: (skill: Skill) => void; onStatus: (skill: Skill, status: Status) => void }) {
  return <div className="table-scroll"><table className="skill-table"><caption className="sr-only">Skills in the current collection. Select a skill to inspect it, or open its dossier.</caption><thead><tr><th className="number-column">NO.</th><th>SKILL / DESCRIPTION</th><th className="category-column">CATEGORY</th><th className="status-column">STATUS</th><th className="pin-column"><span className="sr-only">Pinned</span><Star size={12} /></th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{skills.map(skill => <tr key={skill.id} className={skill.id === selectedId ? 'selected' : ''} data-selected={skill.id === selectedId}>
    <td className="record-number">{String(allSkills.findIndex(s => s.id === skill.id) + 1).padStart(3, '0')}</td><td><button className="skill-name" onClick={() => onSelect(skill.id)} onDoubleClick={() => onOpen(skill.id)} aria-pressed={skill.id === selectedId}><span>{skill.title}</span><small>{skill.summary || 'No description'}</small></button></td><td className="category-column"><span className="category-label">{skill.category}</span></td><td className="status-column"><label className="sr-only" htmlFor={`status-${skill.id}`}>Status for {skill.title}</label><select id={`status-${skill.id}`} className={`inline-status ${skill.status}`} value={skill.status} onChange={e => onStatus(skill, e.target.value as Status)}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></td><td><button className={`icon-button pin-button ${skill.favorite ? 'is-favorite' : ''}`} onClick={() => onFavorite(skill)} aria-label={`${skill.favorite ? 'Unpin' : 'Pin'} ${skill.title}`} aria-pressed={skill.favorite}><Star size={16} fill={skill.favorite ? 'currentColor' : 'none'} /></button></td><td><button className="icon-button open-record" aria-label={`Open ${skill.title} dossier`} onClick={() => onOpen(skill.id)}><ArrowUpRight size={17} /></button></td>
  </tr>)}</tbody></table></div>;
}

export function Atlas({ skills, selectedId, onSelect, onOpen }: ViewProps) {
  const edges = relationshipEdges(skills);
  const categories = [...new Set(skills.map(s => s.category))];
  // Deterministic category columns. Semantic buttons are the primary interaction.
  const nodes = skills.map(skill => {
    const group = categories.indexOf(skill.category);
    const row = skills.filter(s => s.category === skill.category).findIndex(s => s.id === skill.id);
    return { skill, x: 130 + group * 225, y: 110 + row * 120 };
  });
  const width = Math.max(700, categories.length * 225 + 40);
  const height = Math.max(450, ...nodes.map(n => n.y + 90));
  return <div className="atlas"><div className="view-note"><Network size={16} /><span>Connections, made explicit.</span><span>{edges.length} links in this view</span></div><div className="atlas-scroll"><div className="atlas-canvas" style={{ width, height }}>
    <svg className="atlas-lines" width={width} height={height} aria-hidden="true">{edges.map(([from, to]) => { const a = nodes.find(n => n.skill.id === from)!; const b = nodes.find(n => n.skill.id === to)!; return <path key={`${from}-${to}`} d={`M ${a.x} ${a.y} C ${a.x + 80} ${a.y + 40}, ${b.x - 80} ${b.y - 40}, ${b.x} ${b.y}`} className={selectedId === from || selectedId === to ? 'active-edge' : ''} />; })}</svg>
    {categories.map((category, index) => <span key={category} className="atlas-category" style={{ left: 40 + index * 225 }}>{String(index + 1).padStart(2, '0')} / {category}</span>)}
    {nodes.map(({ skill, x, y }) => <button key={skill.id} className={`atlas-node ${selectedId === skill.id ? 'selected' : ''}`} style={{ left: x - 90, top: y - 30 }} onClick={() => onSelect(skill.id)} onDoubleClick={() => onOpen(skill.id)} aria-pressed={selectedId === skill.id}><span className="eyebrow">{skill.category}</span><strong>{skill.title}</strong><span><Link2 size={11} /> {skills.filter(s => skill.relatedIds.includes(s.id) || s.relatedIds.includes(skill.id)).length} connections</span></button>)}
  </div></div><div className="atlas-legend"><span className="status-dot" /> Only saved relationships appear. Select a record to inspect its connections.</div></div>;
}

export function Posters({ skills, selectedId, onSelect, onOpen }: ViewProps) {
  const images = ['/images/eye.jpg', '/images/smoke.jpg', '/images/xray.jpg', '/images/silhouette.jpg'];
  return <div className="poster-grid">{skills.map((skill, index) => <article className={`skill-poster poster-${index % 4} ${selectedId === skill.id ? 'selected' : ''}`} key={skill.id}>
    <button className="poster-select" aria-label={`Select ${skill.title}`} aria-pressed={selectedId === skill.id} onClick={() => onSelect(skill.id)}><span className="poster-meta">{String(index + 1).padStart(3, '0')} / {skill.category}</span><img src={images[index % images.length]} alt="" loading="lazy" /><h2>{skill.title}</h2><span className="poster-caption">{skill.summary}</span></button><button className="poster-open" onClick={() => onOpen(skill.id)}>Open dossier <ArrowUpRight size={16} /></button>
  </article>)}</div>;
}
