// Walks the whole course in a real app window: reads each lesson, answers every practice
// problem from the drill's own solver, and checks the marking, the scaffolding, the
// critical-path check and the saved progress.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()
// Keep the test's own saved progress away from the copy you practise with.
app.setPath('userData', path.join(app.getPath('temp'), 'critical-path-drill-verify'))

const PAGE = path.join(__dirname, '..', 'app', 'index.html')
const painted = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'

const run = (win, code) => win.webContents.executeJavaScript(`(() => { ${code} })()`)

const SNAPSHOT = `return {
  view: state.view,
  stage: state.stage,
  solved: state.solved,
  total: state.total,
  heading: document.querySelector('h2') ? document.querySelector('h2').textContent : '',
  eyebrow: document.querySelector('.eyebrow') ? document.querySelector('.eyebrow').textContent : '',
  tally: document.getElementById('tally').textContent,
  inputs: document.querySelectorAll('#chart input').length,
  blanks: document.querySelectorAll('#chart .cell.blank').length,
  givens: document.querySelectorAll('#chart .cell.given').length,
  tasks: R ? R.order.length : 0,
  rail: [...document.querySelectorAll('.rail button')].map(b => b.dataset.state),
  hint: document.getElementById('hint') ? document.getElementById('hint').textContent : ''
}`

async function main () {
  const errors = []
  const win = new BrowserWindow({
    width: 1340,
    height: 1040,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 'warning') errors.push(event.message)
  })
  win.webContents.on('render-process-gone', (_e, details) => errors.push('render gone: ' + details.reason))

  await win.loadFile(PAGE)
  await run(win, "localStorage.clear(); return true")
  await win.loadFile(PAGE)
  await win.webContents.executeJavaScript(painted)

  const stages = await run(win, 'return STAGES.map(s => ({ id: s.id, title: s.title, problems: s.problems, pick: s.pick, fields: s.fields.length }))')
  assert.equal(stages.length, 10, 'the course should have ten lessons')

  const start = await run(win, SNAPSHOT)
  assert.equal(start.view, 'lesson')
  assert.equal(start.stage, 0)
  assert.deepEqual(start.rail.slice(0, 2), ['now', 'locked'], 'only the first lesson is open to begin with')
  assert.equal(start.inputs, 0, 'a lesson shows a worked example, not blanks')
  assert.equal(start.givens, start.tasks * 5, 'every number is filled in on the worked example')

  let solvedAll = 0

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    const lesson = await run(win, SNAPSHOT)
    assert.equal(lesson.view, 'lesson', `lesson ${i + 1} should open on its lesson`)
    assert.equal(lesson.stage, i)
    assert.equal(lesson.heading, s.title)
    assert.equal(lesson.eyebrow, `Lesson ${i + 1} of 10`)

    await run(win, "document.getElementById('go').click(); return true")
    const first = await run(win, SNAPSHOT)
    assert.equal(first.view, 'practice')
    assert.equal(first.inputs, first.tasks * s.fields, `lesson ${i + 1} should ask for ${s.fields} boxes per task`)
    if (s.fields < 5) {
      assert.ok(first.givens + first.blanks > 0, `lesson ${i + 1} should fill in or grey out the boxes it is not asking for`)
    }

    for (let p = 0; p < s.problems; p++) {
      // One wrong answer, to prove the marking and the explanation, then the right ones.
      if (s.fields > 0) {
        const bad = await run(win, `
          const el = document.querySelector('#chart input')
          el.value = String(R.by[el.dataset.k][el.dataset.f] + 3)
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { cls: el.className, hint: document.getElementById('hint').textContent }`)
        assert.equal(bad.cls, 'bad', `lesson ${i + 1} should mark a wrong answer`)
        assert.match(bad.hint, /Why:/)
        assert.match(bad.hint, /Where to look:/)
      }

      const filled = await run(win, `
        const ins = [...document.querySelectorAll('#chart input')]
        for (const el of ins) {
          el.value = String(R.by[el.dataset.k][el.dataset.f])
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
        return { boxes: ins.length, green: document.querySelectorAll('#chart input.ok').length,
                 red: document.querySelectorAll('#chart input.bad').length,
                 hint: document.getElementById('hint').textContent }`)
      assert.equal(filled.red, 0, `lesson ${i + 1} problem ${p + 1} had a wrong box after filling in the answers`)
      assert.equal(filled.green, filled.boxes)

      if (s.pick) {
        // Marking a task that has slack has to be refused before the right chain is accepted.
        const slack = await run(win, `
          const spare = R.order.find(k => R.by[k].tf > 0)
          document.querySelector('#chart .name[data-name="' + spare + '"]').click()
          document.getElementById('check').click()
          const head = document.querySelector('#hint .head').textContent
          document.querySelector('#chart .name[data-name="' + spare + '"]').click()
          return head`)
        assert.match(slack, /Not that chain/, `lesson ${i + 1} accepted a task with float as critical`)

        const good = await run(win, `
          for (const k of R.critical) document.querySelector('#chart .name[data-name="' + k + '"]').click()
          document.getElementById('check').click()
          return { head: document.querySelector('#hint .head').textContent,
                   body: document.getElementById('hint').textContent,
                   days: R.end, path: R.critical.join(' \\u2192 ') }`)
        assert.match(good.head, /Solved/, `lesson ${i + 1} problem ${p + 1} did not accept the critical path`)
        assert.ok(good.body.includes(good.path), 'the answer should name the chain')
        assert.ok(good.body.includes(good.days + ' days'), 'the answer should give the project length')
      } else {
        const head = await run(win, "return document.querySelector('#hint .head').textContent")
        assert.match(head, /Solved/, `lesson ${i + 1} problem ${p + 1} was not accepted`)
      }

      solvedAll++
      const counted = await run(win, SNAPSHOT)
      assert.equal(counted.solved, p + 1)
      assert.equal(counted.total, solvedAll)
      await run(win, "document.getElementById('on').click(); return true")
    }

    const done = await run(win, SNAPSHOT)
    assert.equal(done.view, 'done', `lesson ${i + 1} should end on its summary`)
    assert.match(done.heading, i === stages.length - 1 ? /Course complete/ : new RegExp(`Lesson ${i + 1} complete`))

    if (i < stages.length - 1) {
      await run(win, "document.getElementById('next').click(); return true")
      const rail = await run(win, SNAPSHOT)
      assert.equal(rail.stage, i + 1)
      assert.equal(rail.rail[i], 'done', 'a finished lesson should be ticked off')
      assert.equal(rail.rail[i + 1], 'now', 'the next lesson should open up')
    }
  }

  // Progress survives closing the app.
  const saved = await run(win, "return localStorage.getItem('critical-path-drill/progress/1')")
  assert.ok(saved, 'progress should be saved')
  assert.equal(JSON.parse(saved).total, solvedAll)
  await win.loadFile(PAGE)
  await win.webContents.executeJavaScript(painted)
  const back = await run(win, SNAPSHOT)
  assert.equal(back.stage, stages.length - 1, 'reopening should come back to the same lesson')
  assert.equal(back.total, solvedAll, 'reopening should remember how much has been solved')

  // Pictures for the README: the lesson, then a practice problem part way through.
  if (process.env.CPD_SCREENSHOT) {
    await run(win, "state.stage = 1; state.solved = 0; state.total = 2; lessonView(); return true")
    await win.webContents.executeJavaScript(painted)
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'lesson.png'), (await win.webContents.capturePage()).toPNG())
    await run(win, `
      state.stage = 6; state.solved = 1; state.total = 13; practiceView()
      const ins = [...document.querySelectorAll('#chart input')]
      for (const el of ins.slice(0, Math.round(ins.length * 0.45))) {
        el.value = String(R.by[el.dataset.k][el.dataset.f])
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const el = ins[ins.length - 1]
      el.value = String(R.by[el.dataset.k][el.dataset.f] + 2)
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true`)
    await win.webContents.executeJavaScript(painted)
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'practice.png'), (await win.webContents.capturePage()).toPNG())
  }

  // Starting over clears the lot.
  await win.loadFile(PAGE)
  await win.webContents.executeJavaScript(painted)
  await run(win, "document.getElementById('reset').click(); return true")
  const cleared = await run(win, SNAPSHOT)
  assert.equal(cleared.stage, 0)
  assert.equal(cleared.total, 0)
  assert.equal(cleared.rail[1], 'locked', 'starting over should lock the later lessons again')

  assert.deepEqual(errors, [], 'the page logged errors')

  console.log(`verify: ${stages.length} lessons, ${solvedAll} practice problems, every box marked correctly.`)
  console.log('verify: wrong answers explained, slack rejected as critical, progress saved and cleared.')
}

app.whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch(err => { console.error(err); app.exit(1) })
