import { useState, type FormEvent } from 'react';
import { Save, ArrowUpRight } from 'lucide-react';
import { CATEGORIES, type Skill, type Status } from '../domain/workspace';
import { Modal } from './Modal';

export function SkillEditor({ skill, skills, isNew, onSave, onClose }: { skill: Skill; skills: Skill[]; isNew: boolean; onSave: (skill: Skill) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(skill);
  const [tags, setTags] = useState(skill.tags.join(', '));
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(skill) || tags !== skill.tags.join(', ');
  function close() { if (dirty) setDiscard(true); else onClose(); }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    try {
      if (!draft.title.trim() || !draft.category.trim()) throw new Error('Give this skill a title and category.');
      onSave({ ...draft, title: draft.title.trim(), category: draft.category.trim(), tags: [...new Set(tags.split(',').map(t => t.trim()).filter(Boolean))] });
    } catch (reason) { setError(String(reason)); }
  }
  return <Modal title={isNew ? 'New skill' : 'Edit skill'} onClose={close} className="editor-modal">
    <form onSubmit={submit} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); submit(); } }}>
      <div className="form-body">
        <div className="form-note"><span className="status-dot" /> {isNew ? 'NEW RECORD' : 'EDITING RECORD'}<span>Changes apply when you save.</span></div>
        <label>Title<input autoFocus required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Give the skill a useful name" /></label>
        <label>Description<textarea rows={2} maxLength={1200} value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} placeholder="What does this skill do, and when should an agent use it?" /></label>
        <div className="form-columns"><label>Category<input list="categories" required maxLength={80} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} /><datalist id="categories">{[...new Set([...CATEGORIES, ...skills.map(s => s.category)])].map(c => <option key={c}>{c}</option>)}</datalist></label><label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Status })}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label></div>
        <label>Tags <span className="label-hint">separate with commas</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="research, evidence, synthesis" /></label>
        <label>Instructions <span className="label-hint">Markdown</span><textarea className="code-input" rows={11} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} placeholder={'# Working method\n\n1. Understand the request.\n2. Do the work.\n3. Verify the result.'} /></label>
        <fieldset><legend>Related skills <span className="label-hint">explicit connections shown in Atlas</span></legend><div className="relationship-options">{skills.filter(s => s.id !== skill.id).map(s => <label className="check-label" key={s.id}><input type="checkbox" checked={draft.relatedIds.includes(s.id)} onChange={e => setDraft({ ...draft, relatedIds: e.target.checked ? [...draft.relatedIds, s.id] : draft.relatedIds.filter(id => id !== s.id) })} />{s.title}<ArrowUpRight size={13} /></label>)}</div></fieldset>
        {error && <p role="alert" className="form-error">{error}</p>}
        {discard && <div className="discard-confirm" role="alert"><p>Discard your unsaved changes?</p><button type="button" className="secondary" onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="danger" onClick={onClose}>Discard changes</button></div>}
      </div>
      <footer className="modal-footer"><button className="secondary" type="button" onClick={close}>Cancel</button><button className="primary" type="submit"><Save size={16} /> Save skill <kbd>Ctrl S</kbd></button></footer>
    </form>
  </Modal>;
}
