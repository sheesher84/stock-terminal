import { useState, useCallback } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

const C = {
  bg:"#07090f", surface:"#0d1117", card:"#111827", border:"#1a2332",
  muted:"#1e2d3d", text:"#e2e8f0", dim:"#64748b", faint:"#1e293b",
  green:"#22d3a0", red:"#f43f5e", gold:"#fbbf24", blue:"#38bdf8", purple:"#a78bfa",
};
const COLORS = ["#38bdf8","#22d3a0","#f43f5e","#a78bfa","#fbbf24"];

const PROMPT = `You are a senior institutional equity analyst. OUTPUT ONLY RAW JSON. No markdown, no backticks, no commentary. First char must be { last char must be }.

Return this exact structure:
{"stocks":[{"ticker":"","companyName":"","sector":"","currentPrice":0,"marketCap":"","analystTarget":0,"analystUpside":0,"analystRating":"","revenue":"","revenueGrowth":0,"netIncome":"","cashPosition":"","debtLevel":"","burnRate":"","pe":0,"ps":0,"grossMargin":0,"operatingMargin":0,"freeCashFlow":"","beta":0,"shortFloat":0,"institutionalOwnership":0,"insiderSentiment":"Mixed","recentInsiderActivity":[{"name":"","role":"","type":"SELL","shares":0,"value":"","date":""}],"institutionalMoves":[{"fund":"","action":"ADDED","change":"","period":""}],"keyPartnerships":["","",""],"recentCatalysts":["","",""],"riskFactors":["","",""],"moat":"","radarScores":{"fundamentals":0,"momentum":0,"partnerships":0,"insiderSignal":0,"cashStrength":0,"analystConviction":0,"optionsFlow":0,"riskReward":0},"overallScore":0,"verdict":"","verdictColor":"gold","thesisLong":"","thesisShort":"","optionsBias":"","optionsPlay":"","optionsStrategy":"","optionsDTE":90,"optionsStrike":"","optionsPriceTarget":0,"optionsStopLoss":0,"optionsIV":"","optionsIVPct":0,"optionsRR":"","optionsAlt":""}],"comparison":{"winner":"","winnerReason":"","sectorNote":""}}

Rules: verdictColor=green|gold|red|blue. insiderSentiment=Bullish|Bearish|Mixed|Neutral. type=BUY|SELL. action=ADDED|REDUCED|INITIATED|EXITED. radarScores=integers 0-100. Strings under 200 chars. ONLY JSON.`;

const vc = (c) => ({green:C.green,gold:C.gold,red:C.red,blue:C.blue}[c]||C.blue);

function Pill({text,color}) {
  const cl = color||C.dim;
  return <span style={{background:cl+"20",border:"1px solid "+cl+"50",color:cl,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{text}</span>;
}
function Card({children,style,glow}) {
  return <div style={{background:C.card,border:"1px solid "+(glow?glow+"44":C.border),borderRadius:10,padding:16,...(style||{})}}>{children}</div>;
}
function Hd({title,color}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
      <div style={{width:3,height:14,background:color||C.blue,borderRadius:2}}/>
      <span style={{color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em"}}>{title}</span>
    </div>
  );
}
function Row({label,val,color}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+C.faint}}>
      <span style={{color:C.dim,fontSize:12}}>{label}</span>
      <span style={{color:color||C.text,fontSize:12,fontWeight:600}}>{val!=null?val:"—"}</span>
    </div>
  );
}
function Radar8({scores,color}) {
  if (!scores) return null;
  const data = Object.entries(scores).map(([k,v]) => ({
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

export default function App() {
  // API key comes from Vercel environment variable — users never see or enter it
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
  const [input, setInput]     = useState("");
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState("");
  const [si, setSi]           = useState(0);
  const [tab, setTab]         = useState("overview");

  function addTicker() {
    const t = input.trim().toUpperCase().replace(/[^A-Z.]/g,"");
    if (t && !tickers.includes(t) && tickers.length < 5) { setTickers(p=>[...p,t]); setInput(""); }
  }

  const run = useCallback(async () => {
    if (!tickers.length || !apiKey) return;
    setLoading(true); setError(""); setData(null); setSi(0); setTab("overview");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "Authorization":"Bearer "+apiKey
        },
        body: JSON.stringify({
          model:"gpt-4o-mini",
          max_tokens:4000,
          messages:[
            {role:"system", content:PROMPT},
            {role:"user", content:"Analyze: "+tickers.join(", ")}
          ]
        })
      });
      const raw = await res.json();
      if (!apiKey) throw new Error("API key not configured — add VITE_OPENAI_API_KEY in Vercel environment variables");
      if (raw.error) throw new Error(raw.error?.message||JSON.stringify(raw.error));
      const text = (raw.choices?.[0]?.message?.content||"").trim();
      if (!text) throw new Error("Empty response");
      const a=text.indexOf("{"), b=text.lastIndexOf("}");
      if (a===-1||b===-1) throw new Error("No JSON found. Response: "+text.slice(0,100));
      const parsed = JSON.parse(text.slice(a,b+1));
      if (!Array.isArray(parsed.stocks)||!parsed.stocks.length) throw new Error("Bad data: "+Object.keys(parsed).join(","));
      setData(parsed);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [tickers, apiKey]);

  const stocks=data?.stocks||[], cmp=data?.comparison, s=stocks[si], col=COLORS[si%5];
  const tabs=[{id:"overview",label:"Overview"},{id:"financials",label:"Financials"},{id:"insider",label:"Insider/Inst"},{id:"options",label:"Options"},...(stocks.length>1?[{id:"compare",label:"Compare"}]:[])];

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,paddingBottom:80}}>
      <div style={{background:C.surface,borderBottom:"1px solid "+C.border,padding:"18px 18px 14px"}}>
        <p style={{color:C.dim,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",margin:"0 0 2px"}}>◈ ANALYST TERMINAL</p>
        <h1 style={{fontSize:20,fontWeight:900,margin:"0 0 2px",background:"linear-gradient(90deg,#38bdf8,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
          Stock Research Terminal
        </h1>
        <p style={{color:C.dim,fontSize:11,margin:"0 0 8px"}}>AI institutional analysis · up to 5 tickers · options signals</p>

      </div>

      <div style={{padding:"14px 16px 0"}}>


        <Card style={{marginBottom:14}}>
          <Hd title="Enter Tickers (up to 5)"/>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {tickers.length===0 && <span style={{color:C.dim,fontSize:12}}>No tickers yet</span>}
            {tickers.map((t,i)=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:5,background:COLORS[i]+"20",border:"1px solid "+COLORS[i]+"50",borderRadius:6,padding:"4px 10px"}}>
                <span style={{color:COLORS[i],fontWeight:700,fontSize:13}}>{t}</span>
                <button onClick={()=>setTickers(p=>p.filter(x=>x!==t))} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:0}}>×</button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTicker()}
              placeholder={tickers.length>=5?"Max 5":"AAPL, NVDA, TSLA…"} disabled={tickers.length>=5}
              style={{flex:1,background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={addTicker} style={{background:C.muted,border:"1px solid "+C.border,color:C.text,borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Add</button>
            <button onClick={run} disabled={!tickers.length||loading}
              style={{background:tickers.length&&!loading?"linear-gradient(135deg,#38bdf8,#a78bfa)":"#1e293b",border:"none",color:tickers.length&&!loading?"#000":C.dim,borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:tickers.length&&!loading?"pointer":"not-allowed"}}>
              {loading?"Analyzing…":"Run Analysis"}
            </button>
          </div>

        </Card>

        {loading && (
          <div style={{textAlign:"center",padding:40}}>
            <div style={{width:36,height:36,border:"3px solid "+C.faint,borderTop:"3px solid "+C.blue,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
            <p style={{color:C.dim,fontSize:13}}>Running institutional analysis…</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {error && <Card glow={C.red} style={{marginBottom:14}}><p style={{color:C.red,fontSize:12,margin:0,wordBreak:"break-all"}}>⚠ {error}</p></Card>}

        {stocks.length>0&&!loading&&(
          <div>
            {stocks.length>1&&(
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                {stocks.map((st,i)=>(
                  <button key={st.ticker} onClick={()=>{setSi(i);setTab("overview");}}
                    style={{background:si===i?COLORS[i]+"20":"transparent",border:"1px solid "+(si===i?COLORS[i]:C.border),color:si===i?COLORS[i]:C.dim,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {st.ticker}
                  </button>
                ))}
                {cmp?.winner&&<span style={{marginLeft:"auto",color:C.green,fontSize:11,fontWeight:700,background:C.green+"15",border:"1px solid "+C.green+"30",borderRadius:6,padding:"4px 10px"}}>Top: {cmp.winner}</span>}
              </div>
            )}

            {s&&(
              <div style={{background:C.card,border:"1px solid "+col+"44",borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
                      <span style={{fontSize:24,fontWeight:900,color:col}}>{s.ticker}</span>
                      <span style={{color:C.dim,fontSize:13}}>{s.companyName}</span>
                      {s.sector&&<Pill text={s.sector} color={C.purple}/>}
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <Pill text={"$"+(s.currentPrice||"—")} color={C.blue}/>
                      <Pill text={"Target $"+(s.analystTarget||"—")} color={C.green}/>
                      <Pill text={(s.analystUpside>0?"+":"")+((s.analystUpside||0).toFixed(1))+"% upside"} color={s.analystUpside>15?C.green:s.analystUpside>0?C.gold:C.red}/>
                      <Pill text={s.analystRating||"—"} color={C.dim}/>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:34,fontWeight:900,color:s.overallScore>=70?C.green:s.overallScore>=50?C.gold:C.red,lineHeight:1}}>{s.overallScore}</div>
                    <div style={{marginTop:4}}><Pill text={s.verdict||"—"} color={vc(s.verdictColor)}/></div>
                  </div>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:2,background:C.card,borderRadius:8,padding:4,marginBottom:14,border:"1px solid "+C.border,overflowX:"auto"}}>
              {tabs.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{flex:"0 0 auto",padding:"7px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",background:tab===t.id?C.muted:"transparent",color:tab===t.id?C.text:C.dim}}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab==="overview"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Card glow={C.green}><Hd title="Bull Thesis" color={C.green}/><p style={{color:C.text,fontSize:12,lineHeight:1.6,margin:0}}>{s.thesisLong}</p></Card>
                  <Card glow={C.red}><Hd title="Bear Thesis" color={C.red}/><p style={{color:C.text,fontSize:12,lineHeight:1.6,margin:0}}>{s.thesisShort}</p></Card>
                </div>
                <Card><Hd title="Scorecard" color={col}/><Radar8 scores={s.radarScores} color={col}/></Card>
                <Card>
                  <Hd title="Catalysts & Risks"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <p style={{color:C.green,fontSize:10,fontWeight:700,margin:"0 0 6px"}}>CATALYSTS</p>
                      {(s.recentCatalysts||[]).map((c,i)=><p key={i} style={{color:C.text,fontSize:12,margin:"3px 0"}}><span style={{color:C.green}}>→ </span>{c}</p>)}
                    </div>
                    <div>
                      <p style={{color:C.red,fontSize:10,fontWeight:700,margin:"0 0 6px"}}>RISKS</p>
                      {(s.riskFactors||[]).map((r,i)=><p key={i} style={{color:C.text,fontSize:12,margin:"3px 0"}}><span style={{color:C.red}}>⚠ </span>{r}</p>)}
                    </div>
                  </div>
                  {s.moat&&<p style={{color:C.dim,fontSize:11,marginTop:10,paddingTop:10,borderTop:"1px solid "+C.faint}}><span style={{color:C.gold,fontWeight:700}}>MOAT: </span>{s.moat}</p>}
                </Card>
                {s.keyPartnerships?.length>0&&<Card><Hd title="Key Partnerships" color={C.purple}/><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{s.keyPartnerships.map((p,i)=><Pill key={i} text={p} color={C.purple}/>)}</div></Card>}
              </div>
            )}

            {tab==="financials"&&s&&(
              <div style={{display:"grid",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Card>
                    <Hd title="Income" color={C.green}/>
                    <Row label="Revenue" val={s.revenue}/>
                    <Row label="Rev Growth" val={s.revenueGrowth!=null?(s.revenueGrowth>0?"+":"")+s.revenueGrowth+"%":null} color={s.revenueGrowth>0?C.green:C.red}/>
                    <Row label="Net Income" val={s.netIncome}/>
                    <Row label="Gross Margin" val={s.grossMargin!=null?s.grossMargin+"%":null}/>
                    <Row label="Op Margin" val={s.operatingMargin!=null?s.operatingMargin+"%":null}/>
                    <Row label="FCF" val={s.freeCashFlow}/>
                  </Card>
                  <Card>
                    <Hd title="Balance Sheet" color={C.blue}/>
                    <Row label="Cash" val={s.cashPosition} color={C.blue}/>
                    <Row label="Debt" val={s.debtLevel}/>
                    <Row label="Burn Rate" val={s.burnRate}/>
                    <Row label="Market Cap" val={s.marketCap}/>
                    <Row label="Beta" val={s.beta}/>
                    <Row label="Short %" val={s.shortFloat!=null?s.shortFloat+"%":null} color={s.shortFloat>20?C.red:s.shortFloat>5?C.gold:C.green}/>
                  </Card>
                </div>
                <Card>
                  <Hd title="Valuation" color={C.purple}/>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[["P/E",s.pe],["P/S",s.ps],["Inst Own",s.institutionalOwnership!=null?s.institutionalOwnership+"%":null]].map(([l,v])=>(
                      <div key={l} style={{background:C.surface,borderRadius:8,padding:"10px",textAlign:"center"}}>
                        <p style={{color:C.dim,fontSize:10,margin:"0 0 3px",textTransform:"uppercase"}}>{l}</p>
                        <p style={{color:C.text,fontSize:18,fontWeight:700,margin:0}}>{v!=null?v:"—"}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

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

            {tab==="options"&&s&&(
              <Card glow={s.optionsBias&&s.optionsBias.toLowerCase().includes("bull")?C.green:s.optionsBias&&s.optionsBias.toLowerCase().includes("bear")?C.red:C.gold}>
                <Hd title="Options Strategy" color={C.purple}/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  <Pill text={s.optionsBias||"—"} color={C.gold}/>
                  <Pill text={s.optionsPlay||"—"} color={s.optionsPlay&&(s.optionsPlay.includes("CALL")||s.optionsPlay.includes("LONG"))?C.green:C.red}/>
                  <Pill text={"IV: "+(s.optionsIV||"—")} color={C.purple}/>
                  <Pill text={"IV%ile: "+(s.optionsIVPct!=null?s.optionsIVPct:"—")} color={C.purple}/>
                </div>
                <p style={{color:C.text,fontSize:13,lineHeight:1.6,margin:"0 0 14px"}}>{s.optionsStrategy}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["DTE",s.optionsDTE+" days",C.blue],["Strike",s.optionsStrike,C.purple],["Target","$"+s.optionsPriceTarget,C.green],["Stop","$"+s.optionsStopLoss,C.red],["R/R",s.optionsRR,C.gold]].map(([l,v,c])=>(
                    <div key={l} style={{background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                      <p style={{color:C.dim,fontSize:10,margin:"0 0 2px",textTransform:"uppercase"}}>{l}</p>
                      <p style={{color:c,fontSize:13,fontWeight:700,margin:0}}>{v||"—"}</p>
                    </div>
                  ))}
                </div>
                {s.optionsAlt&&<p style={{color:C.dim,fontSize:12,marginTop:10}}><span style={{color:C.gold}}>Alt: </span>{s.optionsAlt}</p>}
              </Card>
            )}

            {tab==="compare"&&stocks.length>1&&(
              <div style={{display:"grid",gap:12}}>
                {cmp&&<Card glow={C.green}><Hd title="Verdict" color={C.green}/><p style={{color:C.text,fontSize:13,lineHeight:1.6,margin:"0 0 8px"}}><span style={{color:C.green,fontWeight:700}}>{cmp.winner} wins. </span>{cmp.winnerReason}</p>{cmp.sectorNote&&<p style={{color:C.dim,fontSize:12,margin:0}}>{cmp.sectorNote}</p>}</Card>}
                <Card>
                  <Hd title="Rankings"/>
                  {[...stocks].sort((a,b)=>(b.overallScore||0)-(a.overallScore||0)).map((st,i)=>{
                    const idx=stocks.indexOf(st);
                    return (
                      <div key={st.ticker} style={{display:"flex",alignItems:"center",gap:10,background:C.surface,borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                        <span style={{color:C.dim,fontSize:18,fontWeight:900,width:22}}>#{i+1}</span>
                        <span style={{color:COLORS[idx],fontWeight:800,fontSize:14,width:55}}>{st.ticker}</span>
                        <div style={{flex:1}}><p style={{color:C.text,fontSize:12,margin:0}}>{st.companyName}</p><p style={{color:C.dim,fontSize:10,margin:0}}>{st.verdict}</p></div>
                        <span style={{color:st.overallScore>=70?C.green:st.overallScore>=50?C.gold:C.red,fontSize:20,fontWeight:900}}>{st.overallScore}</span>
                      </div>
                    );
                  })}
                </Card>
              </div>
            )}
          </div>
        )}

        {!loading&&!data&&!error&&(
          <div style={{textAlign:"center",padding:"50px 20px"}}>
            <p style={{color:C.dim,fontSize:28,margin:"0 0 8px"}}>◈</p>
            <p style={{color:C.dim,fontSize:14,margin:"0 0 4px"}}>Add tickers and hit Run Analysis</p>
            <p style={{color:C.faint,fontSize:12,margin:0}}>Try: NVDA · PLTR · AAPL · ACHR · JOBY</p>
          </div>
        )}

        {data&&!loading&&<p style={{color:C.faint,fontSize:10,marginTop:20,textAlign:"center"}}>⚠ AI analysis only. Not financial advice. Verify independently.</p>}
      </div>
    </div>
  );
}
