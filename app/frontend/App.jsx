/**
 * ♟ TURNIEJ SZACHOWY — App.jsx
 * Backend: FastAPI + PostgreSQL (własny VPS)
 * Bez Supabase — cały auth przez JWT
 */

import { useState, useEffect, useCallback } from "react";

// ─── KONFIGURACJA API ─────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ─── API CLIENT ───────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("chess_token"); }
function setToken(t) { t ? localStorage.setItem("chess_token", t) : localStorage.removeItem("chess_token"); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Błąd API");
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #e8e0d0; font-family: 'IBM Plex Mono', monospace; min-height: 100vh; }

  @keyframes fadeUp   { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
  @keyframes spin     { to { transform: rotate(360deg) } }

  .fade-up  { animation: fadeUp  .35s ease both; }
  .fade-in  { animation: fadeIn  .25s ease both; }

  table { border-collapse: collapse; width: 100%; }
  th    { font-family: 'IBM Plex Mono', monospace; font-weight: 600; letter-spacing:.08em; }
  input, select, button { font-family: 'IBM Plex Mono', monospace; }

  ::-webkit-scrollbar       { width:5px; }
  ::-webkit-scrollbar-track { background:#111; }
  ::-webkit-scrollbar-thumb { background:#2e2a1e; border-radius:3px; }
`;

// ─── PALETA ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0a0a", surface:"#111009", panel:"#18160f", border:"#2a2618",
  gold:"#d4af37", goldDim:"#7a6310",
  cream:"#e8e0d0", muted:"#6a6050", white:"#f0ebe0",
  black:"#14120c", red:"#a93226", blue:"#154360", bluePale:"#7fb3d3",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function generateBuergerPairs(participants, round) {
  const sorted = [...participants].sort((a, b) =>
    a.imie.localeCompare(b.imie, "pl")
  );
  const n = sorted.length;
  if (n < 2) return [];

  let order;
  if (n % 2 === 0) {
    const fixed = sorted[0];
    const rest  = sorted.slice(1);
    const shift = (round - 1) % (n - 1);
    const rotated = [...rest.slice(shift), ...rest.slice(0, shift)];
    order = [fixed, ...rotated];
  } else {
    const shift = (round - 1) % n;
    order = [...sorted.slice(shift), ...sorted.slice(0, shift)];
    order.splice(0, 0, null);
  }

  const half   = order.length / 2;
  const top    = order.slice(0, half);
  const bottom = order.slice(half).reverse();

  return top.map((white, i) => {
    const black = bottom[i];
    if (white === null) return { round_number: round, white_id: black.id, black_id: null, result: "wolny los" };
    if (black === null) return { round_number: round, white_id: white.id, black_id: null, result: "wolny los" };
    return { round_number: round, white_id: white.id, black_id: black.id, result: "" };
  });
}

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{
      display:"inline-block", width:16, height:16,
      border:`2px solid ${C.border}`, borderTopColor:C.gold,
      borderRadius:"50%", animation:"spin .7s linear infinite",
    }} />
  );
}

function Badge({ role }) {
  const map = {
    guest:      { label:"GOŚĆ",       bg:C.border,  color:C.muted },
    teacher:    { label:"NAUCZYCIEL", bg:C.blue,    color:C.bluePale },
    superadmin: { label:"SUPERADMIN", bg:C.goldDim, color:C.gold },
  };
  const s = map[role] || map.guest;
  return (
    <span style={{
      background:s.bg, color:s.color,
      fontSize:10, fontWeight:600, letterSpacing:".12em",
      padding:"3px 8px", borderRadius:3, whiteSpace:"nowrap",
    }}>{s.label}</span>
  );
}

function Btn({ children, onClick, disabled, variant="primary", small, loading, full }) {
  const V = {
    primary:{ bg:C.gold,        color:C.black, hov:"#f0c84a" },
    danger: { bg:C.red,         color:C.white, hov:"#c0392b" },
    ghost:  { bg:"transparent", color:C.muted, hov:C.cream, border:`1px solid ${C.border}` },
  }[variant] || {};
  const [h, sh] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled || loading}
      onMouseEnter={()=>sh(true)} onMouseLeave={()=>sh(false)}
      style={{
        background: (disabled||loading) ? C.border : (h ? V.hov : V.bg),
        color:      (disabled||loading) ? C.muted  : V.color,
        border: V.border || "none", borderRadius:4,
        cursor: (disabled||loading) ? "not-allowed" : "pointer",
        padding: small ? "5px 12px" : "10px 22px",
        fontSize: small ? 11 : 13, fontWeight:600, letterSpacing:".06em",
        transition:"background .15s, color .15s",
        width: full ? "100%" : undefined,
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <label style={{ fontSize:10, color:C.muted, letterSpacing:".12em" }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type="text", error }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{
        background:C.surface,
        border:`1px solid ${error ? C.red : focus ? C.gold : C.border}`,
        color:C.cream, borderRadius:4, padding:"9px 12px",
        fontSize:13, outline:"none", width:"100%", transition:"border-color .15s",
      }}
    />
  );
}

function Divider({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, margin:"16px 0" }}>
      <div style={{ flex:1, borderTop:`1px solid ${C.border}` }} />
      {label && <span style={{ color:C.muted, fontSize:10, letterSpacing:".1em" }}>{label}</span>}
      <div style={{ flex:1, borderTop:`1px solid ${C.border}` }} />
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background:"rgba(169,50,38,.12)", border:`1px solid ${C.red}`,
      color:"#e74c3c", borderRadius:4, padding:"8px 12px", fontSize:12, marginTop:4,
    }}>{msg}</div>
  );
}

// ─── EKRAN LOGOWANIA ──────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setErr(""); setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: { email, password: pass },
      });
      setToken(data.access_token);
      onLogin(data.user, data.role);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:`radial-gradient(ellipse at 50% 30%, #1c1608 0%, ${C.bg} 70%)`,
    }}>
      <div style={{
        position:"fixed", inset:0, opacity:.03, pointerEvents:"none",
        backgroundImage:`repeating-conic-gradient(${C.gold} 0% 25%, transparent 0% 50%)`,
        backgroundSize:"60px 60px",
      }} />

      <div className="fade-up" style={{
        background:C.panel, border:`1px solid ${C.border}`,
        borderRadius:8, padding:"40px 36px", width:360,
        boxShadow:`0 24px 60px rgba(0,0,0,.6)`,
      }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:44, marginBottom:10 }}>♟</div>
          <div style={{
            fontFamily:"'Playfair Display', serif",
            fontSize:22, fontWeight:900, color:C.gold, letterSpacing:".04em",
          }}>TURNIEJ SZACHOWY</div>
          <div style={{ color:C.muted, fontSize:10, letterSpacing:".2em", marginTop:4 }}>
            XII Liceum Ogólnokształcące im. Henryka Sienkiewicza w Warszawie
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }} onKeyDown={handleKeyDown}>
          <Field label="ADRES E-MAIL">
            <TextInput value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="adres@email.pl" type="email" error={!!err} />
          </Field>
          <Field label="HASŁO">
            <TextInput value={pass} onChange={e=>setPass(e.target.value)}
              placeholder="••••••••" type="password" error={!!err} />
          </Field>
          <ErrBox msg={err} />
          <Btn onClick={handleLogin} loading={loading} full>Zaloguj się</Btn>
        </div>

        <Divider label="LUB" />

        <Btn variant="ghost" full onClick={() => onLogin(null, "guest")}>
          Kontynuuj jako gość (tylko podgląd)
        </Btn>
      </div>
    </div>
  );
}

// ─── TABELA PAR ───────────────────────────────────────────────────────────────
function PairsTable({ pairs, participants, canEdit, onResultChange }) {
  const byId = Object.fromEntries(participants.map(p => [p.id, p]));
  const resultOpts = ["","1-0","0-1","0.5-0.5","wolny los"];

  if (pairs.length === 0) return (
    <div style={{ color:C.muted, textAlign:"center", padding:"48px 0", fontSize:13 }}>
      ♟ Brak wygenerowanych par.<br/>
      <span style={{fontSize:11}}>Dodaj uczestników i kliknij „Generuj pary".</span>
    </div>
  );

  const rounds = [...new Set(pairs.map(p => p.round_number))].sort((a,b)=>a-b);

  return (
    <div>
      {rounds.map(r => (
        <div key={r} style={{ marginBottom:32 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{
              background:C.goldDim, color:C.gold,
              fontSize:10, fontWeight:700, letterSpacing:".18em",
              padding:"3px 10px", borderRadius:3,
            }}>RUNDA {r}</div>
            <div style={{ flex:1, borderTop:`1px solid ${C.border}` }} />
          </div>
          <table>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["#","Białe ♔","Czarne ♚","Wynik"].map(h=>(
                  <th key={h} style={{
                    padding:"8px 12px", textAlign:"left",
                    color:C.muted, fontSize:10, letterSpacing:".1em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.filter(p=>p.round_number===r).map((p,i) => {
                const w = byId[p.white_id];
                const b = p.black_id ? byId[p.black_id] : null;
                return (
                  <tr key={p.id} className="fade-in" style={{
                    borderBottom:`1px solid ${C.border}`,
                    background: i%2===0 ? C.surface : C.panel,
                  }}>
                    <td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{i+1}</td>
                    <td style={{padding:"10px 12px",fontSize:13}}>
                      {w ? <>
                        <span style={{color:C.gold,marginRight:5}}>●</span>
                        <span style={{color:C.white}}>{w.imie}</span>
                        <span style={{color:C.muted,fontSize:11}}> {w.klasa}</span>
                      </> : <span style={{color:C.muted}}>?</span>}
                    </td>
                    <td style={{padding:"10px 12px",fontSize:13}}>
                      {b ? <>
                        <span style={{color:C.muted,marginRight:5}}>○</span>
                        <span style={{color:C.white}}>{b.imie}</span>
                        <span style={{color:C.muted,fontSize:11}}> {b.klasa}</span>
                      </> : (
                        <span style={{color:C.muted,fontStyle:"italic"}}>— wolny los —</span>
                      )}
                    </td>
                    <td style={{padding:"10px 12px"}}>
                      {canEdit ? (
                        <select
                          value={p.result||""}
                          onChange={e=>onResultChange(p.id,e.target.value)}
                          style={{
                            background:C.surface, border:`1px solid ${C.border}`,
                            color:C.cream, borderRadius:4, padding:"4px 8px",
                            fontSize:12, cursor:"pointer",
                          }}
                        >
                          {resultOpts.map(o=>(
                            <option key={o} value={o}>{o||"—"}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{
                          color: p.result ? C.gold : C.muted,
                          fontWeight: p.result ? 700 : 400, fontSize:13,
                        }}>{p.result||"—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── SCOREBOARD ───────────────────────────────────────────────────────────────
function Scoreboard({ participants, pairs }) {
  if (!participants.length) return (
    <div style={{color:C.muted,textAlign:"center",padding:"48px 0",fontSize:13}}>
      Brak uczestników.
    </div>
  );

  const scoreOf = p => {
    let pts = 0;
    pairs.forEach(pair => {
      const isW = pair.white_id === p.id;
      const isB = pair.black_id === p.id;
      if (!isW && !isB) return;
      if (pair.result==="1-0")       pts += isW ? 1 : 0;
      if (pair.result==="0-1")       pts += isB ? 1 : 0;
      if (pair.result==="0.5-0.5")   pts += .5;
      if (pair.result==="wolny los" && isW && !pair.black_id) pts += 1;
    });
    return pts;
  };

  const ranked = [...participants]
    .map(p=>({...p, pts:scoreOf(p)}))
    .sort((a,b)=>b.pts-a.pts || a.imie.localeCompare(b.imie));

  const medals = ["🥇","🥈","🥉"];

  return (
    <div>
      <div style={{
        color:C.gold, fontWeight:700, fontSize:11,
        letterSpacing:".15em", marginBottom:12,
      }}>KLASYFIKACJA GENERALNA</div>
      <table>
        <thead>
          <tr style={{borderBottom:`2px solid ${C.border}`}}>
            {["Miejsce","Zawodnik","Klasa","Pkt"].map(h=>(
              <th key={h} style={{
                padding:"8px 12px", textAlign:"left",
                color:C.muted, fontSize:10, letterSpacing:".1em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((p,i)=>(
            <tr key={p.id} style={{
              borderBottom:`1px solid ${C.border}`,
              background: i===0 ? "rgba(212,175,55,.07)" : i%2===0 ? C.surface : C.panel,
            }}>
              <td style={{
                padding:"10px 12px", fontSize:14,
                fontWeight: i<3 ? 700 : 400,
                color: i===0 ? C.gold : i===1 ? "#b0b0b0" : i===2 ? "#cd7f32" : C.muted,
              }}>
                {medals[i] || i+1}
              </td>
              <td style={{padding:"10px 12px",color:C.white,fontSize:13}}>{p.imie}</td>
              <td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{p.klasa}</td>
              <td style={{padding:"10px 12px",color:C.gold,fontWeight:700,fontSize:15}}>{p.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── PANEL UCZESTNIKÓW ────────────────────────────────────────────────────────
function ParticipantsPanel({ participants, canDelete, onDelete }) {
  if (!participants.length) return (
    <div style={{color:C.muted,fontSize:12,padding:"10px 0"}}>Brak uczestników.</div>
  );
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:8}}>
      {participants.map(p=>(
        <div key={p.id} className="fade-in" style={{
          background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:4, padding:"6px 10px",
          display:"flex", alignItems:"center", gap:8, fontSize:12,
        }}>
          <span style={{color:C.white}}>{p.imie}</span>
          <span style={{
            background:C.border, color:C.muted,
            borderRadius:3, padding:"1px 6px", fontSize:10, letterSpacing:".06em",
          }}>{p.klasa}</span>
          {canDelete && (
            <button onClick={()=>onDelete(p.id)} style={{
              background:"none", border:"none", color:C.red,
              cursor:"pointer", fontSize:15, lineHeight:1, padding:0,
            }} title="Usuń">×</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── GŁÓWNA APLIKACJA ─────────────────────────────────────────────────────────
export default function App() {
  const [user,         setUser]         = useState(undefined);
  const [isGuest,      setIsGuest]      = useState(false);
  const [role,         setRole]         = useState("guest");
  const [participants, setParticipants] = useState([]);
  const [pairs,        setPairs]        = useState([]);
  const [inputVal,     setInputVal]     = useState("");
  const [addErr,       setAddErr]       = useState("");
  const [genErr,       setGenErr]       = useState("");
  const [tab,          setTab]          = useState("pairs");
  const [loading,      setLoading]      = useState(false);
  const [dataLoading,  setDataLoading]  = useState(false);

  const nextRound = pairs.length
    ? Math.max(...pairs.map(p=>p.round_number)) + 1
    : 1;

  const canEdit   = role==="teacher" || role==="superadmin";
  const canDelete = role==="superadmin";

  // ── Wczytaj dane ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [prt, prs] = await Promise.all([
        apiFetch("/participants"),
        apiFetch("/pairs"),
      ]);
      setParticipants(prt ?? []);
      setPairs(prs ?? []);
    } catch (_) {}
    setDataLoading(false);
  }, []);

  // ── Sprawdź zapisany token ───────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) { setUser(null); return; }
    apiFetch("/auth/me")
      .then(me => {
        setUser({ email: me.email });
        setRole(me.role);
        loadData();
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      });
  }, [loadData]);

  // ── Logowanie ───────────────────────────────────────────────────────────────
  function handleLogin(u, r) {
    if (u === null && r === "guest") {
      setIsGuest(true);
      setRole("guest");
      loadData();
      return;
    }
    setUser(u);
    setRole(r);
    setIsGuest(false);
    if (u) loadData();
  }

  // ── Wylogowanie ─────────────────────────────────────────────────────────────
  function handleLogout() {
    setToken(null);
    setUser(null);
    setIsGuest(false);
    setRole("guest");
    setParticipants([]);
    setPairs([]);
  }

  // ── Dodaj uczestnika ────────────────────────────────────────────────────────
  async function addParticipant() {
    setAddErr("");
    const trimmed = inputVal.trim();
    const parts   = trimmed.split("_");
    if (parts.length < 2) { setAddErr("Format: imie_klasa, np. jan_1B"); return; }
    const klasa = parts.pop();
    const imie  = parts.join("_");
    if (!imie || !klasa) { setAddErr("Nieprawidłowy format."); return; }

    setLoading(true);
    try {
      const data = await apiFetch("/participants", {
        method: "POST",
        body: { imie, klasa },
      });
      setParticipants(prev =>
        [...prev, data].sort((a,b)=>a.imie.localeCompare(b.imie,"pl"))
      );
      setInputVal("");
    } catch (e) {
      setAddErr(e.message);
    }
    setLoading(false);
  }

  // ── Usuń uczestnika ─────────────────────────────────────────────────────────
  async function deleteParticipant(id) {
    await apiFetch(`/participants/${id}`, { method: "DELETE" });
    setParticipants(prev => prev.filter(p=>p.id!==id));
  }

  // ── Generuj pary ────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenErr("");
    if (participants.length < 2) { setGenErr("Minimum 2 uczestników."); return; }
    const newPairs = generateBuergerPairs(participants, nextRound);
    setLoading(true);
    try {
      const data = await apiFetch("/pairs", {
        method: "POST",
        body: { pairs: newPairs },
      });
      setPairs(prev => [...prev, ...data]);
    } catch (e) {
      setGenErr(e.message);
    }
    setLoading(false);
  }

  // ── Edytuj wynik ────────────────────────────────────────────────────────────
  async function handleResultChange(pairId, result) {
    setPairs(prev => prev.map(p=>p.id===pairId ? {...p,result} : p));
    await apiFetch(`/pairs/${pairId}`, {
      method: "PATCH",
      body: { result },
    });
  }

  // ── Reset turnieju ──────────────────────────────────────────────────────────
  async function handleReset() {
    if (!window.confirm(
      "Zresetować cały turniej? Usunięte zostaną pary i wszyscy uczestnicy."
    )) return;
    setLoading(true);
    await apiFetch("/pairs",        { method: "DELETE" });
    await apiFetch("/participants", { method: "DELETE" });
    setPairs([]);
    setParticipants([]);
    setLoading(false);
  }

  // ── Ładowanie sesji ─────────────────────────────────────────────────────────
  if (user === undefined) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:16}}>♟</div>
          <Spinner />
        </div>
      </div>
    </>
  );

  if (user === null && !isGuest) return (
    <><style>{GLOBAL_CSS}</style><LoginScreen onLogin={handleLogin} /></>
  );

  // ── Główny interfejs ────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <header style={{
        background:C.black, borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", display:"flex", alignItems:"center",
        justifyContent:"space-between", height:60,
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>♟</span>
          <div>
            <div style={{
              fontFamily:"'Playfair Display', serif",
              fontSize:18, fontWeight:900, color:C.gold, lineHeight:1.1,
            }}>TURNIEJ SZACHOWY</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:".2em"}}>XII Liceum Ogólnokształcące im. Henryka Sienkiewicza w Warszawie</div>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {role!=="guest" && (
            <span style={{color:C.muted,fontSize:11,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {user?.email}
            </span>
          )}
          <Badge role={role} />
          {role==="guest" ? (
            <Btn small variant="ghost" onClick={()=>{ setIsGuest(false); setUser(null); }}>Zaloguj</Btn>
          ) : (
            <Btn small variant="ghost" onClick={handleLogout}>Wyloguj</Btn>
          )}
        </div>
      </header>

      <div style={{
        maxWidth:1120, margin:"0 auto", padding:"28px 20px",
        display:"grid",
        gridTemplateColumns: canEdit ? "1fr 300px" : "1fr",
        gap:24, alignItems:"start",
      }}>
        <main>
          <div style={{display:"flex",gap:2,marginBottom:20}}>
            {[["pairs","Pary i wyniki"],["score","Klasyfikacja"]].map(([k,label])=>(
              <button key={k} onClick={()=>setTab(k)} style={{
                background: tab===k ? C.gold : C.surface,
                color:      tab===k ? C.black : C.muted,
                border:     `1px solid ${tab===k ? C.gold : C.border}`,
                borderRadius:"4px 4px 0 0", padding:"8px 18px",
                fontSize:11, fontWeight:600, letterSpacing:".09em",
                cursor:"pointer", transition:"all .15s",
              }}>{label}</button>
            ))}
          </div>

          <div style={{
            background:C.panel, border:`1px solid ${C.border}`,
            borderRadius:"0 4px 4px 4px", padding:"20px 16px", minHeight:240,
          }}>
            {dataLoading ? (
              <div style={{display:"flex",justifyContent:"center",padding:40}}>
                <Spinner />
              </div>
            ) : tab==="pairs" ? (
              <PairsTable
                pairs={pairs}
                participants={participants}
                canEdit={canEdit}
                onResultChange={handleResultChange}
              />
            ) : (
              <Scoreboard participants={participants} pairs={pairs} />
            )}
          </div>
        </main>

        {canEdit && (
          <aside className="fade-up" style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{
              background:C.panel, border:`1px solid ${C.border}`,
              borderRadius:4, padding:20,
            }}>
              <div style={{
                fontFamily:"'Playfair Display', serif",
                color:C.gold, fontSize:15, fontWeight:700, marginBottom:18,
              }}>Panel zarządzania</div>

              <div style={{marginBottom:16}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:".12em",marginBottom:8}}>
                  DODAJ UCZESTNIKA
                </div>
                <div style={{display:"flex",gap:8}}>
                  <TextInput
                    value={inputVal}
                    onChange={e=>{setInputVal(e.target.value);setAddErr("");}}
                    placeholder="imie_klasa, np. jan_1B"
                    error={!!addErr}
                  />
                  <Btn onClick={addParticipant} small loading={loading}>+</Btn>
                </div>
                <ErrBox msg={addErr} />
              </div>

              <Divider />

              <div style={{marginBottom:4}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:".12em",marginBottom:8}}>
                  RUNDA {nextRound}
                </div>
                <Btn
                  onClick={handleGenerate}
                  loading={loading}
                  disabled={participants.length<2}
                  full
                >
                  ♟ Generuj pary ♟
                </Btn>
                <ErrBox msg={genErr} />
              </div>

              {canDelete && (
                <>
                  <Divider />
                  <Btn variant="danger" onClick={handleReset} loading={loading} full>
                    ⚠ Reset turnieju
                  </Btn>
                </>
              )}

              <Divider label="UCZESTNICY" />

              <div style={{
                display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:8,
              }}>
                <span style={{color:C.muted,fontSize:10,letterSpacing:".1em"}}>ŁĄCZNIE</span>
                <span style={{
                  background:C.goldDim, color:C.gold,
                  borderRadius:3, padding:"1px 8px", fontSize:11, fontWeight:700,
                }}>{participants.length}</span>
              </div>

              <ParticipantsPanel
                participants={participants}
                canDelete={canDelete}
                onDelete={deleteParticipant}
              />
            </div>

            <div style={{
              background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:4, padding:14, fontSize:11, color:C.muted, lineHeight:1.9,
            }}>
              <div style={{color:C.goldDim,fontWeight:600,marginBottom:4,letterSpacing:".08em"}}>
                SCHEMAT BUERGUERA
              </div>
              Sort. alfabetyczny → górna ½ = białe, dolna ½ = czarne → parowanie krzyżowe.
              Nieparzysta liczba → ostatni z góry ={" "}
              <span style={{color:C.gold}}>wolny los (+1 pkt)</span>.
            </div>
          </aside>
        )}
      </div>

      <footer style={{
        textAlign:"center", color:C.muted, fontSize:10,
        padding:"24px 0 40px", letterSpacing:".12em",
      }}>
        ♟ TURNIEJ SZACHOWY · {new Date().getFullYear()}
      </footer>
    </>
  );
}
