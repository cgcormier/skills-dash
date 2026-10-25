async (page) => {
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9237')
  const p=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().includes('127.0.0.1:1420')||p.url().includes('tauri.localhost'))
  if(!p)throw new Error('Native workbench missing')
  const invoke=(command,args={})=>p.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
  const profile=await invoke('lifecycle_profile')
  if(!profile.test||!profile.dataDir.replace(/\\/g,'/').endsWith('/feature-skill-improvement-v1/output/profiles/cycle-v1/app-data'))throw new Error('Wrong isolated profile')
  await p.getByRole('button',{name:/improvement-pilot-slugs improvement-pilot-slugs\/SKILL.md/}).click()
  const deadline=Date.now()+210000
  let state
  while(Date.now()<deadline){state=await invoke('lifecycle_read');const latest=JSON.parse(state.raw).reviews.filter(review=>review.snapshot.skill.folder==='improvement-pilot-slugs').at(-1);if(latest&&latest.status!=='reviewing')break;await p.waitForTimeout(1000)}
  if(!state)throw new Error('No lifecycle state')
  const store=JSON.parse(state.raw)
  const review=store.reviews.filter(review=>review.snapshot.skill.folder==='improvement-pilot-slugs').at(-1)
  if(store.observations.length!==2||store.receipts.filter(receipt=>receipt.status==='imported').length!==2)throw new Error('Agent reporter output not imported exactly once')
  if(review.status!=='proposal'||review.result?.decision!=='proposal')throw new Error(`Live reviewer did not return a proposal: ${JSON.stringify(review)}`)
  if(review.validation?.behavioral!=='passed'||!review.validation.scope)throw new Error(`Live proposal failed independent validation: ${JSON.stringify(review.validation)}`)
  const current=await invoke('read_skill',{folder:'improvement-pilot-slugs'})
  if(current.content!==review.snapshot.content||!current.content.includes('"lowercase": false'))throw new Error('Propose mode changed source before approval')
  if(review.snapshot.evidence.length!==1||review.result.evidenceIds[0]!==review.snapshot.evidence[0].id)throw new Error('Review evidence coverage mismatch')
  await p.getByRole('button',{name:'Apply proposal',exact:true}).waitFor()
  await p.locator('.skill-improvement').scrollIntoViewIfNeeded()
  await p.screenshot({path:'output/playwright/improvement-native-proposal.png',fullPage:true})
  return {profile,revision:state.revision,reviewId:review.id,status:review.status,usage:review.usage,validation:review.validation,evidenceIds:review.result.evidenceIds,observations:store.observations.map(item=>({id:item.id,taskId:item.taskId,revision:item.revision})),checks:['Closed-app agent reports imported via native store','Configured threshold1 started a live review','Live proposal passed registered holdouts against proposed bytes','Propose waits for explicit approval with source unchanged','Exact evidence IDs retained']}
}
