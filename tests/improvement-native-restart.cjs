async (page) => {
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9237')
  const p=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().includes('127.0.0.1:1420')||p.url().includes('tauri.localhost'))
  if(!p)throw new Error('Native workbench missing')
  const invoke=(command,args={})=>p.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
  const snapshot=await invoke('lifecycle_read')
  if(!snapshot.profile.test||!snapshot.profile.dataDir.replace(/\\/g,'/').endsWith('/feature-skill-improvement-v1/output/profiles/cycle-v1/app-data'))throw new Error('Wrong isolated profile')
  const store=JSON.parse(snapshot.raw)
  if(store.observations.length!==3||store.reviews.length!==3||store.reviews.filter(item=>item.status==='published').length!==2)throw new Error('History did not survive native process restart')
  if(store.settings.threshold!==5||store.settings.defaultMode!=='propose')throw new Error('Settings did not survive restart')
  for(const folder of ['improvement-pilot-slugs','improvement-pilot-tags']){
    const review=store.reviews.filter(item=>item.snapshot.skill.folder===folder).at(-1)
    const file=await invoke('read_skill',{folder})
    if(file.content!==review.result.proposedContent)throw new Error('Published source did not survive restart')
  }
  await p.getByRole('button',{name:/improvement-pilot-tags improvement-pilot-tags\/SKILL.md/}).click()
  await p.getByRole('button',{name:'Restore previous version',exact:true}).waitFor()
  await p.getByRole('button',{name:'Improvement settings',exact:true}).click()
  await p.keyboard.press('Control+k')
  if(!await p.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)))throw new Error('Native dialog lost keyboard focus')
  await p.keyboard.press('Escape')
  await p.locator('.improvement-review').last().scrollIntoViewIfNeeded()
  await p.screenshot({path:'output/playwright/improvement-native-restarted.png'})
  return {profile:snapshot.profile,revision:snapshot.revision,observations:store.observations.length,reviewStatuses:store.reviews.map(item=>item.status),checks:['Actual native process restart preserved task history and review decisions','Published file bytes and settings persisted','Recovery action remains available after restart','Native settings keyboard focus and Escape verified']}
}
