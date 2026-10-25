async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}})
  const p = await context.newPage()
  const results = []
  const errors = []
  p.on('pageerror', error => errors.push(error.message))
  const check = (ok,message) => {if (!ok) throw new Error(message); results.push(message)}
  try {
    await p.goto('http://127.0.0.1:1420')
    await p.getByText('BROWSER · NO FILE ACCESS',{exact:true}).waitFor()
    check(await p.getByRole('button',{name:'Window options',exact:true}).count()===0,'Browser header does not expose native window actions')
    check(await p.getByText('Skills folder',{exact:true}).isVisible(),'Header uses a plain folder label')
    await p.addInitScript(() => {
      // IPC fixtures verify header wiring only, never native window integration.
      window.isTauri = true
      window.__headerCalls = []
      const root = 'C:\\Users\\A deliberately long profile folder for narrow window verification\\.agents\\skills'
      const profile = {id:'header-browser-fixture',root,dataDir:'C:\\header-fixture\\app-data',test:true}
      window.__TAURI_INTERNALS__ = {
        metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,unregisterCallback:()=>{},
        invoke:async(command) => {
          window.__headerCalls.push(command)
          if(command==='discover_skills') return {root,savePolicy:'recoverable-publish',entries:[],diagnostics:[]}
          if(command==='lifecycle_read') return {raw:null,revision:null,reports:[],profile,diagnostics:[]}
          if(command==='plugin:window|is_maximized') return true
          if(command==='plugin:event|listen') return 1
          return null
        }
      }
      window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
    })
    await p.reload()
    await p.getByText('DESKTOP · FILES',{exact:true}).waitFor()
    const folder = p.locator('.workbench-path')
    await folder.filter({hasText:'A deliberately long profile folder'}).waitFor()
    check(await folder.getAttribute('title')===await folder.innerText(),'Full root path stays available without truncation')
    for(const width of [1440,768,390,375]) {
      await p.setViewportSize({width,height:900})
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px header and long path fit without page overflow`)
      for(const name of ['Refresh files','Improvement settings','Legacy archive','Window options']) {
        check(await p.getByRole('button',{name,exact:true}).isVisible(),`${width}px ${name} remains visible`)
      }
      check(await p.getByLabel('Reduce effects',{exact:true}).isVisible(),`${width}px appearance preference remains visible`)
      if(width<=390) {
        const refresh=await p.getByRole('button',{name:'Refresh files',exact:true}).boundingBox()
        const settings=await p.getByRole('button',{name:'Improvement settings',exact:true}).boundingBox()
        check(Math.abs(refresh.y-settings.y)<1&&Math.abs(refresh.height-settings.height)<1,`${width}px primary toolbar buttons stay aligned when a label wraps`)
      }
      await p.screenshot({path:`output/playwright/header-${width}.png`})
    }
    await p.getByRole('button',{name:'Improvement settings',exact:true}).click()
    await p.getByRole('dialog',{name:'Skill improvement settings',exact:true}).waitFor()
    await p.keyboard.press('Escape')
    check(await p.getByRole('button',{name:'Improvement settings',exact:true}).evaluate(el=>el===document.activeElement),'Settings returns focus to its toolbar action')
    await p.getByLabel('Reduce effects',{exact:true}).check()
    check(await p.locator('.app').getAttribute('data-effects')==='none','Toolbar preference still controls reduced effects')
    await p.getByRole('button',{name:'Restore window size',exact:true}).click()
    check(await p.evaluate(()=>window.__headerCalls.includes('plugin:window|toggle_maximize')),'Existing fit/restore action retains its IPC wiring')
    await p.getByRole('button',{name:'Window options',exact:true}).click()
    await p.getByRole('button',{name:'Minimize window',exact:true}).click()
    await p.getByRole('dialog',{name:'Window options',exact:true}).waitFor({state:'hidden'})
    check(await p.evaluate(()=>window.__headerCalls.includes('plugin:window|minimize')),'Existing minimize action retains its IPC wiring')
    await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'})
    const violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})))
    check(violations.length===0,`Narrow header accessibility: ${JSON.stringify(violations)}`)
    check(errors.length===0,`No header runtime errors: ${errors.join('; ')}`)
    return results
  } finally {await context.close()}
}
