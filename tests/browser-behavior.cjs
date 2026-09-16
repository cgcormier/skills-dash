async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 960 } })
  const p = await context.newPage()
  const results = []
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label) }
  try {
    await p.goto('http://127.0.0.1:1420')
    await p.getByText('Saved locally', {exact:true}).waitFor()
    await p.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('skill-archive.workspace')) throw new DOMException('Simulated full disk', 'QuotaExceededError')
        window.originalSetItem.call(this,key,value)
      }
    })
    await p.getByRole('button',{name:'Pin Code review',exact:true}).click()
    await p.getByRole('alert').filter({hasText:'Could not save your changes'}).waitFor()
    check(await p.getByRole('button',{name:'Unpin Code review',exact:true}).isVisible(),'Failed save retains the in-memory edit')
    await p.evaluate(() => { Storage.prototype.setItem = window.originalSetItem })
    await p.getByRole('button',{name:'Retry',exact:true}).click()
    await p.getByText('Saved locally',{exact:true}).waitFor()
    check(await p.evaluate(()=>JSON.parse(localStorage.getItem('skill-archive.workspace.v1')).skills.find(s=>s.id==='code-review').favorite),'Retry persists the latest unsaved edit')
    await p.getByRole('button',{name:'Atlas 02',exact:true}).click()
    await p.getByRole('button',{name:'Posters 03',exact:true}).click()
    await p.goBack()
    check(await p.locator('.atlas').isVisible(),'Browser back restores the previous view')
    await p.goForward()
    check(await p.locator('.poster-grid').isVisible(),'Browser forward restores the next view')
    await p.goto('http://127.0.0.1:1420')
    await p.getByText('Saved locally',{exact:true}).waitFor()
    check(await p.locator('.poster-grid').isVisible(),'A new app navigation restores the saved view')
    await p.getByRole('button',{name:'Index 01',exact:true}).click()
    await p.locator('.skill-name').first().focus()
    await p.keyboard.press('ArrowDown')
    check(await p.locator('tr.selected .skill-name').evaluate(el=>document.activeElement===el),'Arrow navigation keeps focus and selection together')
    await p.keyboard.press('Enter')
    check(await p.locator('.full-dossier').isVisible(),'Enter opens the keyboard-selected dossier')
    await p.setViewportSize({width:390,height:844})
    await p.getByRole('button',{name:'Open navigation',exact:true}).click()
    const drawer = p.getByRole('dialog',{name:'Workspace navigation'})
    await drawer.locator('button,a[href]').last().focus()
    await p.keyboard.press('Tab')
    check(await drawer.locator('button,a[href]').first().evaluate(el=>el===document.activeElement),'Mobile drawer traps forward Tab')
    await p.keyboard.press('Shift+Tab')
    check(await drawer.locator('button,a[href]').last().evaluate(el=>el===document.activeElement),'Mobile drawer traps reverse Tab')
    await p.keyboard.press('Escape')
    check(await p.getByRole('button',{name:'Open navigation',exact:true}).evaluate(el=>el===document.activeElement),'Escape returns focus to the navigation trigger')
    return results
  } finally { await context.close() }
}
