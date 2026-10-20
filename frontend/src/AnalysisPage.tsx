import { useEffect, useRef, useState } from 'react'
import { analyze, getProducts, recommend, STANDARD_OPTIONS } from './api'
import type { Analysis, FeedingItem, ManualItem, Product, Profile, Recommendation, StandardProfile } from './api'
import Records, { loadProfiles, saveProfile, saveRecord } from './Records'
import type { AnalysisDraft } from './Home'

const STEPS: [string, string][] = [['step-1', '반려동물 정보'], ['step-2', '사료·영양제 선택'], ['step-3', '직접 입력'], ['step-4', '분석 결과'], ['step-5', '기록']]

function StepNav() {
  const [active, setActive] = useState('step-1')
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (hit) setActive(hit.target.id)
    }, { rootMargin: '-120px 0px -55% 0px' })
    STEPS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [])
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <nav className="step-nav" aria-label="분석 진행 순서"><div>{STEPS.map(([id, label], i) => <button key={id} type="button" className={active === id ? 'on' : ''} aria-current={active === id ? 'step' : undefined} onClick={() => go(id)}><b>{i + 1}</b><span>{label}</span></button>)}</div></nav>
}

const STATUS: Record<string, string> = { DEFICIENT: '부족', ADEQUATE: '적정', ADEQUATE_NO_UPPER_LIMIT: '적정 · 상한 없음', NO_STANDARD: '기준 없음', CAUTION: '주의', EXCESS: '과다' }
const RATIO: Record<string, string> = { LOW: '낮음', HIGH: '높음', ADEQUATE: '적정', UNAVAILABLE: '계산 불가' }
const UNIT: Record<string, string> = { TABLET: '정', CAPSULE: '캡슐', G: 'g', MG: 'mg', ML: 'mL' }
const MANUAL_NUTRIENTS: [string, string, string][] = [
  ['TAURINE', '타우린', 'G'], ['EPA_DHA', 'EPA+DHA', 'G'], ['CALCIUM', '칼슘', 'MG'], ['PHOSPHORUS', '인', 'MG'],
  ['COPPER', '구리', 'MG'], ['IODINE', '요오드', 'MG'], ['IRON', '철', 'MG'], ['MANGANESE', '망간', 'MG'],
  ['SELENIUM', '셀레늄', 'UG'], ['ZINC', '아연', 'MG'], ['VITAMIN_A', '비타민 A', 'IU'], ['VITAMIN_D', '비타민 D', 'IU'],
  ['VITAMIN_E', '비타민 E', 'MG'], ['VITAMIN_B1', '비타민 B1', 'MG'], ['VITAMIN_B6', '비타민 B6', 'MG'],
  ['VITAMIN_B12', '비타민 B12', 'UG'], ['VITAMIN_B9', '비타민 B9', 'UG'], ['VITAMIN_B7', '비타민 B7', 'UG'],
]
const fmt = (v: number | null) => (v === null ? '-' : v.toFixed(1))

function NutrientBar({ nutrient }: { nutrient: Analysis['nutrients'][number] }) {
  const ceiling = nutrient.upper ?? nutrient.caution ?? Math.max(nutrient.minimum ?? 0, nutrient.total, 1)
  const percent = (value: number | null) => value === null ? null : Math.min(100, Math.max(0, value / ceiling * 100))
  const total = percent(nutrient.total) ?? 0
  const feed = percent(nutrient.fromFeed) ?? 0
  const supplements = percent(nutrient.fromSupplements) ?? 0
  const minimum = percent(nutrient.minimum)
  const caution = percent(nutrient.caution)
  const upper = percent(nutrient.upper)
  const source = nutrient.source === 'ESTIMATED' ? '사료 추정 포함' : '성분표 실제값'
  return <div className={`nutrient-bar-row ${nutrient.source === 'ESTIMATED' ? 'estimated' : ''}`}>
    <div className="nutrient-bar-head"><b>{nutrient.name}{nutrient.source === 'ESTIMATED' && <em className="estimate-badge">추정</em>}</b><span>{source} · {STATUS[nutrient.status] ?? nutrient.status}</span></div>
    <div className="nutrient-track" role="img" aria-label={`${nutrient.name}: ${fmt(nutrient.total)} ${nutrient.unit}, ${source}, ${STATUS[nutrient.status] ?? nutrient.status}`}>
      <span className={`nutrient-fill ${nutrient.status}`} style={{ width: `${total}%` }} />
      <span className="nutrient-segment feed" style={{ width: `${feed}%` }} title={`사료 ${fmt(nutrient.fromFeed)}`} />
      <span className="nutrient-segment supplement" style={{ left: `${feed}%`, width: `${supplements}%` }} title={`영양제 ${fmt(nutrient.fromSupplements)}`} />
      {minimum !== null && <i className="nutrient-marker minimum" style={{ left: `${minimum}%` }} title={`하한 ${fmt(nutrient.minimum)}`} />}
      {caution !== null && <i className="nutrient-marker caution" style={{ left: `${caution}%` }} title={`주의 ${fmt(nutrient.caution)}`} />}
      {upper !== null && <i className="nutrient-marker upper" style={{ left: `${upper}%` }} title={`상한 ${fmt(nutrient.upper)}`} />}
    </div>
    <div className="nutrient-bar-scale"><span>사료 {fmt(nutrient.fromFeed)} · 영양제 {fmt(nutrient.fromSupplements)} · 합계 {fmt(nutrient.total)} {nutrient.unit.toLowerCase()}</span><span>하한 {fmt(nutrient.minimum)} · 주의 {fmt(nutrient.caution)} · 상한 {fmt(nutrient.upper)}</span></div>
  </div>
}

export default function AnalysisPage({ onSaved, onAnalysis, initialProfileId, initialDraft, loadSeq = 0, active = true }: { onSaved: () => void; onAnalysis: (analysis: Analysis | null) => void; initialProfileId?: string; initialDraft?: AnalysisDraft; loadSeq?: number; active?: boolean }) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<'DOG' | 'CAT'>('DOG')
  const [weight, setWeight] = useState('')
  const [ageValue, setAgeValue] = useState('')
  const [ageUnit, setAgeUnit] = useState<'WEEK' | 'MONTH'>('MONTH')
  const [expectedAdultWeight, setExpectedAdultWeight] = useState('')
  const [completeFeed, setCompleteFeed] = useState(true)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [items, setItems] = useState<FeedingItem[]>([])
  const [manualItems, setManualItems] = useState<ManualItem[]>([])
  const emptyNutrients = () => Object.fromEntries(MANUAL_NUTRIENTS.map(([id]) => [id, ''])) as Record<string, string>
  const [manual, setManual] = useState({ name: '', type: 'SUPPLEMENT' as 'FEED' | 'SUPPLEMENT', amount: '1', unit: 'TABLET', daily: '1', nutrients: emptyNutrients() })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [error, setError] = useState('')
  const [standardProfile, setStandardProfile] = useState<StandardProfile>('FEDIAF_2025')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profiles, setProfiles] = useState(loadProfiles)
  const [profileId, setProfileId] = useState('')
  const [recTick, setRecTick] = useState(0)
  const [profileSaved, setProfileSaved] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setProductsLoading(true)
    getProducts(query).then(r => {
      if (!active) return
      setFound(r.items.filter(product => product.id.includes('-cat') ? species === 'CAT' : product.id.includes('-dog') ? species === 'DOG' : true))
    }).catch(e => { if (active) { setFound([]); setError(e instanceof Error ? e.message : '제품 목록을 불러오지 못했습니다.') } }).finally(() => { if (active) setProductsLoading(false) })
    return () => { active = false }
  }, [query, species])

  const ageDays = ageUnit === 'WEEK' ? Number(ageValue) * 7 : Number(ageValue) * 30.4375
  const needSize = species === 'DOG' && ageDays > 0 && ageDays < 365
  const profile: Profile = {
    name: name || '우리 아이', species, weightKg: Number(weight),
    age: { value: Number(ageValue), unit: ageUnit }, completeFeed,
    ...(needSize ? { expectedAdultWeightKg: Number(expectedAdultWeight) } : {}),
  }
  const profileReady = Boolean(name.trim() && Number(weight) > 0 && Number(ageValue) > 0 && (!needSize || Number(expectedAdultWeight) >= Number(weight)))
  const manualReady = Boolean(manual.name.trim() && Number(manual.amount) > 0 && Number(manual.daily) > 0 && Object.values(manual.nutrients).some(value => value !== '' && Number(value) >= 0))
  const analysisReady = profileReady && (items.length > 0 || manualItems.length > 0) && items.every(item => item.dailyAmount > 0)
  const missingRequirements = [
    !name.trim() ? '이름' : '',
    !(Number(weight) > 0) ? '체중' : '',
    !(Number(ageValue) > 0) ? '나이' : '',
    needSize && !(Number(expectedAdultWeight) >= Number(weight)) ? '예상 성체 체중' : '',
    items.length === 0 && manualItems.length === 0 ? '급여 제품' : '',
    items.some(item => item.dailyAmount <= 0) ? '올바른 급여량' : '',
  ].filter(Boolean)
  const calciumPhosphorus = analysis?.ratios.calciumPhosphorus
  const ratioNeedsAttention = Boolean(calciumPhosphorus && ['LOW', 'HIGH'].includes(calciumPhosphorus.status))
  const compatibleProducts = found.filter(product => {
    if (product.id.includes('-cat')) return species === 'CAT'
    if (product.id.includes('-dog')) return species === 'DOG'
    return true
  })

  function loadProfile(id: string) {
    setProfileId(id)
    const fresh = loadProfiles()
    setProfiles(fresh)
    const selected = fresh.find(item => item.id === id)
    if (!selected) return
    setName(selected.name); setSpecies(selected.species); setWeight(String(selected.weightKg))
    setAgeValue(String(selected.age.value)); setAgeUnit(selected.age.unit)
    setExpectedAdultWeight(selected.expectedAdultWeightKg ? String(selected.expectedAdultWeightKg) : ''); setCompleteFeed(selected.completeFeed)
    setProfileSaved(false); setError('')
  }
  function saveCurrentProfile() {
    if (!name.trim() || !(Number(weight) > 0) || !(Number(ageValue) > 0)) { setError('프로필을 저장하려면 이름, 체중, 나이를 입력해 주세요.'); return }
    if (needSize && (!(Number(expectedAdultWeight) >= Number(weight)))) { setError('성장기 강아지는 현재 체중 이상인 예상 성체 체중을 입력해 주세요.'); return }
    const savedProfile = saveProfile(profile, profileId || undefined)
    const next = profileId ? profiles.map(item => item.id === savedProfile.id ? savedProfile : item) : [savedProfile, ...profiles]
    setProfiles(next); setProfileId(savedProfile.id); setProfileSaved(true); setError(''); onSaved()
  }
  useEffect(() => { if (active) setProfiles(loadProfiles()) }, [active])
  useEffect(() => {
    if (initialProfileId) loadProfile(initialProfileId)
  }, [initialProfileId, loadSeq])
  useEffect(() => {
    if (!initialDraft || initialProfileId) return
    setName(initialDraft.name)
    setAgeValue(String(initialDraft.ageYears * 12))
    setAgeUnit('MONTH')
  }, [initialDraft, initialProfileId])

  const add = (p: { id: string; name: string; type: 'FEED' | 'SUPPLEMENT'; servingUnit: string }, amount?: number) => {
    if (items.some(i => i.productId === p.id)) return
    setItems([...items, { productId: p.id, name: p.name, type: p.type, unit: p.servingUnit, dailyAmount: amount ?? (p.type === 'FEED' ? 100 : 1) }])
  }
  const setAmount = (id: string, v: string) => setItems(items.map(i => (i.productId === id ? { ...i, dailyAmount: Number(v) } : i)))
  const adjustAmount = (id: string, delta: number) => setItems(items.map(i => i.productId === id ? { ...i, dailyAmount: Math.max(0.1, Math.round((i.dailyAmount + delta) * 10) / 10) } : i))

  async function addRecommendation(r: Recommendation['items'][number]) {
    const nextItems = [...items, { productId: r.productId, name: r.name, type: 'SUPPLEMENT' as const, unit: r.unit, dailyAmount: r.dailyAmount }]
    setItems(nextItems)
    setLoading(true); setError(''); setSaved(false)
    try {
      const [nextAnalysis, nextRecommendation] = await Promise.all([analyze(profile, nextItems, manualItems, standardProfile), recommend(profile, nextItems, manualItems, standardProfile)])
      setAnalysis(nextAnalysis); onAnalysis(nextAnalysis); setRec(nextRecommendation)
      window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가한 제품을 다시 분석하지 못했습니다.')
    } finally { setLoading(false) }
  }

  async function run() {
    setError(''); setSaved(false)
    if (!(Number(weight) > 0) || !(Number(ageValue) > 0)) { setError('체중과 나이를 입력해 주세요.'); return }
    if (items.length === 0 && manualItems.length === 0) { setError('급여 중인 제품을 하나 이상 추가해 주세요.'); return }
    setLoading(true)
    try {
      const [a, r] = await Promise.all([analyze(profile, items, manualItems, standardProfile), recommend(profile, items, manualItems, standardProfile)])
      setAnalysis(a); onAnalysis(a); setRec(r)
      window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      setAnalysis(null); onAnalysis(null); setRec(null)
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.')
    } finally { setLoading(false) }
  }

  function saveManual() {
    const nutrients = Object.entries(manual.nutrients).filter(([, value]) => Number(value) >= 0 && value !== '').map(([nutrientId, value]) => ({ nutrientId, amount: Number(value), unit: MANUAL_NUTRIENTS.find(([id]) => id === nutrientId)?.[2] ?? 'MG' }))
    if (!manual.name.trim() || !nutrients.length || Number(manual.amount) <= 0 || Number(manual.daily) <= 0) { setError('직접 입력 제품명, 급여량, 영양성분을 하나 이상 입력해 주세요.'); return }
    setManualItems([...manualItems, { name: manual.name.trim(), type: manual.type, servingAmount: Number(manual.amount), servingUnit: manual.unit, dailyAmount: Number(manual.daily), nutrients }])
    setManual({ ...manual, name: '', nutrients: emptyNutrients() })
    setError('')
  }

  function save() {
    if (!analysis) return
    saveRecord({ id: analysis.traceId, profileId: profileId || undefined, date: new Date().toISOString(), name: profile.name, species, items: [...items.map(i => `${i.name} ${i.dailyAmount}${i.unit}`), ...manualItems.map(item => `${item.name} ${item.dailyAmount}${item.servingUnit} (직접 입력)`)], summary: analysis.summary, standardVersion: analysis.standardVersion, standardSource: analysis.standardSource })
    setSaved(true); setRecTick(t => t + 1); onSaved()
  }

  return (
    <div className="w page analysis-page">
      <section className="analysis-hero">
        <span className="analysis-kicker">DAILY NUTRITION CHECK</span>
        <h1>사료 · 영양제 분석</h1>
        <p>반려동물 정보와 먹는 제품을 입력하면 하루 영양 섭취량을 한눈에 비교해 드려요.</p>
        {initialDraft?.symptoms.length ? <div className="concern-handoff"><b>선택한 관심 건강</b><span>{initialDraft.symptoms.join(' · ')}</span><small>아래에서 체중과 급여 제품을 추가하면 맞춤 분석을 시작할 수 있어요.</small></div> : null}
      </section>

      <StepNav />

      <div className="analysis-grid">

      <div id="step-1" className="panel input-panel profile-panel"><div className="panel-title"><span>STEP 1</span><div><h3>반려동물 정보</h3><p>한 번 저장하면 다음 분석에서 다시 사용할 수 있어요.</p></div></div>
        <div className="profile-actions"><label className="f">저장된 프로필 불러오기<select className="in" value={profileId} onChange={e => loadProfile(e.target.value)}><option value="">새 프로필 작성</option>{profiles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.species === 'DOG' ? '강아지' : '고양이'} · {item.weightKg}kg</option>)}</select></label>{profileReady ? <button className="btn ghost reveal-action" onClick={saveCurrentProfile}>{profileSaved ? '프로필 저장됨' : profileId ? '프로필 수정 저장' : '프로필 저장'}</button> : <span className="action-hint">필수 칸을 입력하면 저장 버튼이 나타나요.</span>}</div>
        <div className="grid2">
          <label className="f">이름<input className="in" value={name} onChange={e => setName(e.target.value)} placeholder="예: 보리" /></label>
          <label className="f">종<select className="in" value={species} onChange={e => setSpecies(e.target.value as 'DOG' | 'CAT')}><option value="DOG">강아지</option><option value="CAT">고양이</option></select></label>
          <label className="f">체중(kg)<input className="in" type="number" min="0" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} /></label>
          <label className="f">나이<input className="in" type="number" min="0" value={ageValue} onChange={e => setAgeValue(e.target.value)} /></label>
          <label className="f">나이 단위<select className="in" value={ageUnit} onChange={e => setAgeUnit(e.target.value as 'WEEK' | 'MONTH')}><option value="MONTH">개월</option><option value="WEEK">주</option></select></label>
          {needSize && <label className="f">예상 성체 체중(kg)<input className="in" type="number" min={weight || '0.1'} step="0.1" value={expectedAdultWeight} onChange={e => setExpectedAdultWeight(e.target.value)} /><small className="note">성장기 열량 계산에 사용합니다.</small></label>}
        </div>
        <label className="chk"><input type="checkbox" checked={completeFeed} onChange={e => setCompleteFeed(e.target.checked)} />주식으로 완전사료를 먹고 있어요</label>
      </div>

      <div id="step-2" className="panel input-panel products-panel"><div className="panel-title"><span>STEP 2</span><div><h3>사료 · 영양제 입력</h3><p>현재 먹고 있는 제품과 하루 급여량을 알려주세요.</p></div></div>
        <div className="product-choice-head"><div><b>등록 제품에서 선택</b><small>아래 제품을 선택하거나, 검색되지 않는 제품은 직접 입력할 수 있어요. 두 방식은 함께 사용 가능합니다.</small></div><span>선택 {items.length} · 직접 입력 {manualItems.length}</span></div>
        <input className="in" style={{ width: '100%' }} placeholder="제품 검색" value={query} onChange={e => setQuery(e.target.value)} />
        <ul className="plist">
          {productsLoading && <li className="note">선택 가능한 제품을 불러오는 중…</li>}
          {found.map(p => (
            <li key={p.id}><span><span className="tag">{p.type === 'FEED' ? '사료' : '영양제'}</span>{p.name} <small>{p.brand}</small></span>
              <button className="btn ghost" onClick={() => add(p)} disabled={items.some(i => i.productId === p.id)}>추가</button></li>
          ))}
          {!productsLoading && found.length === 0 && <li className="empty-product-result"><span>검색 결과가 없습니다.</span>{query && <button className="btn ghost" onClick={() => setQuery('')}>전체 제품 보기</button>}</li>}
        </ul>
        {items.length > 0 && <>
          <h3 style={{ marginTop: 18 }}>급여 목록 (하루)</h3>
          <ul className="plist">
            {items.map(i => (
              <li key={i.productId}><span><span className="tag">{i.type === 'FEED' ? '사료' : '영양제'}</span>{i.name}</span>
                <span className="amount-editor"><button className="amount-step" aria-label={`${i.name} 급여량 줄이기`} onClick={() => adjustAmount(i.productId, i.type === 'FEED' ? -10 : -1)}>−</button><input className="in amt" aria-label={`${i.name} 하루 급여량`} type="number" min="0.1" step="any" value={i.dailyAmount} onChange={e => setAmount(i.productId, e.target.value)} /><span className="amount-unit">{i.unit}</span><button className="amount-step" aria-label={`${i.name} 급여량 늘리기`} onClick={() => adjustAmount(i.productId, i.type === 'FEED' ? 10 : 1)}>+</button>
                  <button className="btn ghost" onClick={() => setItems(items.filter(x => x.productId !== i.productId))}>삭제</button></span></li>
            ))}
          </ul></>}
      </div></div>

      <div id="step-3" className="panel manual-panel"><div className="panel-title compact"><span>STEP 3</span><div><h3>검색되지 않는 제품 직접 입력</h3><p>제품 라벨의 1회 제공량과 영양성분을 입력해 함께 계산할 수 있어요.</p></div></div>
        <div className="grid2"><label className="f">제품명<input className="in" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} placeholder="예: 우리집 관절 영양제" /></label><label className="f">구분<select className="in" value={manual.type} onChange={e => setManual({ ...manual, type: e.target.value as 'FEED' | 'SUPPLEMENT' })}><option value="SUPPLEMENT">영양제</option><option value="FEED">사료</option></select></label><label className="f">1회 제공량<input className="in" type="number" min="0.1" value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value })} /></label><label className="f">단위<select className="in" value={manual.unit} onChange={e => setManual({ ...manual, unit: e.target.value })}><option value="TABLET">정</option><option value="CAPSULE">캡슐</option><option value="G">g</option></select></label><label className="f">하루 급여량<input className="in" type="number" min="0.1" value={manual.daily} onChange={e => setManual({ ...manual, daily: e.target.value })} /></label></div>
        <div className="grid2" style={{ marginTop: 12 }}>{MANUAL_NUTRIENTS.map(([id, label, unit]) => <label className="f" key={id}>{label} ({unit.toLowerCase()})<input className="in" type="number" min="0" value={manual.nutrients[id]} onChange={e => setManual({ ...manual, nutrients: { ...manual.nutrients, [id]: e.target.value } })} /></label>)}</div>
        {manualReady ? <button className="btn reveal-action" style={{ marginTop: 14 }} onClick={saveManual}>직접 입력 제품 저장</button> : <p className="action-hint inline">제품명과 영양성분을 입력하면 저장 버튼이 나타나요.</p>}
        {manualItems.length > 0 && <ul className="plist">{manualItems.map((item, index) => <li key={`${item.name}-${index}`}><span><span className="tag">직접 입력</span>{item.name}</span><button className="btn ghost" onClick={() => setManualItems(manualItems.filter((_, i) => i !== index))}>삭제</button></li>)}</ul>}
        <div className="manual-skip"><span>검색 제품만으로 분석한다면 이 단계는 건너뛸 수 있어요.</span><button className="btn ghost" onClick={run} disabled={!profileReady || items.length === 0 || loading}>{loading ? '분석 중…' : '세 번째 단계 건너뛰고 분석하기 →'}</button></div>
      </div>

      <section id="step-4" className="step-section">
      <div className="panel standard-select"><b>영양 기준 선택</b><div role="radiogroup" aria-label="영양 기준 선택">{STANDARD_OPTIONS.map(option => <label key={option.id}><input type="radio" name="standardProfile" value={option.id} checked={standardProfile === option.id} disabled={!option.available || loading} onChange={() => { setStandardProfile(option.id); setAnalysis(null); setRec(null) }} /> {option.label} <small>{option.note}</small></label>)}</div></div>
      {error && <div className="err" role="alert">{error}{analysisReady && <button className="btn ghost" onClick={run} disabled={loading}>다시 시도</button>}</div>}
      <div className={`analysis-action ${analysisReady ? 'ready' : ''}`}><div className="analysis-readiness"><b>{analysisReady ? '분석 준비 완료' : '아직 필요한 정보가 있어요'}</b><span>{analysisReady ? `선택 제품 ${items.length}개와 직접 입력 제품 ${manualItems.length}개의 하루 총량을 함께 계산합니다.` : `${missingRequirements.join(' · ')}${missingRequirements.length ? '을(를) 입력해 주세요.' : ''}`}</span></div><button className="btn reveal-action" onClick={run} disabled={!analysisReady || loading}>{loading ? '분석 중…' : '맞춤 분석 시작하기'}</button></div>

      {analysis && (
        <div className="panel result-panel" ref={resultRef} style={{ marginTop: 24 }}><div className="result-title"><span>STEP 4 · RESULT</span><h3>오늘의 영양 분석</h3><p>사료와 영양제의 하루 섭취량을 공식 기준과 비교했어요.</p></div>
          <div className={`verdict ${analysis.summary.excess || ratioNeedsAttention ? 'danger' : analysis.summary.caution ? 'warning' : analysis.summary.deficient ? 'check' : 'safe'}`} role="status">
            <span>{analysis.summary.excess ? '과다 성분이 있어요' : ratioNeedsAttention ? '칼슘:인 비율을 확인해 주세요' : analysis.summary.caution ? '주의가 필요한 성분이 있어요' : analysis.summary.deficient ? '부족한 성분을 확인해 주세요' : '현재 조합은 기준 범위 안이에요'}</span>
            <b>{analysis.summary.excess ? `${analysis.summary.excess}개 성분이 상한을 넘었어요. 급여 제품을 줄이거나 제외해 다시 분석해 보세요.` : ratioNeedsAttention ? `현재 칼슘:인 비율이 적용 범위보다 ${calciumPhosphorus?.status === 'LOW' ? '낮아요' : '높아요'}. 칼슘과 인 급여량을 조정해 주세요.` : analysis.summary.caution ? `${analysis.summary.caution}개 성분이 서비스 주의선에 도달했어요.` : analysis.summary.deficient ? `${analysis.summary.deficient}개 성분이 최소 권장량보다 낮아요.` : '적용 가능한 공식 기준에서 주의·과다가 확인되지 않았어요.'}</b>
          </div>
          {analysis.usesEstimatedFeed && <div className="estimate-alert">일부 사료 성분은 제품 상세값이 없어 최소 권장량으로 추정했어요. 성분표 실제값과 구분해 확인해 주세요.</div>}
          <div className="sum">
            <div><b>{analysis.summary.deficient ?? 0}</b>부족</div><div><b>{analysis.summary.adequate ?? 0}</b>적정</div>
            <div><b>{analysis.summary.caution ?? 0}</b>주의</div><div><b>{analysis.summary.excess ?? 0}</b>과다</div>
            <div><b>{analysis.summary.noStandard ?? 0}</b>기준 없음</div>
          </div>
          <div className="note">분석 프로필: {profile.name || '우리 아이'} · {species === 'DOG' ? '강아지' : '고양이'} · {weight}kg · {ageValue}{ageUnit === 'MONTH' ? '개월' : '주'}</div>
          <div className="note">하루 기준 에너지 {analysis.referenceEnergyKcal == null ? '검증 대기' : `약 ${Math.round(analysis.referenceEnergyKcal)}kcal`} · 선택 기준 {standardProfile} · 결과 기준 버전 {analysis.standardVersion}</div>
          {analysis.standardSource && <div className="note">기준 출처: {analysis.standardSource}</div>}
          {analysis.cautionPolicy && <div className="note">주의선 정책: {analysis.cautionPolicy}</div>}
          <p className="note">기준에 포함된 성분만 결과에 표시합니다. 막대의 선은 하한·주의·상한이며, 각 성분의 실제값 또는 추정 여부를 함께 표시합니다.</p>
          <aside className="analysis-scope" aria-label="분석 범위 안내"><b>분석 범위 안내</b><span>기준 버전 {analysis.standardVersion} · 결과 {analysis.nutrients.length}종 성분</span><span>{analysis.usesEstimatedFeed ? '일부 사료 성분은 최소 권장량을 사용한 추정값입니다.' : '입력·선택한 제품의 제공량과 하루 급여량을 기준으로 계산했습니다.'}</span><span>이 결과는 건강 상태의 진단·처방 또는 확정 급여 권고가 아닙니다.</span></aside>
          <div className="nutrient-bars">{analysis.nutrients.map(n => <NutrientBar key={n.nutrientId} nutrient={n} />)}</div>
          <div className="tw"><table>
            <thead><tr><th>영양소</th><th>데이터</th><th>사료</th><th>영양제</th><th>합계</th><th>최소</th><th>상한</th><th>상태</th></tr></thead>
            <tbody>{analysis.nutrients.map(n => (
              <tr key={n.nutrientId}><td data-label="영양소">{n.name} ({n.unit.toLowerCase()})</td><td data-label="데이터">{n.source === 'ESTIMATED' ? '사료 추정' : '실제값'}</td><td data-label="사료">{fmt(n.fromFeed)}</td><td data-label="영양제">{fmt(n.fromSupplements)}</td><td data-label="합계">{fmt(n.total)}</td><td data-label="최소">{fmt(n.minimum)}</td><td data-label="상한">{fmt(n.upper)}</td>
                <td data-label="상태" className={`st ${n.status}`}>{STATUS[n.status] ?? n.status}</td></tr>))}</tbody>
          </table></div>
          <details className="contribution-details"><summary>제품별 성분 기여량 보기</summary><ul className="plist">{analysis.contributions.map((item, index) => <li key={`${item.name}-${index}`}><span><span className="tag">{item.type === 'FEED' ? '사료' : '영양제'}</span>{item.name} <small>{item.source === 'ESTIMATED' ? '최소 권장량 추정' : '성분표 실제값'}</small></span><small>{Object.entries(item.nutrients).map(([id, value]) => `${id}: ${fmt(value)}`).join(' · ') || '확인된 성분 없음'}</small></li>)}</ul></details>
          {Object.entries(analysis.ratios).map(([k, v]) => <p key={k} className="ratio-note"><b>{k === 'calciumPhosphorus' ? '칼슘:인 비율' : k} {fmt(v.value)} : 1</b><span>현재 분석 적용 범위 {v.minimum ?? 1} : 1 ~ {v.maximum ?? (analysis.lifeStage === 'GROWTH_EARLY' ? 1.6 : analysis.lifeStage === 'GROWTH_LATE' && Number(expectedAdultWeight) > 15 && ageDays < 182.625 ? 1.6 : analysis.lifeStage === 'GROWTH_LATE' ? 1.8 : 2)} : 1 · {RATIO[v.status] ?? v.status}</span></p>)}
          {analysis.warnings.length > 0 && <ul className="warns">{analysis.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          <p style={{ marginTop: 14 }}><button className="btn" onClick={save} disabled={saved}>{saved ? '저장됨' : '기록으로 저장'}</button></p>
        </div>
      )}

      {rec && (
        <div className="panel"><h3>추천 영양제</h3><p className="note">{rec.message}</p>
          <ul className="plist">
            {rec.items.map(r => (
              <li key={r.productId}><span>{r.name} <small>하루 {r.dailyAmount} {UNIT[r.unit] ?? r.unit} · 부족 성분 {r.fixedNutrients}종 보완</small></span>
                <button className="btn ghost" onClick={() => addRecommendation(r)} disabled={items.some(i => i.productId === r.productId) || loading}>급여 목록에 추가</button></li>))}
            {rec.items.length === 0 && <li className="note">추가로 권장할 제품이 없습니다.</li>}
          </ul>
          {rec.excluded.length > 0 && <details><summary className="note">제외된 제품 {rec.excluded.length}개</summary><ul className="warns">{rec.excluded.map(x => <li key={x.productId}>{x.name}: {x.reason}</li>)}</ul></details>}
        </div>
      )}
      {!analysis && <div className="panel result-placeholder"><div className="result-title"><span>STEP 4 · RESULT</span><h3>분석 결과</h3><p>위에서 정보를 입력하고 분석을 시작하면 이곳에 결과가 나타나요.</p></div></div>}
      </section>

      <section id="step-5" className="step-section records-section">
        <Records key={`${recTick}-${active}`} go={() => {}} selectProfile={id => { loadProfile(id); document.getElementById('step-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} embedded />
      </section>
      <p className="note">현재 영양 기준·제품 데이터는 기능 검증용 데모이며 수의학적 처방을 대체하지 않습니다.</p>
    </div>
  )
}
