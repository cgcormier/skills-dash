async (page) => {
  const results = []
  const assert = (value, message) => {
    if (!value) throw new Error(message)
    results.push(message)
  }
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1512, height: 982 } })
  const test = await context.newPage()
  const errors = []
  test.on("pageerror", (error) => errors.push(error.message))
  await test.goto("http://127.0.0.1:1420")
  await test.getByText("Saved locally", { exact: true }).waitFor()
  assert(
    (await test.locator("tbody tr").count()) === 12,
    "Initial collection has 12 valid starter records",
  )
  await test
    .getByRole("textbox", { name: "Search skills", exact: true })
    .fill("research evidence")
  assert(
    (await test.locator("tbody tr").count()) === 2,
    "Search combines terms across instructions and metadata",
  )
  await test
    .getByRole("textbox", { name: "Search skills", exact: true })
    .fill("nothingmatches987")
  await test.getByRole("heading", { name: "No matching skills." }).waitFor()
  await test.screenshot({ path: "output/playwright/empty.png" })
  await test
    .getByRole("button", { name: "Clear filters", exact: true })
    .last()
    .click()
  await test.getByRole("button", { name: "Design 03", exact: true }).click()
  assert(
    (await test.locator("tbody tr").count()) === 3,
    "Collection filter shows only matching skills",
  )
  await test.getByRole("button", { name: "All skills 12", exact: true }).click()
  await test
    .getByRole("combobox", { name: "Filter status", exact: true })
    .selectOption("draft")
  assert(
    (await test.locator("tbody tr").count()) === 2,
    "Status filter shows two draft records",
  )
  await test
    .getByRole("combobox", { name: "Filter status", exact: true })
    .selectOption("")
  await test
    .getByRole("button", { name: "Pin Code review", exact: true })
    .click()
  await test
    .getByRole("button", { name: "Unpin Code review", exact: true })
    .waitFor()
  await test
    .getByRole("button", { name: "Undo last change", exact: true })
    .click()
  await test
    .getByRole("button", { name: "Pin Code review", exact: true })
    .waitFor()
  results.push("Pin and undo restore the previous state")
  await test.getByRole("button", { name: "New skill", exact: true }).click()
  await test
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("QA temporary skill")
  await test
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Created during an isolated workflow test.")
  await test
    .getByRole("textbox", { name: "Instructions Markdown", exact: true })
    .fill("# Verification\n\n## Working method\n1. Confirm persistence.")
  await test
    .getByRole("checkbox", { name: "Interface design", exact: true })
    .check()
  await test.screenshot({ path: "output/playwright/editor.png" })
  await test.getByRole("button", { name: /Save skill/ }).click()
  await test.getByText("Saved locally", { exact: true }).waitFor()
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Create commits a new record",
  )
  await test.reload()
  await test.getByText("Saved locally", { exact: true }).waitFor()
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Creation survives reload",
  )
  await test.getByRole("button", { name: /Edit skill E/ }).click()
  await test
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("QA renamed skill")
  await test.keyboard.press("Escape")
  await test
    .getByText("Discard your unsaved changes?", { exact: true })
    .waitFor()
  await test.getByRole("button", { name: "Keep editing", exact: true }).click()
  await test.keyboard.press("Control+s")
  await test
    .getByRole("heading", { name: "QA renamed skill", exact: true })
    .waitFor()
  results.push("Dirty Escape warns; Ctrl+S commits editor changes")
  await test
    .getByRole("button", { name: "Open full dossier", exact: true })
    .click()
  await test
    .getByRole("heading", { name: "Working method", exact: true })
    .waitFor()
  await test.screenshot({
    path: "output/playwright/dossier.png",
    fullPage: true,
  })
  await test.getByRole("button", { name: "Archive skill", exact: true }).click()
  await test
    .getByRole("button", { name: "Restore to active", exact: true })
    .click()
  results.push("Full dossier renders instructions and archive/restore works")
  await test.getByRole("button", { name: "Atlas 02", exact: true }).click()
  assert(
    (await test.locator(".atlas-node").count()) === 13,
    "Atlas represents actual records",
  )
  assert(
    (await test.locator(".atlas-lines path").count()) > 0,
    "Atlas shows stored relationships",
  )
  await test.screenshot({ path: "output/playwright/atlas.png" })
  await test.getByRole("button", { name: "Posters 03", exact: true }).click()
  assert(
    (await test.locator(".skill-poster").count()) === 13,
    "Posters share the same collection",
  )
  await test.screenshot({ path: "output/playwright/posters.png" })
  await test.keyboard.press("Control+k")
  await test
    .getByRole("textbox", { name: "Search commands and skills" })
    .fill("Code review")
  await test.keyboard.press("ArrowDown")
  await test.keyboard.press("Enter")
  await test
    .getByRole("heading", { name: "Code review", exact: true })
    .first()
    .waitFor()
  results.push("Command palette keyboard selection opens a dossier")
  await test.getByRole("button", { name: "Preferences", exact: true }).click()
  await test.getByRole("button", { name: "X-ray blue", exact: true }).click()
  await test.getByLabel("Visual effects", { exact: true }).selectOption("none")
  await test
    .getByLabel("Index density", { exact: true })
    .selectOption("compact")
  await test.getByRole("button", { name: "Done", exact: true }).click()
  await test.emulateMedia({ reducedMotion: "reduce" })
  await test.getByRole("button", { name: "Index 01", exact: true }).click()
  assert(
    (await test.locator(".masthead-art").isVisible()) === false,
    "Effects-none removes decoration without removing data",
  )
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Reduced motion/effects preserve the collection",
  )
  await test.screenshot({ path: "output/playwright/reduced-effects.png" })
  const downloadPromise = test.waitForEvent("download")
  await test.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  assert(
    download.suggestedFilename().endsWith(".json"),
    "Export produces a JSON download",
  )
  await download.saveAs("output/playwright/exported-workspace.json")
  await test.locator("input[type=file]").setInputFiles("tests/fixtures/invalid.json")
  await test.getByText(/This file is not valid JSON/).waitFor()
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Invalid import leaves existing records intact",
  )
  await test.locator("input[type=file]").setInputFiles("tests/fixtures/empty.json")
  await test
    .getByRole("heading", { name: "Replace this collection?" })
    .waitFor()
  await test.getByRole("button", { name: "Cancel", exact: true }).click()
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Cancel import preserves collection",
  )
  await test.locator("input[type=file]").setInputFiles("tests/fixtures/empty.json")
  await test
    .getByRole("button", { name: "Replace collection", exact: true })
    .click()
  await test
    .getByRole("heading", { name: "A collection starts with one." })
    .waitFor()
  await test
    .getByRole("button", { name: "Undo last change", exact: true })
    .click()
  assert(
    (await test.locator("tbody tr").count()) === 13,
    "Import replacement is undoable",
  )
  await test.locator("input[type=file]").setInputFiles("tests/fixtures/sample.md")
  assert(
    (await test
      .getByRole("textbox", { name: "Title", exact: true })
      .inputValue()) === "Imported instructions",
    "Markdown import opens a reviewable editor",
  )
  await test.getByRole("button", { name: "Cancel", exact: true }).click()
  await test.setViewportSize({ width: 390, height: 844 })
  await test
    .getByRole("button", { name: "Open navigation", exact: true })
    .click()
  await test.getByRole("button", { name: "All skills 13", exact: true }).click()
  assert(
    await test.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "390px index has no horizontal page overflow",
  )
  await test.screenshot({
    path: "output/playwright/index-mobile.png",
    fullPage: true,
  })
  await test.getByRole("button", { name: /^Code review Find/ }).click()
  await test
    .getByRole("button", { name: "Back to index", exact: true })
    .waitFor()
  assert(
    await test.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "390px dossier has no horizontal page overflow",
  )
  await test.screenshot({
    path: "output/playwright/dossier-mobile.png",
    fullPage: true,
  })
  await test.getByText("Saved locally", { exact: true }).waitFor()
  await test.evaluate(() =>
    localStorage.setItem("skill-archive.workspace.v1", "corrupt-test-data"),
  )
  await test.reload()
  await test
    .getByRole("heading", { name: "Your data is still safe." })
    .waitFor()
  assert(
    (await test.evaluate(() =>
      localStorage.getItem("skill-archive.workspace.v1"),
    )) === "corrupt-test-data",
    "Corruption does not trigger a destructive seed reset",
  )
  await test.screenshot({ path: "output/playwright/storage-error.png" })
  await test
    .getByRole("button", { name: "Recover backup", exact: true })
    .click()
  await test.getByText("Saved locally", { exact: true }).waitFor()
  assert(
    (await test.evaluate(
      () =>
        JSON.parse(localStorage.getItem("skill-archive.workspace.v1")).version,
    )) === 1,
    "Explicit backup recovery restores a valid workspace",
  )
  assert(errors.length === 0, `No browser runtime errors: ${errors.join("; ")}`)
  await context.close()
  return results
}
