// Launches the real app window, answers every box from the drill's own solver, and checks that
// the grading, the mix-up warning, the critical-path check and both problem generators all hold up.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

const FILL_AND_CHECK = `(() => {
  const inputs = [...document.querySelectorAll('#chart input')]
  for (const el of inputs) {
    el.value = String(R.by[el.dataset.k][el.dataset.f])
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const crit = R.order.filter(k => R.by[k].tf === 0)
  for (const k of crit) {
    document.querySelector('.name[data-name="' + k + '"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  document.getElementById('checkCP').click()
  return {
    activities: R.order.length,
    boxes: inputs.length,
    green: document.querySelectorAll('#chart input.ok').length,
    red: document.querySelectorAll('#chart input.bad').length,
    score: document.getElementById('score').textContent,
    hint: document.getElementById('hint').textContent,
    days: R.end,
    path: crit.join(' → ')
  }
})()`

const paint = () => 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'

async function main () {
  const errors = []
  const win = new BrowserWindow({
    width: 1280,
    height: 1000,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 'warning') errors.push(event.message)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push('render process gone: ' + details.reason)
  })

  await win.loadFile(path.join(__dirname, '..', 'app', 'index.html'))
  await win.webContents.executeJavaScript(paint())

  const title = await win.webContents.executeJavaScript('document.querySelector("h1").textContent')
  assert.equal(title, 'Critical Path Drill')

  // A wrong answer turns the box red, explains itself, and spots the zero-day/one-day mix-up:
  // a start activity begins on day 0 counting from zero, so 1 is the other method's answer.
  const wrong = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('A_es')
    el.value = '1'
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { cls: el.className, hint: document.getElementById('hint').textContent }
  })()`)
  assert.equal(wrong.cls, 'bad')
  assert.match(wrong.hint, /A ES isn't 1/)
  assert.match(wrong.hint, /Why:/)
  assert.match(wrong.hint, /mix-up/)

  // Counting from day zero, on the eight-activity example.
  const zero = await win.webContents.executeJavaScript(FILL_AND_CHECK)
  assert.equal(zero.activities, 8)
  assert.equal(zero.boxes, 40)
  assert.equal(zero.red, 0)
  assert.equal(zero.green, zero.boxes)
  assert.match(zero.score, /40 of 40 boxes correct\. Every box is right\./)
  assert.equal(zero.path, 'A → B → D → G → H')
  assert.equal(zero.days, 18)
  assert.match(zero.hint, /^✓ Correct\./)
  assert.match(zero.hint, /the project takes 18 days/)

  // The same example counted from day one: same chain, same length, every box still graded right.
  const one = await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#mode button[data-m="1"]').click()
    return true
  })()`).then(() => win.webContents.executeJavaScript(FILL_AND_CHECK))
  assert.equal(one.red, 0)
  assert.equal(one.green, one.boxes)
  assert.equal(one.path, 'A → B → D → G → H')
  assert.equal(one.days, 18)
  assert.match(one.hint, /^✓ Correct\./)

  // Both generators, in both counting methods, twenty problems each: every one has to be
  // solvable and grade clean, so a random problem can never contradict itself.
  for (const button of ['newp', 'hardp']) {
    for (const method of ['0', '1']) {
      for (let i = 0; i < 20; i++) {
        const r = await win.webContents.executeJavaScript(
          `(() => { document.querySelector('#mode button[data-m="${method}"]').click()` +
          `; document.getElementById('${button}').click(); return true })()`
        ).then(() => win.webContents.executeJavaScript(FILL_AND_CHECK))
        assert.equal(r.red, 0, `${button} problem ${i + 1} (method ${method}) had a red box`)
        assert.equal(r.green, r.boxes, `${button} problem ${i + 1} (method ${method}) was not all green`)
        assert.match(r.hint, /^✓ Correct\./, `${button} problem ${i + 1} (method ${method}) failed the critical-path check`)
        assert.ok(r.days > 0)
        if (button === 'hardp') assert.ok(r.activities >= 10, 'harder problems should have at least ten activities')
      }
    }
  }

  // Back to the example in a clean state, then save a picture of the window.
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#mode button[data-m="0"]').click()
    document.getElementById('example').click()
    return true
  })()`)
  await win.webContents.executeJavaScript(paint())
  const shot = await win.webContents.capturePage()
  const out = process.env.CPD_SCREENSHOT
    ? path.join(__dirname, '..', 'docs', 'screenshot.png')
    : path.join(__dirname, '..', 'dist', 'verify.png')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, shot.toPNG())

  assert.deepEqual(errors, [], 'the page logged errors')

  console.log('verify: the window renders, 40 boxes grade correctly in both methods,')
  console.log('verify: 80 generated problems all solve, and the critical path checks out.')
  console.log('verify: wrote ' + out)
}

app.whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch(err => {
    console.error(err)
    app.exit(1)
  })
