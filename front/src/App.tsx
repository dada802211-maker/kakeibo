import { downloadCsv } from './csv'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Master = { id: number; name: string; closing_day?: number }
type Expense = { id: number; purchased_on: string; card_id: number; item_id: number; amount: number; note: string; card_name: string; item_name: string }
type Summary = Master & { total: number; count: number; period_start: string; period_end: string }
type Draft = { id?: number; purchased_on: string; card_id: string; item_id: string; amount: string; note: string }
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
const money = (value: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value)
const emptyDraft = (): Draft => ({ purchased_on: today(), card_id: '', item_id: '', amount: '', note: '' })
let csrf = ''

// 同じ配下のPHP APIへアクセスするため、サブフォルダへの配置にも対応します。
async function api<T>(action: string, data?: unknown): Promise<T> {
  const response = await fetch(`./php/api.php?action=${action}`, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 401 && !action.startsWith('login')) window.dispatchEvent(new Event('session-expired'))
    throw new Error(result.error || '通信に失敗しました。')
  }
  return result
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('home')
  const [month, setMonth] = useState(today().slice(0, 7))
  const [cards, setCards] = useState<Master[]>([])
  const [items, setItems] = useState<Master[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [revision, setRevision] = useState(0)

  async function session() {
    const result = await api<{ authenticated: boolean; csrf: string; installed: boolean }>('session')
    csrf = result.csrf
    setLoggedIn(result.authenticated)
    if (!result.installed) setError('初期設定が必要です。READMEの手順を確認してください。')
  }
  useEffect(() => {
    session().catch(e => setError(e.message)).finally(() => setReady(true))
    const expired = () => { setLoggedIn(false); setPassword('') }
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [])

  // 月を素早く切り替えても、古い応答で現在の表示を上書きしないようにします。
  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    setLoading(true)
    setExpenses([]); setSummary([])
    Promise.all([
      api<{ cards: Master[]; items: Master[] }>('masters'),
      api<{ expenses: Expense[]; summary: Summary[] }>(`dashboard&month=${encodeURIComponent(month)}`),
    ]).then(([masters, data]) => {
      if (!cancelled) { setCards(masters.cards); setItems(masters.items); setExpenses(data.expenses); setSummary(data.summary) }
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loggedIn, month, revision])

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work(); return true } catch (e) { setError(e instanceof Error ? e.message : '処理に失敗しました。'); return false }
    finally { setBusy(false) }
  }
  function login(event: FormEvent) {
    event.preventDefault()
    void run(async () => { await session(); const result = await api<{ csrf: string }>('login', { password }); csrf = result.csrf; setPassword(''); setLoggedIn(true) })
  }
  function save(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const result = await api<{ billing_month: string }>('expenses', draft)
      setMonth(result.billing_month)
      setDraft({ ...emptyDraft(), purchased_on: draft.purchased_on, card_id: draft.card_id })
      setRevision(v => v + 1); setNotice(draft.id ? '明細を更新しました。' : '支出を記録しました。')
    })
  }
  function edit(row: Expense) {
    setDraft({ id: row.id, purchased_on: row.purchased_on, card_id: String(row.card_id), item_id: String(row.item_id), amount: String(row.amount), note: row.note })
    setTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const total = summary.reduce((sum, card) => sum + Number(card.total), 0)
  const visibleExpenses = expenses.filter(e => !filter || String(e.card_id) === filter)
  // 表示中の締め月・カード絞り込みと同じ明細を出力します。
  function exportCsv() {
    const rows: (string | number)[][] = [['集計月（締め月）','明細番号','購入日','カード管理番号','カード名','購入項目番号','購入項目名','金額（円）','メモ']]
    for (const row of visibleExpenses) rows.push([month, row.id, row.purchased_on, row.card_id, row.card_name, row.item_id, row.item_name, Number(row.amount), row.note])
    downloadCsv('家計簿_' + month + (filter ? '_カード' + filter : '_全カード') + '.csv', rows)
  }
  const alerts = <>{error && <div className="alert error" role="alert">{error}<button onClick={() => setError('')} aria-label="エラーを閉じる">×</button></div>}{notice && <div className="alert success" role="status">{notice}<button onClick={() => setNotice('')} aria-label="通知を閉じる">×</button></div>}</>

  if (!loggedIn) return <div className="login-page"><div className="login-story"><div className="wordmark">▤ 家計ノート</div><span className="eyebrow">YOUR EVERYDAY, IN BALANCE</span><h1>毎日の支出を、<br />すっきり見渡す。</h1><p>カードごとのお買いものを、ひとつのノートに。<br />番号でかんたん入力。月ごとの振り返りも。</p><div className="decor-card"><span>MONTHLY NOTE</span><strong>小さな記録が、<br />暮らしの見通しに。</strong><div className="decor-bars"><i /><i /><i /><i /><i /><i /><i /></div></div></div><main className="login-panel"><span className="eyebrow">WELCOME BACK</span><h2>家計ノートをひらく</h2><p className="muted">あなた専用の家計簿です。</p>{alerts}<form onSubmit={login}><label>パスワード<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary" disabled={!ready || busy}>{busy ? '確認中…' : 'ログイン →'}</button></form><p className="login-foot">カードの管理番号を使って記録します。<br />実際のカード番号を入力する必要はありません。</p></main></div>

  return <div className="app"><aside className="sidebar"><a className="wordmark" href="#" onClick={e => { e.preventDefault(); setTab('home') }}>▤ 家計ノート</a><span className="side-caption">PERSONAL FINANCE</span><nav>{[['home','◫','月別の家計簿'],['masters','▤','カード・項目管理'],['settings','⚙','パスワード設定']].map(([key,icon,label]) => <button key={key} className={tab===key?'active':''} onClick={() => setTab(key)}><span>{icon}</span>{label}</button>)}</nav><div className="side-note"><span>ひとつずつ、ていねいに。</span><p>今日の記録が、<br />明日の安心につながります。</p></div><button className="logout" disabled={busy} onClick={() => void run(async () => { await api('logout', {}); setLoggedIn(false); await session() })}>ログアウト ↗</button></aside>
    <main className="main"><header className="topbar"><span>わたしの家計簿</span><span className="private-badge">● プライベート</span></header>{alerts}
    {tab === 'home' && <><div className="page-heading"><div><span className="eyebrow">MONTHLY OVERVIEW</span><h1>月別の家計簿</h1><p className="muted">カードごとの締め日に合わせて支出をまとめます。</p></div><label className="month-picker">表示する月<input aria-label="表示する月" type="month" min="1000-01" max="9998-12" required value={month} onChange={e => { if (e.target.validity.valid && e.target.value) setMonth(e.target.value) }} /></label></div>
    <section className="overview"><div className="total-card"><span>{month.replace('-', '年 ')}月の支出合計</span><strong>{loading ? '…' : money(total)}</strong><div><span>{expenses.length} 件の記録</span><span>カードの締め日ベース</span></div></div><div className="summary-panel"><div className="section-title"><h2>カード別の集計</h2><span className="muted">月間の利用額</span></div>{!cards.length && <p className="empty">最初のカードを「カード・項目管理」から登録しましょう。</p>}<div className="card-summaries">{summary.map((card, index) => <div className="summary-row" key={card.id}><span className={`card-dot color-${index%3}`}>#{card.id}</span><div className="card-info"><div><strong>{card.name}</strong><span>{card.count} 件</span></div><small className="billing-period">対象：{card.period_start.replaceAll('-', '/')} 〜 {card.period_end.replaceAll('-', '/')}</small><div className="bar"><i style={{ width: `${total ? Number(card.total)/total*100 : 0}%` }} /></div></div><b>{money(Number(card.total))}</b></div>)}</div></div></section>
    <div className="entry-grid"><section className="panel"><div className="section-title"><h2>{draft.id ? '明細を編集' : '支出を記録'}</h2><span className="tag">NUMBER INPUT</span></div><form onSubmit={save}><div className="form-grid"><label>購入日<input type="date" min="1000-01-01" max="9998-12-31" required value={draft.purchased_on} onChange={e => setDraft({...draft,purchased_on:e.target.value})} /></label><label>金額（円）<input type="number" inputMode="numeric" min="1" max="999999999" step="1" placeholder="0" required value={draft.amount} onChange={e => setDraft({...draft,amount:e.target.value})} /></label><label>カード管理番号<input type="number" min="1" step="1" placeholder="例：1" required value={draft.card_id} onChange={e => setDraft({...draft,card_id:e.target.value})} /><small>{cards.find(c => String(c.id)===draft.card_id)?.name || '右の参照表から番号を選択'}</small></label><label>購入項目番号<input type="number" min="1" step="1" placeholder="例：1" required value={draft.item_id} onChange={e => setDraft({...draft,item_id:e.target.value})} /><small>{items.find(i => String(i.id)===draft.item_id)?.name || '右の参照表から番号を選択'}</small></label></div><label>メモ <span className="muted">任意</span><input maxLength={500} placeholder="お店の名前や買ったものなど" value={draft.note} onChange={e => setDraft({...draft,note:e.target.value})} /></label><div className="form-actions"><button type="submit" className="primary" disabled={busy || !cards.length || !items.length}>{busy ? '保存中…' : draft.id ? '変更を保存' : '＋ 支出を記録する'}</button>{draft.id && <button type="button" className="secondary" onClick={() => setDraft(emptyDraft())}>キャンセル</button>}</div></form></section>
    <section className="panel reference"><div className="section-title"><h2>番号の参照表</h2><button className="text-button" onClick={() => setTab('masters')}>登録・編集 ↗</button></div><p className="muted">クリックして入力欄にセットできます。</p><h3>クレジットカード</h3><div className="chips">{cards.map(c => <button key={c.id} className={draft.card_id===String(c.id)?'selected':''} onClick={() => setDraft({...draft,card_id:String(c.id)})}><b>{c.id}</b>{c.name}</button>)}{!cards.length && <span className="muted">まだ登録されていません。</span>}</div><h3>購入項目</h3><div className="chips">{items.map(i => <button key={i.id} className={draft.item_id===String(i.id)?'selected':''} onClick={() => setDraft({...draft,item_id:String(i.id)})}><b>{i.id}</b>{i.name}</button>)}{!items.length && <span className="muted">まだ登録されていません。</span>}</div></section></div>
    <section className="panel ledger"><div className="section-title"><h2>支出の明細 <span className="count">{visibleExpenses.length}</span></h2><div className="ledger-tools"><button type="button" className="secondary" disabled={loading || busy || !visibleExpenses.length} onClick={exportCsv}>CSV出力（Excel用）</button><select aria-label="明細のカード絞り込み" value={filter} onChange={e => setFilter(e.target.value)}><option value="">すべてのカード</option>{cards.map(c => <option key={c.id} value={c.id}>#{c.id} {c.name}</option>)}</select></div></div><div className="table-scroll"><table><thead><tr><th>購入日</th><th>購入項目 / メモ</th><th>カード</th><th className="numeric">金額</th><th>操作</th></tr></thead><tbody>{visibleExpenses.map(row => <tr key={row.id}><td>{row.purchased_on.replaceAll('-', '/')}</td><td><strong>{row.item_name}</strong><small>{row.note || '—'}</small></td><td><span className="table-card">#{row.card_id} {row.card_name}</span></td><td className="numeric amount">{money(Number(row.amount))}</td><td className="row-actions"><button disabled={busy} onClick={() => edit(row)}>編集</button><button disabled={busy} className="danger" onClick={() => { if (window.confirm(`${row.purchased_on} ${row.item_name} ${money(Number(row.amount))} を削除しますか？`)) void run(async () => { await api('expenses',{operation:'delete',id:row.id}); if(draft.id===row.id) setDraft(emptyDraft()); setRevision(v=>v+1); setNotice('明細を削除しました。') }) }}>削除</button></td></tr>)}</tbody></table></div>{!visibleExpenses.length && <div className="empty-state"><span>▤</span><h3>{loading ? '読み込み中…' : 'この月の記録はまだありません'}</h3><p>上のフォームから、お買いものを記録しましょう。</p></div>}</section><p className="footnote">※ 表示月は締め月です。カードごとの締め日で振り分けています。対象期間は各カードの集計欄で確認できます。</p></>}
    {tab === 'masters' && <><div className="page-heading"><div><span className="eyebrow">YOUR NUMBER LIST</span><h1>カード・項目管理</h1><p className="muted">新しく登録すると、入力用の管理番号が自動で付きます。</p></div></div><div className="master-grid"><MasterPanel title="クレジットカード" kind="cards" rows={cards} busy={busy} save={(data) => run(async () => { const result = await api<{id?:number}>('masters',data); setRevision(v=>v+1); setNotice(result.id ? `管理番号 ${result.id} で登録しました。` : 'カードの設定を更新し、再集計しました。') })} /><MasterPanel title="購入項目" kind="items" rows={items} busy={busy} save={(data) => run(async () => { const result = await api<{id?:number}>('masters',data); setRevision(v=>v+1); setNotice(result.id ? `項目番号 ${result.id} で登録しました。` : '名前を更新しました。') })} /></div><p className="footnote">締め日を変更すると、過去の明細も新しい設定で再集計します。購入日は変更しません。実際のカード番号は保存しないでください。</p></>}
    {tab === 'settings' && <><div className="page-heading"><div><span className="eyebrow">ACCOUNT SETTINGS</span><h1>パスワード設定</h1><p className="muted">あなた専用のログインパスワードを変更します。</p></div></div><section className="panel settings"><form onSubmit={e => { e.preventDefault(); void run(async () => { if(newPassword!==confirmPassword) throw new Error('新しいパスワードが一致しません。'); await api('password',{current:currentPassword,password:newPassword}); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setNotice('パスワードを変更しました。他のログインは無効になります。') }) }}><label>現在のパスワード<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label>新しいパスワード<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /><small>12〜72バイト。英数字・記号を組み合わせてください。</small></label><label>新しいパスワード（確認）<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label><button className="primary" disabled={busy}>パスワードを変更</button></form></section></>}
    </main></div>
}

// カードは締め日、購入項目は名称を設定します。
function MasterPanel({ title, kind, rows, busy, save }: { title:string; kind:string; rows:Master[]; busy:boolean; save:(data:unknown)=>Promise<boolean> }) {
  const [name,setName] = useState('')
  const [id,setId] = useState<number | undefined>()
  const [closingDay,setClosingDay] = useState('31')

  const isCard = kind === 'cards'

  function reset() { setName(''); setId(undefined); setClosingDay('31') }
  return <section className="panel"><h2>{title}</h2>
    <form onSubmit={e => { e.preventDefault(); void save({kind,name,id,...(isCard ? {closing_day:Number(closingDay)} : {})}).then(ok => { if(ok) reset() }) }}>
      <label>{id ? '番号 '+id+' の'+(isCard ? '設定変更' : '名称変更') : '新規登録'}<input maxLength={100} required placeholder={isCard?'例：楽天カード':'例：食料品'} value={name} onChange={e=>setName(e.target.value)} /></label>
      {isCard && <><div className="form-grid billing-settings">
        <label>締め日（決算日）<select value={closingDay} onChange={e=>setClosingDay(e.target.value)}>{Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}<option value="31">月末</option></select></label>
      </div><p className="muted billing-help">表示月は締め月です。例：15日締めの11月分は10月16日〜11月15日。締め日当日を含み、29・30日がない月は月末扱いです。</p>{id && <p className="muted billing-help">設定変更は過去の月にも反映されます。</p>}</>}
      <div className="form-actions"><button className="primary" disabled={busy}>{id ? (isCard?'設定を保存':'名前を更新') : '＋ 番号を付けて登録'}</button>{id && <button type="button" className="secondary" onClick={reset}>新規登録に戻る</button>}</div>
    </form>
    <div className="master-list">{rows.map(row=><div key={row.id}><b>#{row.id}</b><span>{row.name}{isCard && <small className="billing-period">{Number(row.closing_day)===31?'月末':row.closing_day+'日'}締め</small>}</span><button className="text-button" onClick={()=>{setId(row.id);setName(row.name);setClosingDay(String(row.closing_day ?? 31))}}>{isCard?'設定を編集':'名前を編集'}</button></div>)}{!rows.length && <p className="empty">まだ登録されていません。</p>}</div>
  </section>
}
