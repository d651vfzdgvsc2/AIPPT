import { useEffect, useRef, useState } from 'react'

const TEMPLATES = [
  { name: '工作汇报', text: '帮我生成一份「季度工作汇报」PPT：面向部门领导，包含目标回顾、关键成果（用数据说话）、问题与反思、下季度计划，风格专业简洁、蓝色商务配色。' },
  { name: '产品发布', text: '帮我生成一份「新产品发布会」PPT：面向媒体和客户，包含行业痛点、产品亮点（对比表格）、演示截图、价格与上市计划，风格科技感强、深色背景。' },
  { name: '教学课件', text: '帮我生成一份教学课件 PPT：面向大学生，包含学习目标、知识点讲解（每页一个概念 + 例子）、课堂互动问题、小结，风格清新易读。' },
  { name: '路演融资', text: '帮我生成一份创业项目融资路演 PPT：面向投资人，包含痛点、解决方案、市场规模、商业模式、进展数据、团队、融资计划，简洁有力、10 页以内。' },
  { name: '年终总结', text: '帮我生成一份「个人年终总结」PPT：包含全年工作亮点、量化成绩、成长与不足、明年规划，风格温暖有感染力。' },
  { name: '培训分享', text: '帮我生成一份内部分享 PPT：面向同事的经验分享，包含背景引入、核心方法（分步骤）、案例演示、避坑建议、参考资料，风格轻松专业。' },
]

const HISTORY_KEY = 'deckcraft_history'

function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1280
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const s = MAX / Math.max(width, height)
          width = Math.round(width * s)
          height = Math.round(height * s)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(e.target.result)
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const emptySpec = { palette: [], style: {} }

export default function App() {
  const [input, setInput] = useState('')
  const [img, setImg] = useState(null)
  const [spec, setSpec] = useState(emptySpec)
  const [result, setResult] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState({ analyze: false, prompt: false, ppt: false })
  const [refine, setRefine] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')) } catch { /* ignore */ }
  }, [])

  const setB = (k, v) => setBusy((b) => ({ ...b, [k]: v }))

  function addHistory(item) {
    setHistory((h) => {
      const n = [item, ...h].slice(0, 20)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(n))
      return n
    })
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setImg(await compressImage(file))
  }

  async function analyze() {
    if (!img) { alert('请先上传参考图'); return }
    setB('analyze', true)
    try {
      const r = await fetch('/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: img }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`)
      setSpec({ palette: d.palette || [], style: d.style || {} })
    } catch (e) { alert('拆解失败：' + e.message) } finally { setB('analyze', false) }
  }

  async function generatePrompt() {
    if (!input.trim() && !img) { alert('请填写需求或上传参考图'); return }
    setB('prompt', true)
    setResult('AI 正在生成…')
    let full = ''
    try {
      const res = await fetch('/generate/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: input, image_base64: img, previous_prompt: refine ? result : null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`) }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let hadErr = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          let evt
          try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }
          if (evt.error) { setResult('错误：' + evt.error); hadErr = true }
          else if (evt.delta) { full += evt.delta; setResult(full) }
        }
      }
      if (!hadErr && full) addHistory({ ts: Date.now(), prompt: full, refined: refine })
    } catch (e) { setResult('错误：' + e.message) } finally { setB('prompt', false); setRefine(false) }
  }

  async function generatePpt() {
    if (!input.trim() && !img) { alert('请填写需求或上传参考图'); return }
    setB('ppt', true)
    try {
      const res = await fetch('/deck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: input, image_base64: img, spec }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'DeckCraft.pptx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { alert('生成失败：' + e.message) } finally { setB('ppt', false) }
  }

  function copyResult() {
    if (!result) return
    navigator.clipboard?.writeText(result)
  }

  const setStyle = (k, v) => setSpec((s) => ({ ...s, style: { ...s.style, [k]: v } }))
  const setPal = (i, hex) => setSpec((s) => ({ ...s, palette: s.palette.map((p, j) => (j === i ? { ...p, hex } : p)) }))

  const stepHead = (n, label, right) => (
    <div className="flex items-center gap-2 text-[12px] font-extrabold tracking-wider text-muted uppercase">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-accent text-[11px] text-white">{n}</span>
      <span>{label}</span>
      {right}
    </div>
  )

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1200px] grid-cols-1 border-x border-line bg-paper md:grid-cols-[430px_minmax(0,1fr)]">
        {/* 左：操作面板 */}
        <aside className="flex flex-col gap-6 border-b border-line bg-white p-7 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-accent text-lg text-white">◆</div>
            <div>
              <div className="text-lg font-extrabold tracking-tight">DeckCraft</div>
              <div className="text-[11.5px] text-muted">参考图 → 拆解设计规范 → 直接产出可下载的 PPT</div>
            </div>
          </div>

          {/* 1 需求 */}
          <section className="flex flex-col gap-2.5">
            {stepHead(1, '需求描述')}
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button key={t.name} type="button" onClick={() => setInput(t.text)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-[#3f434b] transition hover:border-accent hover:text-accent">
                  {t.name}
                </button>
              ))}
            </div>
            <textarea id="userInput" rows={4} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的需求，或点上方模板快速开始"
              className="w-full resize-y rounded-2xl border border-line bg-[#F7F6F2] px-4 py-3.5 text-sm leading-relaxed outline-none transition placeholder:text-[#A7AAB1] focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10" />
          </section>

          {/* 2 参考图 */}
          <section className="flex flex-col gap-2.5">
            {stepHead(2, '上传图片（可选）')}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => fileRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-[1.5px] border-dashed p-5 text-center transition ${drag ? 'border-accent bg-accentSoft' : 'border-[#CFCDC6] bg-[#F7F6F2] hover:border-accent hover:bg-white'}`}>
              <input ref={fileRef} id="imageInput" type="file" accept="image/jpeg,image/png,image/webp"
                className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => handleFile(e.target.files[0])} />
              {img ? (
                <div className="text-[13px] text-[#4b4f57]">已选择图片，点击可更换</div>
              ) : (
                <>
                  <span className="block text-[22px] text-muted">⌃</span>
                  <div className="text-[13px] text-[#4b4f57]">拖拽图片到此处，或 <strong className="text-accent">点击选择文件</strong></div>
                  <div className="mt-1 text-[11.5px] text-muted">支持 JPG / PNG / WebP，大图会自动压缩</div>
                </>
              )}
            </div>
            {img && (
              <div className="relative">
                <img src={img} alt="preview" className="max-h-[200px] w-full rounded-xl border border-line object-contain" />
                <button type="button" onClick={(e) => { e.stopPropagation(); setImg(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">×</button>
              </div>
            )}
          </section>

          {/* 3 设计规范 */}
          <section className="flex flex-col gap-2.5">
            {stepHead(3, '设计规范', (
              <button id="analyzeBtn" type="button" onClick={analyze} disabled={busy.analyze}
                className="ml-auto text-[12.5px] font-bold text-accent hover:underline disabled:opacity-40">
                {busy.analyze ? '拆解中…' : '拆解参考图'}
              </button>
            ))}
            {spec.palette.length === 0 ? (
              <div className="text-[12.5px] text-muted">上传参考图后点「拆解参考图」得到配色与风格，可直接编辑；或直接「生成演示」用默认规范。</div>
            ) : (
              <div id="paletteRow" className="flex flex-wrap gap-2.5">
                {spec.palette.map((p, i) => (
                  <label key={i} className="text-center text-[11px] text-muted">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(p.hex) ? p.hex : '#1F4468'}
                      onChange={(e) => setPal(i, e.target.value)}
                      className="block h-10 w-[56px] cursor-pointer rounded-xl border border-line bg-white p-[3px]" />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {[['theme', '主题 / 气质', '如：沉稳商务'], ['layout', '版式特征', '如：大标题 + 要点列表'],
                ['typography', '字体与层级', '如：无衬线，标题特粗'], ['accent_usage', '强调色用法', '如：主色用于标题']].map(([k, label, ph]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11.5px] text-muted">{label}</span>
                  <input value={spec.style?.[k] || ''} onChange={(e) => setStyle(k, e.target.value)} placeholder={ph}
                    className="w-full rounded-xl border border-line bg-[#F7F6F2] px-3 py-2.5 text-[13px] outline-none transition placeholder:text-[#A7AAB1] focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10" />
                </label>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="mt-auto flex flex-col gap-2.5 pt-2">
            <button id="pptxBtn" type="button" onClick={generatePpt} disabled={busy.ppt}
              className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-bold text-white transition hover:bg-accentDark disabled:opacity-50">
              {busy.ppt ? '正在生成 PPT…' : '生成演示 · PPT'}
            </button>
            <button id="generateBtn" type="button" onClick={generatePrompt} disabled={busy.prompt}
              className="w-full rounded-2xl border border-line bg-white py-3 text-sm font-semibold text-[#3f434b] transition hover:border-ink hover:text-ink disabled:opacity-50">
              {busy.prompt ? '生成中…' : '生成 Prompt'}
            </button>
          </div>
        </aside>

        {/* 右：输出 */}
        <main className="p-7">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[12.5px] font-extrabold uppercase tracking-wider text-muted">输出</div>
            <div className="text-xs text-muted">Planner · 设计规范 · python-pptx</div>
          </div>
          <div id="resultArea"
            className="min-h-[240px] whitespace-pre-wrap break-words rounded-2xl border border-line bg-white p-5 text-[14.5px] leading-relaxed">
            {result || <span className="text-[#A7AAB1]">等待生成…</span>}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <button type="button" onClick={copyResult} disabled={!result}
              className="rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#3f434b] transition hover:border-ink hover:text-ink disabled:opacity-40">复制</button>
            <button type="button" onClick={() => { setRefine(true); setInput(''); setResult('优化模式：输入修改意见后点「生成 Prompt」'); }}
              disabled={!result}
              className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2 text-[12.5px] font-semibold text-[#047857] transition hover:bg-[#DCFCE7] disabled:opacity-40">再优化一版</button>
            {result && <span className="text-xs text-muted">{result.length} 字</span>}
          </div>

          {history.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-muted">历史记录（最近 20 条）</span>
                <button type="button" onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]) }}
                  className="text-xs text-muted hover:text-[#E11D48]">清空</button>
              </div>
              {history.map((h, i) => (
                <div key={i} onClick={() => { setResult(h.prompt); setRefine(false) }}
                  className="mb-2 cursor-pointer rounded-xl border border-line bg-white p-3 transition hover:border-accent">
                  <div className="mb-1 text-[11px] text-muted">
                    {new Date(h.ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {h.refined ? '优化' : '全新'}
                  </div>
                  <div className="line-clamp-2 text-[13px] text-[#3f434b]">{h.prompt}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
