async (page) => {
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9237')
  const p=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().includes('127.0.0.1:1420')||p.url().includes('tauri.localhost'))
  if(!p)throw new Error('Native workbench missing')
  const invoke=(command,args={})=>p.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
  const profile=await invoke('lifecycle_profile')
  if(!profile.test||!profile.dataDir.replace(/\\/g,'/').endsWith('/feature-skill-improvement-v1/output/profiles/cycle-v1/app-data'))throw new Error('Wrong isolated profile')
  const waitReview=async(folder,afterId=null)=>{const deadline=Date.now()+210000;while(Date.now()<deadline){const state=await invoke('lifecycle_read');const review=JSON.parse(state.raw).reviews.filter(item=>item.snapshot.skill.folder===folder).at(-1);if(review&&review.id!==afterId&&review.status!=='reviewing'&&review.status!=='publishing')return review;await p.waitForTimeout(1000)}throw new Error('Timed out waiting for review')}
  await p.getByRole('button',{name:/improvement-pilot-slugs improvement-pilot-slugs\/SKILL.md/}).click()
  const before=JSON.parse((await invoke('lifecycle_read')).raw)
  if(before.reviews.filter(item=>item.snapshot.skill.folder==='improvement-pilot-slugs').at(-1)?.status==='proposal')await p.getByRole('button',{name:'Apply proposal',exact:true}).click()
  await p.getByRole('button',{name:'Restore previous version',exact:true}).waitFor()
  const slugReview=await waitReview('improvement-pilot-slugs')
  if(slugReview.status!=='published'||slugReview.mode!=='propose')throw new Error('Explicit approval did not publish the Propose review')
  const slugFile=await invoke('read_skill',{folder:'improvement-pilot-slugs'})
  if(slugFile.content!==slugReview.result.proposedContent)throw new Error('Published slug bytes differ from validated candidate')
  await p.getByRole('button',{name:/improvement-pilot-tags improvement-pilot-tags\/SKILL.md/}).click()
  const previousTag=JSON.parse((await invoke('lifecycle_read')).raw).reviews.filter(item=>item.snapshot.skill.folder==='improvement-pilot-tags').at(-1)
  await p.getByLabel('Mode for this skill',{exact:true}).selectOption('auto-update')
  const tagReview=await waitReview('improvement-pilot-tags',previousTag?.status==='insufficient-evidence'?previousTag.id:null)
  if(tagReview.status!=='published'||tagReview.mode!=='auto-update'||tagReview.validation.behavioral!=='passed')throw new Error(`Auto publication did not pass: ${JSON.stringify(tagReview)}`)
  const tagFile=await invoke('read_skill',{folder:'improvement-pilot-tags'})
  if(tagFile.content!==tagReview.result.proposedContent||!tagFile.content.includes('"unique": true'))throw new Error('Auto candidate not actually published to disk')
  const copies=await invoke('list_skill_recoveries',{folder:'improvement-pilot-tags'})
  let found=false
  for(const copy of copies){if(copy.previousPath&&(await invoke('read_skill_recovery',{folder:'improvement-pilot-tags',id:copy.id,version:'previous'}))===tagReview.snapshot.content)found=true}
  if(!found)throw new Error('Prior tag revision not preserved in native recovery')
  // Return to the production default threshold before the subsequent real task.
  await p.getByRole('button',{name:'Improvement settings',exact:true}).click()
  await p.getByLabel('Uses before review',{exact:true}).fill('5')
  await p.getByRole('button',{name:'Done',exact:true}).click()
  await p.getByLabel('Mode for this skill',{exact:true}).selectOption('inherit')
  await p.waitForTimeout(300)
  await p.locator('.skill-improvement').scrollIntoViewIfNeeded()
  await p.screenshot({path:'output/playwright/improvement-native-auto-published.png',fullPage:true})
  const after=JSON.parse((await invoke('lifecycle_read')).raw)
  if(after.settings.threshold!==5)throw new Error('Threshold did not return to five')
  return {profile,slugReviewId:slugReview.id,tagReviewId:tagReview.id,tagUsage:tagReview.usage,tagValidation:tagReview.validation,checks:['Manual Propose approval used native checked save','Auto-update published live validated candidate without Apply click','Published bytes match validated revisions','Previous version exists in native recovery','Default threshold five restored for subsequent tasks']}
}
