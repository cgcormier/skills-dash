async (page) => {
  const browser = await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9233')
  const p = browser.contexts()[0].pages().find(p => p.url().startsWith('http://tauri.localhost'))
  const results = []
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label) }
  await p.getByText('Saved locally', {exact:true}).waitFor()
  check(await p.evaluate(() => !!window.__TAURI_INTERNALS__) && await p.getByText('NATIVE WORKSPACE',{exact:true}).count() === 1, 'Real native workspace is mounted')
  await p.goto('http://tauri.localhost/?view=index')
  await p.getByText('Saved locally', {exact:true}).waitFor()
  const initial = await p.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized',{label:'main'}))
  check(initial === true, 'Native window opens fitted to the available screen')
  await p.getByRole('button',{name:'Restore window size',exact:true}).click()
  await p.getByRole('button',{name:'Fit window to screen',exact:true}).waitFor()
  check(await p.evaluate(async () => !(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized',{label:'main'}))), 'Restore button returns to a resizable window through real IPC')
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Restored native layout has no horizontal page overflow')
  await p.getByRole('button',{name:'Fit window to screen',exact:true}).click()
  await p.getByRole('button',{name:'Restore window size',exact:true}).waitFor()
  check(await p.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized',{label:'main'})), 'Fit button maximizes through real window IPC')
  await p.getByRole('button',{name:'Window options',exact:true}).click()
  const dialog = p.getByRole('dialog',{name:'Window options',exact:true})
  check(await dialog.isVisible() && await dialog.getByRole('button',{name:'Minimize window',exact:true}).isVisible() && await dialog.getByRole('button',{name:'Close window',exact:true}).isVisible(), 'Window menu exposes accessible minimize and close controls')
  await p.keyboard.press('Control+k')
  check(await p.locator('dialog[open]').count() === 1 && await dialog.isVisible(), 'Window options blocks background command shortcuts')
  await p.keyboard.press('Escape')
  check(await p.getByRole('button',{name:'Window options',exact:true}).evaluate(el => document.activeElement === el), 'Escape returns focus from window options')
  const cdp = await p.context().newCDPSession(p)
  try {
    await p.setViewportSize({width:375,height:600})
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Native controls fit the narrowest supported viewport')
    check(await p.getByRole('button',{name:'Window options',exact:true}).isVisible() && await p.getByRole('button',{name:'Restore window size',exact:true}).isVisible(), 'Window actions remain available at 375 pixels')
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await cdp.detach()
  }
  await p.screenshot({path:'output/playwright/cleanup-native.png'})
  return results
}
