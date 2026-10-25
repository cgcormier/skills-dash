async (page) => {
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9237')
  const p=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().startsWith('http://tauri.localhost'))
  if(!p)throw new Error('Packaged WebView missing')
  const profile=await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('lifecycle_profile'))
  if(!profile.test||!profile.dataDir.replace(/\\/g,'/').endsWith('/feature-skill-improvement-v1/output/profiles/cycle-v1/app-data'))throw new Error('Wrong isolated test profile')
  // Only confirmation answers are controlled; window IPC and source checks are real.
  // Multiple CDP clients can otherwise auto-dismiss one another's native dialogs.
  await p.evaluate(()=>{window.__qaOriginalConfirm=window.confirm;window.confirm=()=>true})
  await p.setViewportSize({width:1280,height:900})
  await p.locator('.skill-row').filter({hasText:'improvement-pilot-tags'}).click()
  const original=await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('read_skill',{folder:'improvement-pilot-tags'}))
  await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).click()
  const editor=p.locator('#skill-source')
  await editor.fill((await editor.inputValue())+'\n<!-- unsaved isolated close guard check -->')
  await p.evaluate(()=>{window.confirm=()=>false})
  await p.getByRole('button',{name:'Window options',exact:true}).click()
  await p.getByRole('button',{name:'Close window',exact:true}).click()
  await p.getByRole('dialog',{name:'Window options'}).waitFor({state:'hidden'})
  if(p.isClosed()||!(await editor.inputValue()).includes('unsaved isolated close guard check'))throw new Error('Close cancellation did not preserve the unsaved draft')
  await p.evaluate(()=>{window.confirm=()=>true})
  await p.getByRole('button',{name:'Reload disk version',exact:true}).click()
  await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).waitFor()
  const current=await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('read_skill',{folder:'improvement-pilot-tags'}))
  if(current.content!==original.content)throw new Error('Close guard test changed skill source')
  await p.evaluate(()=>{window.confirm=window.__qaOriginalConfirm;delete window.__qaOriginalConfirm})
  await p.getByRole('button',{name:'Window options',exact:true}).click()
  const closed=p.waitForEvent('close',{timeout:15000})
  await p.getByRole('button',{name:'Close window',exact:true}).click({noWaitAfter:true})
  await closed
  return {closed:p.isClosed(),profile,checks:['Dismissing Close preserved the unsaved draft','Explicit discard reloaded unchanged source','Packaged Close action passed the guard and destroyed the test WebView']}
}
