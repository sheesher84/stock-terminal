import { useState, useCallback } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
         BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const C = {
  bg:"#07090f", surface:"#0d1117", card:"#111827", border:"#1a2332",
  muted:"#1e2d3d", text:"#e2e8f0", dim:"#64748b", faint:"#1e293b",
  green:"#22d3a0", red:"#f43f5e", gold:"#fbbf24", blue:"#38bdf8", purple:"#a78bfa",
};
const COLORS = ["#38bdf8","#22d3a0","#f43f5e","#a78bfa","#fbbf24"];

// ── ENV KEYS (set in Vercel environment variables) ────────────────────────────
const OPENAI_KEY  = import.meta.env.VITE_OPENAI_API_KEY || "";
const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY || "";

// ── FINNHUB FETCHERS ─────────────────────────────────────────────────────────
async function fetchFinnhub(path) {
  const res = await fetch(`https://finnhub.io/api/v1${path}&token=${FINNHUB_KEY}`);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json();
}

function calcCAGR(values) {
  // values = array oldest->newest of annual numbers
  const clean = values.filter(v => v && v !== 0);
  if (clean.length < 2) return null;
  const n = clean.length - 1;
  const cagr = (Math.pow(Math.abs(clean[clean.length-1]) / Math.abs(clean[0]), 1/n) - 1) * 100;
  return parseFloat(cagr.toFixed(1));
}

function fmt$(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs/1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + "$" + (abs/1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + "$" + (abs/1e6).toFixed(1) + "M";
  return sign + "$" + abs.toFixed(2);
}

function fmtPct(n) {
  if (n == null) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
}

async function loadTickerData(ticker) {
  const [quote, profile, metrics, income, news] = await Promise.all([
    fetchFinnhub(`/quote?symbol=${ticker}`),
    fetchFinnhub(`/stock/profile2?symbol=${ticker}`),
    fetchFinnhub(`/stock/metric?symbol=${ticker}&metric=all`),
    fetchFinnhub(`/financials/reported?symbol=${ticker}&freq=annual`),
    fetchFinnhub(`/company-news?symbol=${ticker}&from=${daysAgo(30)}&to=${today()}`),
  ]);

  const m = metrics.metric || {};

  // Pull annual revenue / earnings / FCF arrays for CAGR
  const annuals = (income.data || []).slice(0, 6).reverse();
  const revenues = annuals.map(r => r?.report?.ic?.find(x=>x.concept==="Revenues")?.value || null);
  const netIncomes = annuals.map(r => r?.report?.ic?.find(x=>x.concept==="NetIncomeLoss")?.value || null);

  const revenueCAGR1 = m["revenueGrowthTTMYoy"] != null ? parseFloat((m["revenueGrowthTTMYoy"]*100).toFixed(1)) : null;
  const revenueCAGR3 = calcCAGR(revenues.slice(-4));
  const revenueCAGR5 = calcCAGR(revenues.slice(-6));
  const epsCAGR3     = calcCAGR([m["epsBasicExclExtraItems3Year"], m["epsBasicExclExtraItemsTTM"]].filter(Boolean));

  // Top 5 recent headlines
  const headlines = (news || [])
    .slice(0, 8)
    .map(n => ({ headline: n.headline, source: n.source, url: n.url, sentiment: n.sentiment }));

  return {
    ticker,
    companyName:   profile.name || ticker,
    sector:        profile.finnhubIndustry || "—",
    exchange:      profile.exchange || "—",
    logo:          profile.logo || "",
    // Live price data
    currentPrice:  quote.c,
    change:        parseFloat((quote.c - quote.pc).toFixed(2)),
    changePct:     parseFloat(((quote.c - quote.pc)/quote.pc*100).toFixed(2)),
    high52:        m["52WeekHigh"] || quote.h,
    low52:         m["52WeekLow"]  || quote.l,
    // Fundamentals
    marketCap:     fmt$(profile.marketCapitalization ? profile.marketCapitalization*1e6 : null),
    marketCapRaw:  profile.marketCapitalization ? profile.marketCapitalization*1e6 : null,
    pe:            m["peBasicExclExtraTTM"] ? parseFloat(m["peBasicExclExtraTTM"].toFixed(1)) : null,
    ps:            m["psTTM"] ? parseFloat(m["psTTM"].toFixed(1)) : null,
    pb:            m["pbQuarterly"] ? parseFloat(m["pbQuarterly"].toFixed(1)) : null,
    evEbitda:      m["currentEv/freeCashFlowTTM"] ? parseFloat(m["currentEv/freeCashFlowTTM"].toFixed(1)) : null,
    grossMargin:   m["grossMarginTTM"] ? parseFloat((m["grossMarginTTM"]).toFixed(1)) : null,
    operatingMargin: m["operatingMarginTTM"] ? parseFloat((m["operatingMarginTTM"]).toFixed(1)) : null,
    netMargin:     m["netProfitMarginTTM"] ? parseFloat((m["netProfitMarginTTM"]).toFixed(1)) : null,
    roe:           m["roeTTM"] ? parseFloat((m["roeTTM"]*100).toFixed(1)) : null,
    debtEquity:    m["totalDebt/totalEquityQuarterly"] ? parseFloat(m["totalDebt/totalEquityQuarterly"].toFixed(2)) : null,
    currentRatio:  m["currentRatioQuarterly"] ? parseFloat(m["currentRatioQuarterly"].toFixed(2)) : null,
    beta:          m["beta"] ? parseFloat(m["beta"].toFixed(2)) : null,
    shortInterest: m["shortInterest"] || null,
    // Growth rates
    revenueCAGR1,
    revenueCAGR3,
    revenueCAGR5,
    epsCAGR3,
    // Revenue trend for chart
    revenueTrend: revenues.map((v,i) => ({ year: `FY${annuals[i]?.year||i}`, value: v ? parseFloat((v/1e9).toFixed(2)) : 0 })).filter(x=>x.value),
    // News
    headlines,
  };
}

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; }

// ── GPT ANALYSIS PROMPT ───────────────────────────────────────────────────────
function buildPrompt(stocksData) {
  const dataStr = stocksData.map(s => `
TICKER: ${s.ticker} | ${s.companyName} | ${s.sector}
LIVE PRICE: $${s.currentPrice} (${s.changePct > 0 ? "+" : ""}${s.changePct}% today)
52W: $${s.low52} - $${s.high52}
MARKET CAP: ${s.marketCap}
VALUATION: P/E=${s.pe} | P/S=${s.ps} | P/B=${s.pb}
MARGINS: Gross=${s.grossMargin}% | Operating=${s.operatingMargin}% | Net=${s.netMargin}%
GROWTH (Revenue): 1Y=${s.revenueCAGR1}% | 3Y CAGR=${s.revenueCAGR3}% | 5Y CAGR=${s.revenueCAGR5}%
EPS 3Y CAGR: ${s.epsCAGR3}%
ROE: ${s.roe}% | D/E: ${s.debtEquity} | Current Ratio: ${s.currentRatio}
BETA: ${s.beta}
RECENT HEADLINES: ${s.headlines.slice(0,5).map(h=>h.headline).join(" | ")}
`).join("\n---\n");

  return `You are a senior institutional portfolio manager making REAL investment decisions today.

You have been given LIVE market data for ${stocksData.length} stock(s). Analyze them and return ONLY raw JSON.

LIVE DATA:
${dataStr}

Return this exact JSON structure (no markdown, no backticks, starts with {, ends with }):
{"stocks":[{"ticker":"","investmentRank":1,"rankReason":"One sentence why this rank","verdict":"Strong Buy","verdictColor":"green","overallScore":0,"analystTarget":0,"analystUpside":0,"analystRating":"","thesisLong":"","thesisShort":"","moat":"","insiderSentiment":"Mixed","recentInsiderActivity":[{"name":"","role":"","type":"SELL","shares":0,"value":"","date":""}],"institutionalMoves":[{"fund":"","action":"ADDED","change":"","period":""}],"keyPartnerships":["","",""],"recentCatalysts":["","",""],"riskFactors":["","",""],"sentimentSummary":"2-3 sentence summary of current market sentiment, Reddit chatter, analyst chatter, social media buzz for this stock","redditSentiment":"Bullish|Bearish|Mixed","newsSentiment":"Bullish|Bearish|Mixed","radarScores":{"fundamentals":0,"momentum":0,"partnerships":0,"insiderSignal":0,"cashStrength":0,"analystConviction":0,"optionsFlow":0,"riskReward":0},"optionsBias":"","optionsPlay":"","optionsStrategy":"","optionsDTE":90,"optionsStrike":"","optionsPriceTarget":0,"optionsStopLoss":0,"optionsIV":"","optionsIVPct":0,"optionsRR":"","optionsAlt":""}],"comparison":{"rankedSummary":"Paragraph explaining the full ranking from best to worst investment and exactly why — be direct and specific","winner":"","winnerReason":"","sectorNote":""}}

Rules:
- investmentRank: 1=best. Rank ALL stocks 1 through N. No ties.
- verdictColor: green=strong buy, gold=hold, red=avoid/short, blue=speculative
- insiderSentiment/redditSentiment/newsSentiment: Bullish|Bearish|Mixed|Neutral
- type: BUY|SELL. action: ADDED|REDUCED|INITIATED|EXITED
- radarScores: integers 0-100. overallScore: integer 0-100
- Use the LIVE DATA provided — do not use outdated knowledge for price/valuation
- Be opinionated and direct. Investors need clear guidance, not hedging.
- ONLY JSON. No other text.`;
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function Pill({text, color}) {
  const c = color||C.dim;
  return <span style={{background:c+"20",border:"1px solid "+c+"50",color:c,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{text}</span>;
}
function Card({children, style, glow}) {
  return <div style={{background:C.card,border:"1px solid "+(glow?glow+"44":C.border),borderRadius:10,padding:16,...(style||{})}}>{children}</div>;
}
function Hd({title, color}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
      <div style={{width:3,height:14,background:color||C.blue,borderRadius:2}}/>
      <span style={{color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em"}}>{title}</span>
    </div>
  );
}
function Row({label, val, color, sub}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"6px 0",borderBottom:"1px solid "+C.faint}}>
      <span style={{color:C.dim,fontSize:12}}>{label}</span>
      <div style={{textAlign:"right"}}>
        <span style={{color:color||C.text,fontSize:12,fontWeight:600}}>{val!=null?val:"—"}</span>
        {sub && <span style={{color:C.dim,fontSize:10,marginLeft:4}}>{sub}</span>}
      </div>
    </div>
  );
}
function GrowthRow({label, v1, v3, v5}) {
  const color = (v) => v==null?"—": v>20?C.green:v>0?C.gold:C.red;
  return (
    <div style={{padding:"8px 0",borderBottom:"1px solid "+C.faint}}>
      <p style={{color:C.dim,fontSize:11,margin:"0 0 5px"}}>{label}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {[["1Y",v1],["3Y CAGR",v3],["5Y CAGR",v5]].map(([l,v])=>(
          <div key={l} style={{background:C.surface,borderRadius:6,padding:"5px 8px",textAlign:"center"}}>
            <p style={{color:C.dim,fontSize:9,margin:"0 0 2px",textTransform:"uppercase"}}>{l}</p>
            <p style={{color:color(v),fontSize:13,fontWeight:700,margin:0}}>{v!=null?fmtPct(v):"—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function Radar8({scores, color}) {
  if (!scores) return null;
  const data = Object.entries(scores).map(([k,v])=>({
    axis:k.replace(/([A-Z])/g," $1").replace(/^./,s=>s.toUpperCase()), value:v
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data} margin={{top:8,right:20,bottom:8,left:20}}>
        <PolarGrid stroke={C.faint}/>
        <PolarAngleAxis dataKey="axis" tick={{fill:C.dim,fontSize:9}}/>
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2}/>
      </RadarChart>
    </ResponsiveContainer>
  );
}
const vc = (c) => ({green:C.green,gold:C.gold,red:C.red,blue:C.blue}[c]||C.blue);

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput]       = useState("");
  const [tickers, setTickers]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loadStep, setLoadStep] = useState("");
  const [liveData, setLiveData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError]       = useState("");
  const [si, setSi]             = useState(0);
  const [tab, setTab]           = useState("overview");

  function addTicker() {
    const t = input.trim().toUpperCase().replace(/[^A-Z.]/g,"");
    if (t && !tickers.includes(t) && tickers.length < 5) { setTickers(p=>[...p,t]); setInput(""); }
  }

  const run = useCallback(async () => {
    if (!tickers.length) return;
    setLoading(true); setError(""); setLiveData(null); setAnalysis(null); setSi(0); setTab("overview");
    try {
      if (!FINNHUB_KEY) throw new Error("Add VITE_FINNHUB_KEY to Vercel environment variables (free at finnhub.io)");
      if (!OPENAI_KEY)  throw new Error("Add VITE_OPENAI_API_KEY to Vercel environment variables");

      // Step 1: fetch live data for all tickers in parallel
      setLoadStep("Fetching live market data…");
      const stocksData = await Promise.all(tickers.map(loadTickerData));
      setLiveData(stocksData);

      // Step 2: send to GPT with live data embedded in prompt
      setLoadStep("Running AI institutional analysis…");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{"content-type":"application/json","Authorization":"Bearer "+OPENAI_KEY},
        body: JSON.stringify({
          model:"gpt-4o",
          max_tokens:4000,
          messages:[
            {role:"system", content:"You are a senior institutional portfolio manager. Return ONLY raw JSON. No markdown. No backticks. Start with { end with }."},
            {role:"user", content: buildPrompt(stocksData)}
          ]
        })
      });
      const raw = await res.json();
      if (raw.error) throw new Error(raw.error.message||JSON.stringify(raw.error));
      const text = (raw.choices?.[0]?.message?.content||"").trim();
      const a=text.indexOf("{"), b=text.lastIndexOf("}");
      if (a===-1||b===-1) throw new Error("No JSON in response: "+text.slice(0,100));
      const cleaned = text.slice(a,b+1)
        .replace(/:\s*"N\/A"/g,": null").replace(/:\s*"n\/a"/g,": null")
        .replace(/:\s*"—"/g,": null").replace(/:\s*"-"/g,": null");
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.stocks)||!parsed.stocks.length) throw new Error("Bad response shape");

      // Merge live data into analysis results
      parsed.stocks = parsed.stocks.map(s => {
        const live = stocksData.find(d=>d.ticker===s.ticker)||{};
        return {...live, ...s, currentPrice:live.currentPrice, changePct:live.changePct, change:live.change};
      });

      setAnalysis(parsed);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setLoadStep(""); }
  }, [tickers]);

  const stocks = analysis?.stocks || [];
  const cmp    = analysis?.comparison;
  const ranked = [...stocks].sort((a,b)=>(a.investmentRank||99)-(b.investmentRank||99));
  const s      = stocks[si];
  const col    = COLORS[si%5];
  const tabs   = [{id:"overview",label:"Overview"},{id:"financials",label:"Financials"},{id:"growth",label:"Growth"},{id:"sentiment",label:"Sentiment"},{id:"insider",label:"Insider/Inst"},{id:"options",label:"Options"},...(stocks.length>1?[{id:"compare",label:"Rankings"}]:[])];

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,paddingBottom:80}}>
      {/* Header */}
      <div style={{background:C.surface,borderBottom:"1px solid "+C.border,padding:"16px 18px 14px"}}>
        <p style={{color:C.dim,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",margin:"0 0 2px"}}>◈ ANALYST TERMINAL</p>
        <h1 style={{fontSize:20,fontWeight:900,margin:"0 0 2px",background:"linear-gradient(90deg,#38bdf8,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
          Stock Research Terminal
        </h1>
        <p style={{color:C.dim,fontSize:11,margin:0}}>Live data · AI analysis · Options signals · Up to 5 tickers</p>
      </div>

      <div style={{padding:"14px 16px 0"}}>
        <Card style={{marginBottom:14}}>
          <Hd title="Enter Tickers (up to 5)"/>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {tickers.length===0&&<span style={{color:C.dim,fontSize:12}}>No tickers yet</span>}
            {tickers.map((t,i)=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:5,background:COLORS[i]+"20",border:"1px solid "+COLORS[i]+"50",borderRadius:6,padding:"4px 10px"}}>
                <span style={{color:COLORS[i],fontWeight:700,fontSize:13}}>{t}</span>
                <button onClick={()=>setTickers(p=>p.filter(x=>x!==t))} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:0}}>×</button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTicker()}
              placeholder={tickers.length>=5?"Max 5":"AAPL, NVDA, PLTR…"} disabled={tickers.length>=5}
              style={{flex:1,background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={addTicker} style={{background:C.muted,border:"1px solid "+C.border,color:C.text,borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Add</button>
            <button onClick={run} disabled={!tickers.length||loading}
              style={{background:tickers.length&&!loading?"linear-gradient(135deg,#38bdf8,#a78bfa)":"#1e293b",border:"none",color:tickers.length&&!loading?"#000":C.dim,borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:tickers.length&&!loading?"pointer":"not-allowed"}}>
              {loading?"…":"Run Analysis"}
            </button>
          </div>
        </Card>

        {loading && (
          <div style={{textAlign:"center",padding:40}}>
            <div style={{width:36,height:36,border:"3px solid "+C.faint,borderTop:"3px solid "+C.blue,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
            <p style={{color:C.blue,fontSize:13,fontWeight:600}}>{loadStep}</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {error && <Card glow={C.red} style={{marginBottom:14}}><p style={{color:C.red,fontSize:12,margin:0,wordBreak:"break-all"}}>⚠ {error}</p></Card>}

        {stocks.length>0&&!loading&&(
          <div>
            {/* RANKING BANNER — always visible when 2+ stocks */}
            {stocks.length>1&&cmp&&(
              <Card glow={C.green} style={{marginBottom:14}}>
                <Hd title="Investment Ranking" color={C.green}/>
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  {ranked.map((st,i)=>(
                    <div key={st.ticker} style={{display:"flex",alignItems:"center",gap:6,background:COLORS[stocks.indexOf(st)]+"15",border:"1px solid "+COLORS[stocks.indexOf(st)]+"40",borderRadius:8,padding:"6px 12px"}}>
                      <span style={{color:C.dim,fontSize:16,fontWeight:900}}>#{i+1}</span>
                      <div>
                        <p style={{color:COLORS[stocks.indexOf(st)],fontWeight:800,fontSize:14,margin:0}}>{st.ticker}</p>
                        <p style={{color:vc(st.verdictColor),fontSize:10,margin:0}}>{st.verdict}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{color:C.text,fontSize:13,lineHeight:1.65,margin:0}}>{cmp.rankedSummary}</p>
              </Card>
            )}

            {/* Stock selector */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              {stocks.map((st,i)=>(
                <button key={st.ticker} onClick={()=>{setSi(i);setTab("overview");}}
                  style={{background:si===i?COLORS[i]+"20":"transparent",border:"1px solid "+(si===i?COLORS[i]:C.border),color:si===i?COLORS[i]:C.dim,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {st.ticker}
                  {st.investmentRank&&<span style={{fontSize:9,marginLeft:4,opacity:0.7}}>#{st.investmentRank}</span>}
                </button>
              ))}
            </div>

            {/* Live price header */}
            {s&&(
              <div style={{background:C.card,border:"1px solid "+col+"44",borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
                      <span style={{fontSize:24,fontWeight:900,color:col}}>{s.ticker}</span>
                      <span style={{color:C.dim,fontSize:13}}>{s.companyName}</span>
                      {s.sector&&<Pill text={s.sector} color={C.purple}/>}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"baseline",flexWrap:"wrap"}}>
                      <span style={{fontSize:28,fontWeight:900,color:C.text}}>${s.currentPrice?.toFixed(2)}</span>
                      <span style={{fontSize:14,fontWeight:700,color:s.changePct>=0?C.green:C.red}}>
                        {s.changePct>=0?"+":""}{s.changePct?.toFixed(2)}% today
                      </span>
                      <span style={{color:C.dim,fontSize:11}}>52W: ${s.low52} – ${s.high52}</span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                      <Pill text={"Cap: "+s.marketCap} color={C.blue}/>
                      <Pill text={"Target: $"+(s.analystTarget||"—")} color={C.green}/>
                      <Pill text={(s.analystUpside>0?"+":"")+(s.analystUpside||0).toFixed(1)+"% upside"} color={s.analystUpside>15?C.green:s.analystUpside>0?C.gold:C.red}/>
                      <Pill text={s.analystRating||"—"} color={C.dim}/>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:34,fontWeight:900,color:s.overallScore>=70?C.green:s.overallScore>=50?C.gold:C.red,lineHeight:1}}>{s.overallScore}</div>
                    <p style={{color:C.dim,fontSize:10,margin:"2px 0 4px"}}>AI Score</p>
                    <Pill text={s.verdict||"—"} color={vc(s.verdictColor)}/>
                    {s.investmentRank&&<p style={{color:C.gold,fontSize:11,fontWeight:700,margin:"6px 0 0"}}>Rank #{s.investmentRank} of {stocks.length}</p>}
                  </div>
                </div>
                {s.rankReason&&<p style={{color:C.gold,fontSize:12,marginTop:10,paddingTop:10,borderTop:"1px solid "+C.faint,lineHeight:1.5}}><span style={{fontWeight:700}}>Why this rank: </span>{s.rankReason}</p>}
              </div>
            )}

            {/* Section tabs */}
            <div style={{display:"flex",gap:2,background:C.card,borderRadius:8,padding:4,marginBottom:14,border:"1px solid "+C.border,overflowX:"auto"}}>
              {tabs.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{flex:"0 0 auto",padding:"7px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",background:tab===t.id?C.muted:"transparent",color:tab===t.id?C.text:C.dim}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* OVERVIEW */}
            {tab==="overview"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Card glow={C.green}><Hd title="Bull Thesis" color={C.green}/><p style={{color:C.text,fontSize:12,lineHeight:1.65,margin:0}}>{s.thesisLong}</p></Card>
                  <Card glow={C.red}><Hd title="Bear Thesis" color={C.red}/><p style={{color:C.text,fontSize:12,lineHeight:1.65,margin:0}}>{s.thesisShort}</p></Card>
                </div>
                <Card><Hd title="Scorecard" color={col}/><Radar8 scores={s.radarScores} color={col}/></Card>
                <Card>
                  <Hd title="Catalysts & Risks"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <p style={{color:C.green,fontSize:10,fontWeight:700,margin:"0 0 6px"}}>CATALYSTS</p>
                      {(s.recentCatalysts||[]).map((c,i)=><p key={i} style={{color:C.text,fontSize:12,margin:"3px 0",lineHeight:1.5}}><span style={{color:C.green}}>→ </span>{c}</p>)}
                    </div>
                    <div>
                      <p style={{color:C.red,fontSize:10,fontWeight:700,margin:"0 0 6px"}}>RISKS</p>
                      {(s.riskFactors||[]).map((r,i)=><p key={i} style={{color:C.text,fontSize:12,margin:"3px 0",lineHeight:1.5}}><span style={{color:C.red}}>⚠ </span>{r}</p>)}
                    </div>
                  </div>
                  {s.moat&&<p style={{color:C.dim,fontSize:11,marginTop:10,paddingTop:10,borderTop:"1px solid "+C.faint}}><span style={{color:C.gold,fontWeight:700}}>MOAT: </span>{s.moat}</p>}
                </Card>
                {s.keyPartnerships?.length>0&&<Card><Hd title="Key Partnerships" color={C.purple}/><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{s.keyPartnerships.map((p,i)=><Pill key={i} text={p} color={C.purple}/>)}</div></Card>}
              </div>
            )}

            {/* FINANCIALS */}
            {tab==="financials"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Card>
                    <Hd title="Valuation Multiples" color={C.purple}/>
                    <Row label="P/E (TTM)" val={s.pe}/>
                    <Row label="P/S (TTM)" val={s.ps}/>
                    <Row label="P/B" val={s.pb}/>
                    <Row label="EV/FCF" val={s.evEbitda}/>
                    <Row label="Beta" val={s.beta}/>
                  </Card>
                  <Card>
                    <Hd title="Profitability" color={C.green}/>
                    <Row label="Gross Margin" val={s.grossMargin!=null?s.grossMargin+"%":null} color={s.grossMargin>50?C.green:s.grossMargin>20?C.gold:C.red}/>
                    <Row label="Operating Margin" val={s.operatingMargin!=null?s.operatingMargin+"%":null} color={s.operatingMargin>15?C.green:s.operatingMargin>0?C.gold:C.red}/>
                    <Row label="Net Margin" val={s.netMargin!=null?s.netMargin+"%":null} color={s.netMargin>10?C.green:s.netMargin>0?C.gold:C.red}/>
                    <Row label="ROE" val={s.roe!=null?s.roe+"%":null} color={s.roe>15?C.green:s.roe>0?C.gold:C.red}/>
                  </Card>
                </div>
                <Card>
                  <Hd title="Balance Sheet Health" color={C.blue}/>
                  <Row label="Debt / Equity" val={s.debtEquity} color={s.debtEquity<1?C.green:s.debtEquity<3?C.gold:C.red}/>
                  <Row label="Current Ratio" val={s.currentRatio} color={s.currentRatio>1.5?C.green:s.currentRatio>1?C.gold:C.red}/>
                  <Row label="Market Cap" val={s.marketCap}/>
                </Card>
                {s.revenueTrend?.length>0&&(
                  <Card>
                    <Hd title="Revenue Trend ($B)" color={C.blue}/>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={s.revenueTrend} margin={{top:5,right:10,bottom:5,left:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.faint}/>
                        <XAxis dataKey="year" tick={{fill:C.dim,fontSize:10}}/>
                        <YAxis tick={{fill:C.dim,fontSize:10}} tickFormatter={v=>"$"+v+"B"}/>
                        <Tooltip contentStyle={{background:C.card,border:"1px solid "+C.border,fontSize:11}} formatter={v=>["$"+v+"B","Revenue"]}/>
                        <Bar dataKey="value" fill={col} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}

            {/* GROWTH */}
            {tab==="growth"&&s&&(
              <Card>
                <Hd title="Historical Growth Rates" color={C.green}/>
                <GrowthRow label="Revenue Growth" v1={s.revenueCAGR1} v3={s.revenueCAGR3} v5={s.revenueCAGR5}/>
                <GrowthRow label="EPS Growth" v1={null} v3={s.epsCAGR3} v5={null}/>
                <p style={{color:C.dim,fontSize:11,marginTop:12,lineHeight:1.5}}>
                  CAGR = Compound Annual Growth Rate. 1Y = last 12 months YoY. 3Y/5Y computed from annual financials via Finnhub. Blank = insufficient history.
                </p>
              </Card>
            )}

            {/* SENTIMENT */}
            {tab==="sentiment"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <Card>
                  <Hd title="Market Sentiment Summary" color={C.gold}/>
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:C.dim,fontSize:11}}>Reddit:</span>
                      <Pill text={s.redditSentiment||"—"} color={s.redditSentiment==="Bullish"?C.green:s.redditSentiment==="Bearish"?C.red:C.gold}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:C.dim,fontSize:11}}>News:</span>
                      <Pill text={s.newsSentiment||"—"} color={s.newsSentiment==="Bullish"?C.green:s.newsSentiment==="Bearish"?C.red:C.gold}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:C.dim,fontSize:11}}>Insider:</span>
                      <Pill text={s.insiderSentiment||"—"} color={s.insiderSentiment==="Bullish"?C.green:s.insiderSentiment==="Bearish"?C.red:C.gold}/>
                    </div>
                  </div>
                  <p style={{color:C.text,fontSize:13,lineHeight:1.65,margin:0}}>{s.sentimentSummary}</p>
                </Card>
                <Card>
                  <Hd title="Recent Headlines" color={C.blue}/>
                  {(s.headlines||[]).length===0&&<p style={{color:C.dim,fontSize:12}}>No recent headlines found</p>}
                  {(s.headlines||[]).map((h,i)=>(
                    <div key={i} style={{padding:"10px 0",borderBottom:"1px solid "+C.faint}}>
                      <a href={h.url} target="_blank" rel="noreferrer" style={{color:C.text,fontSize:12,fontWeight:600,textDecoration:"none",lineHeight:1.4,display:"block",marginBottom:3}}>
                        {h.headline}
                      </a>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{color:C.dim,fontSize:10}}>{h.source}</span>
                        {h.sentiment!=null&&<Pill text={h.sentiment>0?"Positive":h.sentiment<0?"Negative":"Neutral"} color={h.sentiment>0?C.green:h.sentiment<0?C.red:C.gold}/>}
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* INSIDER */}
            {tab==="insider"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <Card>
                  <Hd title="Insider Transactions" color={C.gold}/>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{color:C.dim,fontSize:11}}>Sentiment:</span>
                    <Pill text={s.insiderSentiment||"—"} color={s.insiderSentiment==="Bullish"?C.green:s.insiderSentiment==="Bearish"?C.red:C.gold}/>
                  </div>
                  {(s.recentInsiderActivity||[]).map((r,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 0",borderBottom:"1px solid "+C.faint,alignItems:"center"}}>
                      <div><p style={{color:C.text,fontSize:12,fontWeight:600,margin:0}}>{r.name}</p><p style={{color:C.dim,fontSize:10,margin:0}}>{r.role}</p></div>
                      <Pill text={r.type} color={r.type==="BUY"?C.green:C.red}/>
                      <div style={{textAlign:"right"}}><p style={{color:C.text,fontSize:12,margin:0}}>{r.value}</p><p style={{color:C.dim,fontSize:10,margin:0}}>{r.date}</p></div>
                    </div>
                  ))}
                </Card>
                <Card>
                  <Hd title="Institutional Moves" color={C.blue}/>
                  {(s.institutionalMoves||[]).map((r,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,padding:"8px 0",borderBottom:"1px solid "+C.faint,alignItems:"center"}}>
                      <span style={{color:C.text,fontSize:12,fontWeight:600}}>{r.fund}</span>
                      <Pill text={r.action} color={r.action==="ADDED"||r.action==="INITIATED"?C.green:r.action==="EXITED"?C.red:C.gold}/>
                      <div style={{textAlign:"right"}}><p style={{color:C.text,fontSize:12,margin:0}}>{r.change}</p><p style={{color:C.dim,fontSize:10,margin:0}}>{r.period}</p></div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* OPTIONS */}
            {tab==="options"&&s&&(
              <Card glow={s.optionsBias&&s.optionsBias.toLowerCase().includes("bull")?C.green:s.optionsBias&&s.optionsBias.toLowerCase().includes("bear")?C.red:C.gold}>
                <Hd title="Options Strategy" color={C.purple}/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  <Pill text={s.optionsBias||"—"} color={C.gold}/>
                  <Pill text={s.optionsPlay||"—"} color={s.optionsPlay&&(s.optionsPlay.includes("CALL")||s.optionsPlay.includes("LONG"))?C.green:C.red}/>
                  <Pill text={"IV: "+(s.optionsIV||"—")} color={C.purple}/>
                  <Pill text={"IV%ile: "+(s.optionsIVPct!=null?s.optionsIVPct:"—")} color={C.purple}/>
                </div>
                <p style={{color:C.text,fontSize:13,lineHeight:1.65,margin:"0 0 14px"}}>{s.optionsStrategy}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["DTE",s.optionsDTE+" days",C.blue],["Strike",s.optionsStrike,C.purple],["Target","$"+s.optionsPriceTarget,C.green],["Stop","$"+s.optionsStopLoss,C.red],["R/R",s.optionsRR,C.gold]].map(([l,v,c])=>(
                    <div key={l} style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                      <p style={{color:C.dim,fontSize:10,margin:"0 0 2px",textTransform:"uppercase"}}>{l}</p>
                      <p style={{color:c,fontSize:13,fontWeight:700,margin:0}}>{v||"—"}</p>
                    </div>
                  ))}
                </div>
                {s.optionsAlt&&<p style={{color:C.dim,fontSize:12,marginTop:10,lineHeight:1.5}}><span style={{color:C.gold}}>Alt: </span>{s.optionsAlt}</p>}
              </Card>
            )}

            {/* RANKINGS COMPARE */}
            {tab==="compare"&&stocks.length>1&&(
              <div style={{display:"grid",gap:12}}>
                {cmp&&(
                  <Card glow={C.green}>
                    <Hd title="Full Investment Verdict" color={C.green}/>
                    <p style={{color:C.text,fontSize:13,lineHeight:1.7,margin:0}}>{cmp.rankedSummary}</p>
                    {cmp.sectorNote&&<p style={{color:C.dim,fontSize:12,marginTop:10,lineHeight:1.5}}>{cmp.sectorNote}</p>}
                  </Card>
                )}
                <Card>
                  <Hd title="Ranked 1 to "+stocks.length+" — Best to Worst Investment"/>
                  {ranked.map((st,i)=>{
                    const idx=stocks.indexOf(st);
                    return (
                      <div key={st.ticker} style={{display:"flex",alignItems:"center",gap:12,background:C.surface,borderRadius:8,padding:"12px 14px",marginBottom:8,border:"1px solid "+COLORS[idx]+"33"}}>
                        <span style={{color:i===0?C.gold:C.dim,fontSize:22,fontWeight:900,width:28}}>#{i+1}</span>
                        <span style={{color:COLORS[idx],fontWeight:900,fontSize:16,width:60}}>{st.ticker}</span>
                        <div style={{flex:1}}>
                          <p style={{color:C.text,fontSize:12,fontWeight:600,margin:"0 0 2px"}}>{st.companyName}</p>
                          <p style={{color:C.dim,fontSize:11,margin:"0 0 4px"}}>{st.rankReason}</p>
                          <Pill text={st.verdict||"—"} color={vc(st.verdictColor)}/>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <p style={{color:st.overallScore>=70?C.green:st.overallScore>=50?C.gold:C.red,fontSize:22,fontWeight:900,margin:0}}>{st.overallScore}</p>
                          <p style={{color:st.changePct>=0?C.green:C.red,fontSize:11,margin:0}}>{st.changePct>=0?"+":""}{st.changePct?.toFixed(2)}% today</p>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            )}
          </div>
        )}

        {!loading&&!analysis&&!error&&(
          <div style={{textAlign:"center",padding:"50px 20px"}}>
            <p style={{color:C.dim,fontSize:28,margin:"0 0 8px"}}>◈</p>
            <p style={{color:C.dim,fontSize:14,margin:"0 0 4px"}}>Add tickers and hit Run Analysis</p>
            <p style={{color:C.faint,fontSize:12,margin:0}}>Try: NVDA · PLTR · AAPL · ACHR · SNOW</p>
          </div>
        )}

        {analysis&&!loading&&<p style={{color:C.faint,fontSize:10,marginTop:20,textAlign:"center"}}>⚠ AI + live data analysis. Not financial advice. Verify independently.</p>}
      </div>
    </div>
  );
}
