async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1512, height: 982 } })
  const test = await context.newPage()
  const reports = []
  try {
    await test.goto("http://127.0.0.1:1420", { waitUntil: "domcontentloaded" })
    await test.getByText("Saved locally", { exact: true }).waitFor()
    async function audit(state) {
      await test.addScriptTag({ path: "node_modules/axe-core/axe.min.js" })
      const results = await test.evaluate(
        async () =>
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
            },
          }),
      )
      reports.push({
        state,
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes
            .map((n) => ({ target: n.target, summary: n.failureSummary }))
            .slice(0, 12),
        })),
      })
    }
    await audit("desktop-index")
    await test.getByRole('button', {name:'Atlas 02',exact:true}).click()
    await audit('atlas')
    await test.getByRole('button', {name:'Posters 03',exact:true}).click()
    await audit('posters')
    await test.getByRole('button', {name:'Index 01',exact:true}).click()
    await test.getByRole('button', {name:'Open command palette',exact:true}).click()
    await audit('command-palette')
    await test.keyboard.press('Escape')
    await test.getByRole('button', {name:'Preferences',exact:true}).click()
    await audit('preferences')
    await test.keyboard.press('Escape')
    await test.getByRole("button", { name: "New skill", exact: true }).click()
    await audit("editor-dialog")
    await test.keyboard.press("Escape")
    await test
      .getByRole("button", { name: "Open full dossier", exact: true })
      .click()
    await audit("full-dossier")
    await test.getByRole("button", { name: "Index 01", exact: true }).click()
    await test.setViewportSize({ width: 390, height: 844 })
    await audit("mobile-index")
    await test
      .getByRole("button", { name: "Open navigation", exact: true })
      .click()
    await audit("mobile-navigation")
    return reports
  } finally {
    await context.close()
  }
}
