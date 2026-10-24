async (page) => {
  // This test must only run in a native process launched with USERPROFILE set to
  // the disposable output/native-ipc-profile fixture. Refuse every real root.
  const browser = await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9233')
  const p = browser.contexts().flatMap(context => context.pages()).find(p => p.url().includes('127.0.0.1:1420') || p.url().includes('tauri.localhost'))
  if (!p) throw new Error('Test-profile native WebView not found')
  const invoke = (command,args={}) => p.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
  const inventory = await invoke('discover_skills')
  if (!inventory.root.replace(/\\/g,'/').toLowerCase().endsWith('/skills-dash/output/native-ipc-profile/.agents/skills')) throw new Error('Refusing native write test outside disposable fixture root')
  const results = []
  const check = (ok,label) => {if (!ok) throw new Error(label); results.push(label)}
  const folder = 'smoke-skill'
  const original = await invoke('read_skill',{folder})
  const legacyBefore = await Promise.all([invoke('read_legacy_archive',{backup:false}),invoke('read_legacy_archive',{backup:true})])
  await p.reload()
  await p.getByRole('button',{name:/smoke-skill smoke-skill\/SKILL.md/}).click()
  await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).click()
  const editor = p.getByLabel('Raw SKILL.md',{exact:true})
  await editor.fill(original.content.replace(/\r\n/g,'\n') + '\nNative IPC save check\n')
  await p.keyboard.press('Control+s')
  await p.getByText('Previous content recovery',{exact:true}).waitFor()
  const saved = await invoke('read_skill',{folder})
  check(saved.content === original.content + '\r\nNative IPC save check\r\n', 'Actual WebView saves raw draft through native filesystem IPC with CRLF preserved')
  check(saved.supportingFiles.some(file=>file.path==='references/keep.txt'&&file.size===20), 'Supporting file inventory survives native save')
  const copies = await invoke('list_skill_recoveries',{folder})
  const matching = []
  for (const copy of copies) {
    if (copy.previousPath && copy.draftPath) {
      const before = await invoke('read_skill_recovery',{folder,id:copy.id,version:'previous'})
      const draft = await invoke('read_skill_recovery',{folder,id:copy.id,version:'draft'})
      if (before===original.content && draft===saved.content) matching.push(copy)
    }
  }
  check(matching.length > 0, 'Native durable previous and draft recovery copies preserve exact bytes')
  await p.reload()
  await p.getByRole('button',{name:/smoke-skill smoke-skill\/SKILL.md/}).click()
  await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).click()
  check(await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue() === saved.content.replace(/\r\n/g,'\n'), 'Actual native reload retains saved file')
  await p.getByRole('button',{name:'Export previous version',exact:true}).first().waitFor()
  const downloadEvent = p.waitForEvent('download')
  await p.getByRole('button',{name:'Export previous version',exact:true}).first().click()
  await (await downloadEvent).saveAs('output/playwright/native-previous.md')
  check(true, 'Actual WebView exports recovery content after reload')
  // A second checked filesystem operation advances the disk revision while the
  // UI retains its opened revision, modeling an external editor's completed edit.
  const external = saved.content + 'Separate editor revision\r\n'
  await invoke('save_skill',{folder,expectedContent:saved.content,content:external})
  await p.getByLabel('Raw SKILL.md',{exact:true}).fill(saved.content.replace(/\r\n/g,'\n') + 'Unsaved conflicting draft\n')
  await p.getByRole('button',{name:'Save file',exact:true}).click()
  await p.getByRole('alert').filter({hasText:'changed outside this app'}).waitFor()
  check((await invoke('read_skill',{folder})).content === external, 'Actual stale IPC save refuses to replace newer file')
  check((await p.getByLabel('Raw SKILL.md',{exact:true}).inputValue()).includes('Unsaved conflicting draft'), 'Native conflict keeps unsaved draft visible')
  p.once('dialog',dialog=>dialog.accept())
  await p.getByRole('button',{name:'Reload disk version',exact:true}).click()
  await p.getByRole('button',{name:'Edit SKILL.md',exact:true}).waitFor()
  await invoke('save_skill',{folder,expectedContent:external,content:original.content})
  const legacyAfter = await Promise.all([invoke('read_legacy_archive',{backup:false}),invoke('read_legacy_archive',{backup:true})])
  check(JSON.stringify(legacyBefore)===JSON.stringify(legacyAfter), 'Native skill saves leave both legacy archive copies untouched')
  check((await invoke('read_skill',{folder})).content===original.content, 'Disposable fixture is restored through checked save')
  await p.screenshot({path:'output/playwright/workbench-native-save.png'})
  return results
}
