async (page) => {
  // All IPC/model responses here are deterministic browser fixtures, not live proof.
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}})
  const p = await context.newPage()
  const results = []
  const errors = []
  p.on('pageerror', error => errors.push(error.message))
  const check = (ok,message) => {if (!ok) throw new Error(message); results.push(message)}
  await p.addInitScript(() => {
    window.isTauri = true
    const folder = 'improvement-pilot-tags'
    const original = '---\nname: improvement-pilot-tags\ndescription: Normalize tags\n---\n# Pilot\nReturn unique lowercase sorted tags.\n\n```skill-task\n{"kind":"normalized-tags","trim":true,"lowercase":true,"unique":false,"sort":true}\n```\n'
    const sourcePath = `C:\\fixture\\.agents\\skills\\${folder}\\SKILL.md`
    const fixture = window.__improvementFixture = {content:original,raw:null,revision:null,reviews:0,reports:[],saves:0}
    const profile = {id:'browser-fixture',root:'C:\\fixture\\.agents\\skills',dataDir:'C:\\fixture\\app-data',test:true}
    const read = () => ({folder,path:sourcePath,content:fixture.content,modifiedMs:1,supportingFiles:[],diagnostics:[],recoveryPath:null})
    window.__TAURI_INTERNALS__ = {
      metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},
      invoke: async (command,args={}) => {
        if (command==='discover_skills') return {root:profile.root,savePolicy:'recoverable-publish',entries:[{folder,path:sourcePath,modifiedMs:1,size:original.length,problem:null}],diagnostics:[]}
        if (command==='read_skill') return read()
        if (command==='list_skill_recoveries') return []
        if (command==='lifecycle_read') return {raw:fixture.raw,revision:fixture.revision,reports:fixture.reports,profile,diagnostics:[]}
        if (command==='lifecycle_write') {if(args.expectedRevision!==fixture.revision)throw 'Fixture CAS conflict';fixture.raw=args.raw;fixture.revision=String(Number(fixture.revision??0)+1);return {revision:fixture.revision}}
        if (command==='reviewer_start') {
          fixture.reviews++
          const snapshot=JSON.parse(args.prompt.split('IMMUTABLE_SNAPSHOT_JSON\n')[1])
          await new Promise(resolve=>setTimeout(resolve,350))
          return {output:JSON.stringify({decision:'proposal',rationale:'Distinct task reports show duplicate tags. Enable the existing uniqueness instruction.',proposedContent:snapshot.content.replace('"unique":false','"unique":true'),evidenceIds:snapshot.evidence.map(item=>item.id)}),usage:{input_tokens:100,output_tokens:30}}
        }
        if (command==='save_skill') {if(args.expectedContent!==fixture.content)throw 'SKILL.md changed outside this app';fixture.content=args.content;fixture.saves++;return {...read(),recoveryPath:'C:\\fixture\\recovery\\previous.md'}}
        if (command==='plugin:window|is_maximized') return true
        if (command==='plugin:event|listen') return 1
        return null
      }
    }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
  })
  try {
    await p.goto('http://127.0.0.1:1420')
    await p.locator('.skill-row').first().click()
    await p.getByRole('region',{name:'Skill improvement',exact:true}).waitFor()
    check(await p.locator('.mode-label').innerText() === 'Effective mode: Off', 'Effective mode is labeled separately from the per-skill preference')
    const openSettings=p.getByRole('button',{name:'Improvement settings',exact:true})
    await openSettings.click()
    const dialog=p.getByRole('dialog',{name:'Skill improvement settings'})
    check(!await p.getByLabel('Enable skill improvement',{exact:false}).isChecked(),'Improvement is opt-in and initially Off')
    check(await p.getByLabel('Default mode',{exact:true}).inputValue()==='propose','First activation defaults to Propose')
    await p.keyboard.press('Control+k')
    check(await dialog.evaluate(el=>el.contains(document.activeElement)),'Global keyboard shortcuts retain settings focus')
    await p.getByLabel('Enable skill improvement',{exact:false}).check()
    await p.getByLabel('Uses before review',{exact:true}).fill('1')
    await p.getByRole('button',{name:'Done',exact:true}).click()
    check(await openSettings.evaluate(el=>el===document.activeElement),'Settings closes and returns focus')
    await p.evaluate(()=>{
      const folder='improvement-pilot-tags'
      window.__improvementFixture.reports.push({id:'inbox-fixture-1',raw:JSON.stringify({version:1,id:'fixture-1',folder,sourcePath:`C:\\fixture\\.agents\\skills\\${folder}\\SKILL.md`,sourceKind:'personal',revision:'a'.repeat(64),taskId:'fixture-task-1',kind:'task',observation:'Input Beta, beta retained duplicate beta after normalization.',evidenceRefs:['fixture:expected-output'],reportedAt:new Date().toISOString()})})
    })
    await p.getByRole('button',{name:'Refresh evidence',exact:true}).click()
    await p.getByRole('button',{name:'Apply proposal',exact:true}).waitFor()
    check(await p.evaluate(()=>window.__improvementFixture.saves===0),'Propose mode waits for approval')
    check(await p.getByText(/Behavior: passed/).isVisible(),'Registered behavior checks are displayed')
    check((await p.locator('.proposal-diff pre').innerText()).includes('"unique":true'),'Proposal diff displays actual candidate change')
    check(await p.getByText('Reviewer rationale:',{exact:true}).isVisible(),'Model rationale is explicitly labeled apart from evidence and validation')
    await p.getByRole('button',{name:'Apply proposal',exact:true}).click()
    await p.getByRole('button',{name:'Restore previous version',exact:true}).waitFor()
    check(await p.evaluate(()=>window.__improvementFixture.saves===1),'Manual approval publishes through checked-save adapter')
    await p.getByRole('button',{name:'Restore previous version',exact:true}).click()
    await p.getByRole('article',{name:'Review restored',exact:true}).waitFor()
    check(await p.evaluate(()=>window.__improvementFixture.saves===2),'Restoration is a separate checked operation')
    await p.getByLabel('Reduce effects',{exact:true}).check()
    await p.emulateMedia({reducedMotion:'reduce'})
    for (const [width,height] of [[375,700],[768,850],[1280,900]]) {
      await p.setViewportSize({width,height})
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px improvement dossier fits`)
      await p.screenshot({path:`output/playwright/improvement-${width}.png`,fullPage:true})
    }
    await p.setViewportSize({width:390,height:844})
    await openSettings.click()
    await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'})
    const violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})))
    check(violations.length===0,`Narrow settings accessibility: ${JSON.stringify(violations)}`)
    for(let index=0;index<15;index++) {
      await p.keyboard.press('Tab')
      check(await dialog.evaluate(el=>{
        const active=document.activeElement
        if(!el.contains(active)) return false
        const rect=active.getBoundingClientRect(), header=el.querySelector('.modal-header').getBoundingClientRect(), bounds=el.getBoundingClientRect()
        return rect.top>=bounds.top&&rect.bottom<=bounds.bottom&&(active.closest('.modal-header')||rect.top>=header.bottom)
      }),`Settings keyboard focus stays contained and unobscured ${index+1}`)
    }
    await dialog.evaluate(el=>el.scrollTop=el.scrollHeight)
    check(await p.getByRole('button',{name:'Close dialog',exact:true}).evaluate(el=>{
      const rect=el.getBoundingClientRect(),bounds=el.closest('dialog').getBoundingClientRect()
      return rect.top>=bounds.top&&rect.bottom<=bounds.bottom
    }),'Settings close control remains visible after scrolling to the end')
    await p.screenshot({path:'output/playwright/improvement-settings-390.png'})
    await p.keyboard.press('Escape')
    check(await p.evaluate(()=>getComputedStyle(document.querySelector('.dossier')).backgroundImage==='none'),'Reduced effects removes paper decoration')
    check(await p.evaluate(()=>getComputedStyle(document.querySelector('.secondary')).transitionDuration.split(',').every(value=>parseFloat(value)===0)),'Reduced motion removes transitions')
    check(errors.length===0,`No runtime exceptions: ${errors.join('; ')}`)
    return results
  } finally {await context.close()}
}
