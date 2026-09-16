async (page) => {
  const browser = await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9233')
  const p = browser.contexts()[0].pages()[0]
  const original = await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('load_workspace'))
  const originalBackup = await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('recover_workspace'))
  const count = JSON.parse(original).skills.length
  const result = []
  try {
    await p.getByRole('button',{name:'New skill',exact:true}).click()
    await p.getByRole('textbox',{name:'Title',exact:true}).fill('Native persistence check')
    await p.getByRole('button',{name:/Save skill/}).click()
    await p.getByText('Saved locally',{exact:true}).waitFor()
    const saved = await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('load_workspace'))
    if(JSON.parse(saved).skills.length!==count+1) throw new Error('Native file was not updated')
    result.push('UI creation writes through real Tauri IPC to the native workspace file')
    await p.reload()
    await p.getByText('Saved locally',{exact:true}).waitFor()
    if(await p.locator('tbody tr').count()!==count+1) throw new Error('Native reload did not retain record')
    result.push('Native reload retains saved records')
    const backup = await p.evaluate(()=>window.__TAURI_INTERNALS__.invoke('recover_workspace'))
    if(JSON.parse(backup).skills.length!==count) throw new Error('Native backup missing')
    result.push('Native previous-version recovery copy exists')
    await p.locator('input[type=file]').setInputFiles('tests/fixtures/sample.md')
    if(await p.getByRole('textbox',{name:'Title',exact:true}).inputValue()!=='Imported instructions') throw new Error('Native Markdown import failed')
    await p.getByRole('button',{name:'Cancel',exact:true}).click()
    result.push('Native WebView file import opens a reviewable skill editor')
    const downloadPromise = p.waitForEvent('download',{timeout:10000})
    await p.getByRole('button',{name:'Export',exact:true}).click()
    const download = await downloadPromise
    result.push('Native export produces download: '+download.suggestedFilename())
  } finally {
    await p.evaluate(data=>window.__TAURI_INTERNALS__.invoke('save_workspace',{data}),originalBackup || original)
    await p.evaluate(data=>window.__TAURI_INTERNALS__.invoke('save_workspace',{data}),original)
    await p.goto('http://tauri.localhost/?view=index&skill=interface-design')
    await p.getByText('Saved locally',{exact:true}).waitFor()
    await p.evaluate(()=>scrollTo(0,0))
    await p.screenshot({path:'output/playwright/native-desktop.png',scale:'css'})
  }
  return result
}
