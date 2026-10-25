async (page) => {
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9237')
  const p=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().startsWith('http://tauri.localhost'))
  if(!p)throw new Error('Packaged WebView missing; development mode is not accepted')
  const invoke=(command,args={})=>p.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
  const checks=[]
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message)}
  const initial=await invoke('lifecycle_read')
  check(initial.profile.test&&initial.profile.dataDir.replace(/\\/g,'/').endsWith('/feature-skill-improvement-v1/output/profiles/cycle-v1/app-data'),'Packaged process uses the exact isolated cycle profile')
  const before=JSON.parse(initial.raw)
  check(before.observations.length===5&&before.receipts.filter(item=>item.status==='imported').length===5,'All five actual task reports imported, including reports written while closed')
  check(before.reviews.length===3&&before.reviews.filter(item=>['published','restored'].includes(item.status)).length===2,'Real publication/recovery history survived process shutdown and packaged launch')
  check(before.settings.threshold===5&&before.settings.defaultMode==='propose','Review settings survived restart')
  const followups=before.observations.filter(item=>item.taskId==='demo-followup-content-pack-2026-10-24')
  const revisedHashes=await p.evaluate(async reviews=>Promise.all(reviews.filter(review=>review.publication).map(async review=>({folder:review.snapshot.skill.folder,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(review.publication.proposedContent)))).map(value=>value.toString(16).padStart(2,'0')).join('')}))),before.reviews)
  check(followups.length===2&&followups.every(item=>revisedHashes.some(revision=>revision.folder===item.folder&&revision.hash===item.revision)),'Subsequent actual tasks loaded the published revisions')
  check(await p.locator('.runtime').innerText()==='DESKTOP · FILES','Packaged native runtime indicator verified')
  if(await p.getByRole('dialog').isVisible())await p.keyboard.press('Escape')
  for(const folder of ['improvement-pilot-tags','improvement-pilot-slugs']){
    const review=before.reviews.filter(item=>item.snapshot.skill.folder===folder).at(-1)
    const original=review.snapshot.content
    const proposed=review.result.proposedContent
    await p.locator('.skill-row').filter({hasText:folder}).click()
    if(review.status==='restored'){
      check((await invoke('read_skill',{folder})).content===original,`${folder}: previously completed recovery retains exact original bytes`)
      continue
    }
    const ownedSentinel=proposed+'\n<!-- isolated recovery refusal test -->\n'
    if((await invoke('read_skill',{folder})).content===ownedSentinel)await invoke('save_skill',{folder,expectedContent:ownedSentinel,content:proposed})
    check((await invoke('read_skill',{folder})).content===proposed,`${folder}: packaged source matches validated candidate`)
    const restore=p.getByRole('button',{name:'Restore previous version',exact:true})
    await restore.waitFor()
    if(folder==='improvement-pilot-tags'){
      const newer=proposed+'\n<!-- isolated recovery refusal test -->\n'
      await invoke('save_skill',{folder,expectedContent:proposed,content:newer})
      await restore.click()
      await p.getByRole('alert').filter({hasText:'Refusing stale restoration'}).first().waitFor()
      check((await invoke('read_skill',{folder})).content===newer,'Stale restoration refuses to overwrite unexpected newer source')
      await invoke('save_skill',{folder,expectedContent:newer,content:proposed})
    }
    await restore.click()
    await p.getByRole('article',{name:'Review restored',exact:true}).waitFor()
    check((await invoke('read_skill',{folder})).content===original,`${folder}: recovery restored exact previous bytes through checked save`)
    const copies=await invoke('list_skill_recoveries',{folder})
    let retained=false
    for(const copy of copies){if(copy.previousPath&&(await invoke('read_skill_recovery',{folder,id:copy.id,version:'previous'}))===proposed)retained=true}
    check(retained,`${folder}: restoration retained the replaced proposal as a recovery copy`)
  }
  await p.getByRole('button',{name:'Improvement settings',exact:true}).click()
  const dialog=p.getByRole('dialog',{name:'Skill improvement settings'})
  const master=p.getByLabel('Enable skill improvement',{exact:false})
  if(await master.isChecked())await master.click()
  await p.waitForFunction(()=>!document.querySelector('.improvement-settings input[type=checkbox]')?.checked)
  await p.keyboard.press('Control+k')
  check(await dialog.evaluate(el=>el.contains(document.activeElement)),'Packaged keyboard shortcut preserves dialog focus')
  for(let index=0;index<15;index++){await p.keyboard.press('Tab');check(await dialog.evaluate(el=>el.contains(document.activeElement)),`Packaged dialog Tab containment ${index+1}`)}
  await p.keyboard.press('Escape')
  await p.getByLabel('Reduce effects',{exact:true}).check()
  await p.emulateMedia({reducedMotion:'reduce'})
  for(const [width,height] of [[390,844],[768,900],[1280,900]]){
    await p.setViewportSize({width,height})
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Packaged ${width}px layout fits`)
    await p.screenshot({path:`output/playwright/improvement-packaged-${width}.png`})
  }
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('.dossier')).backgroundImage==='none'),'Packaged reduced effects removes paper decoration')
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('.secondary')).transitionDuration.split(',').every(value=>parseFloat(value)===0)),'Packaged reduced motion removes transitions')
  await p.locator('.skill-improvement').scrollIntoViewIfNeeded()
  await p.screenshot({path:'output/playwright/improvement-packaged-recovered.png'})
  const final=JSON.parse((await invoke('lifecycle_read')).raw)
  check(!final.settings.enabled&&final.reviews.filter(item=>item.status==='restored').length===2,'Packaged recovery persisted and the isolated profile is left Off')
  return {profile:initial.profile,observations:final.observations.length,reviewStatuses:final.reviews.map(item=>item.status),checks}
}
