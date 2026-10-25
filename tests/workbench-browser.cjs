async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } })
  const p = await context.newPage()
  const results = []
  const errors = []
  p.on('pageerror', error => errors.push(error.message))
  const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message) }
  const fits = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  const focusContrast = control => control.evaluate(el => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0,3).map(value => {
        const channel=Number(value)/255
        return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4
      })
      return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722
    }
    let surface=el.parentElement
    while(getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)') surface=surface.parentElement
    const outline=luminance(getComputedStyle(el).outlineColor),background=luminance(getComputedStyle(surface).backgroundColor)
    return (Math.max(outline,background)+0.05)/(Math.min(outline,background)+0.05)
  })
  try {
    await p.goto('http://127.0.0.1:1420')
    await p.getByText('BROWSER · NO FILE ACCESS', {exact:true}).waitFor()
    check(await p.locator('.skill-row').count() === 0, 'Browser production path never populates starters')
    check(await p.evaluate(() => localStorage.getItem('skill-archive.workspace.v1') === null), 'Opening app creates no legacy storage')
    check(await p.getByRole('alert').innerText().then(t => t.includes('desktop app')), 'Browser filesystem limitation is explicit')
    await p.addInitScript(() => {
      window.isTauri = true
      window.__fixture = {
        files: {
          alpha: '---\r\nname: alpha\r\ndescription: First personal skill\r\nunknown: { retained: true }\r\n---\r\n# Alpha\r\n<script>window.executed = true</script>\r\n',
          broken: '---\nname: [broken\n---\nOriginal malformed content',
        },
        failRead: false, failDiscover: false, failSave: false, recoveries:[],
      }
      const fixture = window.__fixture
      const read = folder => ({folder, path: `C:\\Users\\test\\.agents\\skills\\${folder}\\SKILL.md`, content: fixture.files[folder], modifiedMs: 1792300000000, supportingFiles: [{path:'scripts/helper.ps1',kind:'file',size:10},{path:'references',kind:'directory',size:null}], diagnostics: [], recoveryPath:null})
      window.__TAURI_INTERNALS__ = {
        metadata: {currentWindow:{label:'main'},currentWebview:{label:'main'}},
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command, args) => {
          if (command === 'lifecycle_read') return {raw:fixture.lifecycleRaw??null,revision:fixture.lifecycleRevision??null,reports:[],profile:{id:'browser-fixture',root:'C:\\Users\\test\\.agents\\skills',dataDir:'C:\\test\\app-data',test:true},diagnostics:[]}
          if (command === 'lifecycle_write') {fixture.lifecycleRaw=args.raw;fixture.lifecycleRevision=String(Number(fixture.lifecycleRevision??0)+1);return {revision:fixture.lifecycleRevision}}
          if (command === 'discover_skills') {
            if (fixture.failDiscover) throw 'Discovery permission denied'
            return {root:'C:\\Users\\test\\.agents\\skills',savePolicy:'recoverable-publish',entries:[...Object.keys(fixture.files).map(folder => ({folder,path:read(folder).path,modifiedMs:1792300000000,size:100,problem:null})),{folder:'missing',path:'C:\\Users\\test\\.agents\\skills\\missing\\SKILL.md',modifiedMs:null,size:null,problem:'SKILL.md is missing'}],diagnostics:[]}
          }
          if (command === 'read_skill') {
            if (fixture.failRead || !(args.folder in fixture.files)) throw 'File unavailable'
            return read(args.folder)
          }
          if (command === 'save_skill') {
            if (args.expectedContent !== fixture.files[args.folder]) throw 'SKILL.md changed outside this app'
            if (fixture.failSave) throw 'Saving unavailable: fixture rejection'
            fixture.recoveries.push({id:'fixture-1',folder:args.folder,previousPath:'C:\\Recovery\\previous.md',draftPath:'C:\\Recovery\\draft.md',createdMs:1792300000000,diagnostics:[],previousContent:fixture.files[args.folder],draftContent:args.content})
            fixture.files[args.folder] = args.content
            return {...read(args.folder),recoveryPath:'C:\\Recovery\\previous-SKILL.md'}
          }
          if (command === 'list_skill_recoveries') return fixture.recoveries.filter(copy=>copy.folder===args.folder)
          if (command === 'read_skill_recovery') {const copy=fixture.recoveries.find(copy=>copy.folder===args.folder&&copy.id===args.id);return args.version==='previous'?copy.previousContent:copy.draftContent}
          if (command === 'read_legacy_archive') return args.backup ? '{"version":1,"skills":[]}' : '{corrupt raw archive'
          if (command === 'plugin:window|is_maximized') return true
          if (command === 'plugin:event|listen') return 1
          return null
        }
      }
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:()=>{}}
    })
    await p.reload()
    await p.getByRole('button',{name:/alpha alpha\/SKILL.md/}).waitFor()
    check(await p.locator('.skill-row').count() === 3, 'Valid, malformed and missing skills stay visible together')
    check(await p.locator('.skill-count').innerText() === '3 skills', 'List count names what is being counted')
    await p.keyboard.press('Control+k')
    await p.waitForFunction(()=>document.activeElement===document.querySelector('.search input'))
    check(await p.getByRole('textbox',{name:'Search skills',exact:true}).evaluate(el => el === document.activeElement), 'Ctrl K focuses search')
    await p.getByRole('textbox',{name:'Search skills',exact:true}).fill('retained')
    check(await p.locator('.skill-row').count() === 1, 'Search includes raw unknown metadata')
    check(await p.locator('.skill-count').innerText() === '1 of 3 skills', 'Filtered count shows matching and total skills')
    await p.keyboard.press('Tab')
    check(await p.getByRole('button',{name:'Clear search',exact:true}).evaluate(el=>el===document.activeElement), 'Clear search is reachable from the search field by keyboard')
    await p.keyboard.press('Enter')
    check(await p.locator('.skill-row').count() === 3 && await p.getByRole('textbox',{name:'Search skills',exact:true}).evaluate(el=>el===document.activeElement), 'Clearing search restores the list and returns focus to search')
    await p.getByRole('textbox',{name:'Search skills',exact:true}).fill('no matching skill')
    check(await p.locator('.empty-list').innerText() === 'No files match your search.', 'Empty search results explain the state')
    await p.getByRole('button',{name:'Clear search',exact:true}).click()
    check(await p.getByRole('button',{name:'Clear search',exact:true}).count() === 0, 'Clear search disappears when the query is empty')
    check(await p.locator('.row-status').first().evaluate(el=>getComputedStyle(el).color!==getComputedStyle(document.querySelector('.row-status.has-issues')).color), 'Healthy rows use a neutral status while problems retain warning color and text')
    check(await p.getByRole('textbox',{name:'Search skills',exact:true}).evaluate(el=>el.matches(':focus-visible')) && await focusContrast(p.getByRole('textbox',{name:'Search skills',exact:true}))>=3, 'Keyboard focus has at least 3:1 contrast on the dark list')
    await p.locator('.skill-row').first().focus()
    await p.keyboard.press('ArrowDown')
    check(await p.locator('.skill-row').nth(1).evaluate(el => el === document.activeElement), 'Arrow keys navigate the file list')
    await p.locator('.skill-row').first().click()
    await p.getByRole('heading',{name:'alpha',exact:true}).waitFor()
    check(await p.locator('.metadata pre').innerText().then(t => t.includes('retained')), 'Dossier shows unknown metadata and real file path')
    check(await p.locator('.supporting').innerText().then(t => t.includes('scripts/helper.ps1')), 'Supporting file inventory is shown')
    check(await p.evaluate(() => !window.executed), 'Skill HTML is rendered as inert text')
    await p.screenshot({path:'output/playwright/workbench-desktop.png',fullPage:true})
    await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).click()
    await p.getByLabel('Raw SKILL.md',{exact:true}).focus()
    check(await p.getByLabel('Raw SKILL.md',{exact:true}).evaluate(el=>el.matches(':focus-visible')) && await focusContrast(p.getByLabel('Raw SKILL.md',{exact:true}))>=3, 'Keyboard focus has at least 3:1 contrast on the paper editor')
    const original = await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue()
    await p.getByLabel('Raw SKILL.md',{exact:true}).fill(original + '\nDraft change')
    await p.evaluate(() => {window.__fixture.files.alpha += '\nExternal agent change';window.dispatchEvent(new Event('focus'))})
    await p.getByRole('alert').filter({hasText:'changed on disk'}).waitFor()
    await p.keyboard.press('Control+s')
    await p.getByRole('alert').filter({hasText:'changed outside this app'}).waitFor()
    check((await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue()).includes('Draft change'), 'Conflict keeps draft in editor')
    check(await p.evaluate(() => window.__fixture.files.alpha.includes('External agent change')), 'Stale save leaves external contents intact')
    p.once('dialog', dialog => dialog.dismiss())
    await p.getByRole('button',{name:/broken broken\/SKILL.md/}).click()
    check(await p.getByLabel('Raw SKILL.md',{exact:true}).isVisible(), 'Canceling dirty navigation preserves editor')
    const downloadEvent = p.waitForEvent('download')
    await p.getByRole('button',{name:'Export draft',exact:true}).click()
    const draftDownload = await downloadEvent
    await draftDownload.saveAs('output/playwright/workbench-draft.md')
    check(draftDownload.suggestedFilename().includes('draft'), 'Unsaved draft can be exported')
    p.once('dialog', dialog => dialog.accept())
    await p.getByRole('button',{name:'Reload disk version',exact:true}).click()
    await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).click()
    check((await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue()).includes('External agent change'), 'Explicit reload reads external version')
    await p.getByLabel('Raw SKILL.md',{exact:true}).fill(original + '\nReviewed change')
    await p.evaluate(() => window.__fixture.failSave = true)
    await p.getByRole('button',{name:'Save file',exact:true}).click()
    await p.getByRole('alert').filter({hasText:'fixture rejection'}).waitFor()
    check((await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue()).includes('Reviewed change'), 'Native save failure keeps draft with visible error')
    await p.evaluate(() => window.__fixture.failSave = false)
    await p.getByRole('button',{name:'Save file',exact:true}).click()
    await p.getByText('Previous content recovery',{exact:true}).waitFor()
    check(await p.getByRole('button',{name:'Save file',exact:true}).isDisabled(), 'Successful adapter response clears dirty state and displays recovery path')
    await p.getByRole('button',{name:'Export previous version',exact:true}).waitFor()
    const recoveryDownload = p.waitForEvent('download')
    await p.getByRole('button',{name:'Export previous version',exact:true}).click()
    await (await recoveryDownload).saveAs('output/playwright/workbench-previous.md')
    check(await p.getByRole('button',{name:'Export saved draft',exact:true}).isVisible(), 'Previous version and durable draft are separately exportable')
    await p.getByRole('button',{name:/broken broken\/SKILL.md/}).click()
    await p.getByRole('region',{name:'Validation',exact:true}).getByText('Needs attention',{exact:true}).waitFor()
    check(await p.locator('.instructions').innerText().then(t => t.includes('Original malformed')), 'Malformed skill remains inspectable without rewriting')
    await p.evaluate(() => window.__fixture.recoveries.push({id:'interrupted-1',folder:'missing',previousPath:'C:\\Recovery\\missing-previous.md',draftPath:'C:\\Recovery\\missing-draft.md',createdMs:1792300000000,diagnostics:['Publication interrupted; SKILL.md may be missing'],previousContent:'Previous missing skill',draftContent:'Interrupted draft'}))
    await p.getByRole('button',{name:/missing missing\/SKILL.md/}).click()
    await p.getByRole('button',{name:'Export previous version',exact:true}).waitFor()
    check(await p.getByRole('button',{name:'Retry read',exact:true}).isVisible(), 'Interrupted-save recovery stays available when SKILL.md is missing')
    await p.getByRole('button',{name:/broken broken\/SKILL.md/}).click()
    await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).waitFor()
    await p.getByRole('button',{name:'Legacy archive',exact:true}).click()
    const legacyDownload = p.waitForEvent('download')
    await p.getByRole('button',{name:'Export primary raw data',exact:true}).click()
    await (await legacyDownload).saveAs('output/playwright/workbench-legacy-primary.json')
    check(await p.getByText('0 legacy records. Not migrated to skill folders.',{exact:true}).isVisible(), 'Legacy backup is inspected independently of corrupt primary')
    await p.keyboard.press('Escape')
    check(await p.getByRole('button',{name:'Legacy archive',exact:true}).evaluate(el => el === document.activeElement), 'Legacy modal returns keyboard focus')
    await p.emulateMedia({reducedMotion:'no-preference'})
    await p.getByLabel('Reduce effects',{exact:true}).check()
    check(await p.evaluate(()=>getComputedStyle(document.querySelector('.dossier')).backgroundImage==='none'&&getComputedStyle(document.querySelector('.secondary')).transitionDuration.split(',').some(value=>parseFloat(value)>0)), 'Visual reduction removes paper treatment independently of motion')
    await p.getByLabel('Reduce effects',{exact:true}).uncheck()
    await p.emulateMedia({reducedMotion:'reduce'})
    check(await p.evaluate(()=>getComputedStyle(document.querySelector('.dossier')).backgroundImage!=='none'&&getComputedStyle(document.querySelector('.secondary')).transitionDuration.split(',').every(value=>parseFloat(value)===0)), 'OS reduced motion removes transitions independently of visual treatment')
    await p.getByLabel('Reduce effects',{exact:true}).check()
    for (const [width,height] of [[375,600],[390,844],[768,600],[1440,900]]) {
      await p.setViewportSize({width,height})
      check(await fits(), `${width}x${height} dossier has no page overflow`)
      await p.screenshot({path:`output/playwright/workbench-${width}.png`})
    }
    await p.setViewportSize({width:390,height:844})
    await p.keyboard.press('Control+k')
    await p.waitForFunction(()=>document.activeElement===document.querySelector('.search input'))
    check(await p.getByRole('textbox',{name:'Search skills',exact:true}).evaluate(el => el === document.activeElement), 'Narrow Ctrl K returns to list and focuses search')
    check(await fits(), 'Narrow file list has no page overflow')
    await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'})
    const listAxe = await p.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))
    check(listAxe.length === 0, `Narrow list accessibility: ${JSON.stringify(listAxe)}`)
    await p.locator('.skill-row').first().click()
    await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).waitFor()
    const detailAxe = await p.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))
    check(detailAxe.length === 0, `Narrow dossier accessibility: ${JSON.stringify(detailAxe)}`)
    check(errors.length === 0, `No page errors: ${errors.join('; ')}`)
    return results
  } finally { await context.close() }
}
