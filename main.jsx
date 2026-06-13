const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY || "";

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; }

async function fetchFinnhub(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://finnhub.io/api/v1${path}${sep}token=${FINNHUB_KEY}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${text.slice(0,180)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Finnhub returned non-JSON: ${text.slice(0,180)}`); }
}

function calcCAGR(values) {
  const clean = values.map(Number).filter(v => Number.isFinite(v) && v !== 0);
  if (clean.length < 2) return null;
  const first = Math.abs(clean[0]);
  const last = Math.abs(clean[clean.length-1]);
  if (!first || !last) return null;
  const n = clean.length - 1;
  const cagr = (Math.pow(last / first, 1/n) - 1) * 100;
  return Number.isFinite(cagr) ? parseFloat(cagr.toFixed(1)) : null;
}

function fmt$(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  n = Number(n);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs/1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + "$" + (abs/1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + "$" + (abs/1e6).toFixed(1) + "M";
  return sign + "$" + abs.toFixed(2);
}

function num(v, decimals = 1, multiplier = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return parseFloat((n * multiplier).toFixed(decimals));
}

function readConcept(report, concepts) {
  const items = report?.report?.ic || [];
  for (const concept of concepts) {
    const found = items.find(x => x.concept === concept);
    if (found && found.value != null) return Number(found.value);
  }
  return null;
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
  const annuals = (income.data || []).slice(0, 6).reverse();
  const revenues = annuals.map(r => readConcept(r, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]));
  const netIncomes = annuals.map(r => readConcept(r, ["NetIncomeLoss", "ProfitLoss"]));

  const current = Number(quote.c);
  const previous = Number(quote.pc);
  const change = Number.isFinite(current) && Number.isFinite(previous) ? parseFloat((current - previous).toFixed(2)) : null;
  const changePct = Number.isFinite(current) && Number.isFinite(previous) && previous !== 0 ? parseFloat(((current - previous)/previous*100).toFixed(2)) : null;

  const revenueCAGR1 = m["revenueGrowthTTMYoy"] != null ? num(m["revenueGrowthTTMYoy"], 1, 100) : null;
  const revenueCAGR3 = calcCAGR(revenues.slice(-4));
  const revenueCAGR5 = calcCAGR(revenues.slice(-6));
  const epsCAGR3 = calcCAGR([m["epsBasicExclExtraItems3Year"], m["epsBasicExclExtraItemsTTM"]].filter(v => v != null));

  const headlines = (news || [])
    .slice(0, 10)
    .map(n => ({ headline: n.headline, source: n.source, url: n.url, datetime: n.datetime || null }));

  return {
    ticker,
    companyName: profile.name || ticker,
    sector: profile.finnhubIndustry || "—",
    exchange: profile.exchange || "—",
    logo: profile.logo || "",
    currentPrice: Number.isFinite(current) ? current : null,
    change,
    changePct,
    high52: m["52WeekHigh"] || quote.h || null,
    low52: m["52WeekLow"] || quote.l || null,
    marketCap: fmt$(profile.marketCapitalization ? profile.marketCapitalization*1e6 : null),
    marketCapRaw: profile.marketCapitalization ? profile.marketCapitalization*1e6 : null,
    pe: num(m["peBasicExclExtraTTM"]),
    ps: num(m["psTTM"]),
    pb: num(m["pbQuarterly"]),
    evEbitda: num(m["currentEv/freeCashFlowTTM"]),
    grossMargin: num(m["grossMarginTTM"]),
    operatingMargin: num(m["operatingMarginTTM"]),
    netMargin: num(m["netProfitMarginTTM"]),
    roe: num(m["roeTTM"], 1, 100),
    debtEquity: num(m["totalDebt/totalEquityQuarterly"], 2),
    currentRatio: num(m["currentRatioQuarterly"], 2),
    beta: num(m["beta"], 2),
    shortInterest: m["shortInterest"] || null,
    revenueCAGR1,
    revenueCAGR3,
    revenueCAGR5,
    epsCAGR3,
    revenueTrend: revenues.map((v,i) => ({ year: `FY${annuals[i]?.year||i}`, value: v ? parseFloat((v/1e9).toFixed(2)) : 0 })).filter(x=>x.value),
    headlines,
  };
}

function buildPrompt(stocksData) {
  const dataStr = stocksData.map(s => `
TICKER: ${s.ticker} | ${s.companyName} | ${s.sector}
LIVE PRICE: $${s.currentPrice} (${s.changePct > 0 ? "+" : ""}${s.changePct}% today)
52W: $${s.low52} - $${s.high52}
MARKET CAP: ${s.marketCap}
VALUATION: P/E=${s.pe} | P/S=${s.ps} | P/B=${s.pb} | EV/FCF=${s.evEbitda}
MARGINS: Gross=${s.grossMargin}% | Operating=${s.operatingMargin}% | Net=${s.netMargin}%
GROWTH (Revenue): 1Y=${s.revenueCAGR1}% | 3Y CAGR=${s.revenueCAGR3}% | 5Y CAGR=${s.revenueCAGR5}%
EPS 3Y CAGR: ${s.epsCAGR3}%
ROE: ${s.roe}% | D/E: ${s.debtEquity} | Current Ratio: ${s.currentRatio}
BETA: ${s.beta}
RECENT HEADLINES: ${s.headlines.slice(0,8).map(h=>h.headline).join(" | ")}
`).join("\n---\n");

  return `You are a senior institutional portfolio manager making real investment decisions today.

You have been given live market data for ${stocksData.length} stock(s). Analyze them and return ONLY raw JSON.

LIVE DATA:
${dataStr}

Return this exact JSON structure:
{"stocks":[{"ticker":"","investmentRank":1,"rankReason":"One sentence why this rank","verdict":"Strong Buy","verdictColor":"green","overallScore":0,"analystTarget":0,"analystUpside":0,"analystRating":"","thesisLong":"","thesisShort":"","moat":"","insiderSentiment":"Mixed","recentInsiderActivity":[{"name":"","role":"","type":"SELL","shares":0,"value":"","date":""}],"institutionalMoves":[{"fund":"","action":"ADDED","change":"","period":""}],"keyPartnerships":["","",""],"recentCatalysts":["","",""],"riskFactors":["","",""],"sentimentSummary":"2-3 sentence summary of current market/news sentiment and public-market chatter for this stock","redditSentiment":"Bullish|Bearish|Mixed|Neutral","newsSentiment":"Bullish|Bearish|Mixed|Neutral","radarScores":{"fundamentals":0,"momentum":0,"partnerships":0,"insiderSignal":0,"cashStrength":0,"analystConviction":0,"optionsFlow":0,"riskReward":0},"optionsBias":"","optionsPlay":"","optionsStrategy":"","optionsDTE":90,"optionsStrike":"","optionsPriceTarget":0,"optionsStopLoss":0,"optionsIV":"","optionsIVPct":0,"optionsRR":"","optionsAlt":""}],"comparison":{"rankedSummary":"Paragraph explaining full ranking from best to worst investment and exactly why — direct and specific","winner":"","winnerReason":"","sectorNote":""}}

Rules:
- investmentRank: 1=best. Rank ALL stocks 1 through N. No ties.
- verdictColor: green=strong buy, gold=hold, red=avoid/short, blue=speculative.
- insiderSentiment/redditSentiment/newsSentiment: Bullish|Bearish|Mixed|Neutral.
- type: BUY|SELL. action: ADDED|REDUCED|INITIATED|EXITED.
- radarScores and overallScore: integers 0-100.
- Use the LIVE DATA provided for price/valuation; do not use stale remembered prices.
- Be opinionated and direct.
- Use null for unknown numeric values.
- ONLY JSON. No markdown. No backticks.`;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStock(s) {
  return {
    ...s,
    investmentRank: safeNumber(s.investmentRank, 99),
    overallScore: safeNumber(s.overallScore, 0),
    analystTarget: safeNumber(s.analystTarget, 0),
    analystUpside: safeNumber(s.analystUpside, 0),
    optionsPriceTarget: safeNumber(s.optionsPriceTarget, 0),
    optionsStopLoss: safeNumber(s.optionsStopLoss, 0),
    optionsIVPct: safeNumber(s.optionsIVPct, 0),
    optionsDTE: safeNumber(s.optionsDTE, 90),
    radarScores: s.radarScores || {},
    recentInsiderActivity: Array.isArray(s.recentInsiderActivity) ? s.recentInsiderActivity : [],
    institutionalMoves: Array.isArray(s.institutionalMoves) ? s.institutionalMoves : [],
    keyPartnerships: Array.isArray(s.keyPartnerships) ? s.keyPartnerships : [],
    recentCatalysts: Array.isArray(s.recentCatalysts) ? s.recentCatalysts : [],
    riskFactors: Array.isArray(s.riskFactors) ? s.riskFactors : [],
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    if (!OPENAI_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel environment variables" });
    if (!FINNHUB_KEY) return res.status(500).json({ error: "Missing FINNHUB_KEY in Vercel environment variables" });

    const { tickers } = req.body || {};
    const cleanTickers = Array.from(new Set((tickers || []).map(t => String(t).trim().toUpperCase().replace(/[^A-Z.]/g, "")).filter(Boolean))).slice(0, 5);
    if (!cleanTickers.length) return res.status(400).json({ error: "No tickers supplied" });

    const stocksData = await Promise.all(cleanTickers.map(loadTickerData));

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 4500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON. No markdown. No prose outside JSON." },
          { role: "user", content: buildPrompt(stocksData) }
        ]
      })
    });

    const raw = await aiRes.json();
    if (!aiRes.ok || raw.error) return res.status(aiRes.status || 500).json({ error: raw.error?.message || "OpenAI request failed" });

    const text = (raw.choices?.[0]?.message?.content || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      if (a === -1 || b === -1) throw new Error("OpenAI returned no JSON");
      parsed = JSON.parse(text.slice(a, b + 1));
    }

    if (!Array.isArray(parsed.stocks) || !parsed.stocks.length) throw new Error("Bad AI response shape");

    parsed.stocks = parsed.stocks.map(s => {
      const live = stocksData.find(d => d.ticker === s.ticker) || stocksData.find(d => d.ticker.toUpperCase() === String(s.ticker).toUpperCase()) || {};
      return normalizeStock({ ...live, ...s, currentPrice: live.currentPrice, changePct: live.changePct, change: live.change });
    });

    parsed.comparison = parsed.comparison || { rankedSummary: "", winner: "", winnerReason: "", sectorNote: "" };
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
};
