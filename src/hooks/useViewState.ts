import { useEffect, useState } from 'react';
export type ViewState = { view: 'index' | 'atlas' | 'posters' | 'dossier'; selected: string; query: string; category: string; status: string; collection: 'all' | 'pinned'; sort: 'title' | 'updated' };
function read(): ViewState {
  const p = new URLSearchParams(location.search);
  return { view: ['index', 'atlas', 'posters', 'dossier'].includes(p.get('view') || '') ? p.get('view') as ViewState['view'] : 'index', selected: p.get('skill') || 'interface-design', query: p.get('q') || '', category: p.get('category') || '', status: ['active', 'draft', 'archived'].includes(p.get('status') || '') ? p.get('status')! : '', collection: p.get('collection') === 'pinned' ? 'pinned' : 'all', sort: p.get('sort') === 'updated' ? 'updated' : 'title' };
}
export function useViewState() {
  const [state, setState] = useState(read);
  useEffect(() => { const update = () => setState(read()); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  function update(patch: Partial<ViewState>, replace = false) {
    const next = { ...read(), ...patch };
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries({ view: next.view, skill: next.selected, q: next.query, category: next.category, status: next.status, collection: next.collection, sort: next.sort })) if (value) p.set(key, value);
    window.history[replace ? 'replaceState' : 'pushState']({}, '', `${location.pathname}?${p}`); setState(next);
  }
  return [state, update] as const;
}
