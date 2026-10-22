"use client";
import { useCallback, useEffect, useState } from "react";
import { createAuthClient } from "@neondatabase/auth/next";
import { loginEmail, makeUsername } from "@/lib/username";

const authClient = createAuthClient();
const NAV = [["dashboard","Dashboard",true],["placar","Placar",true],["allocation","Alocação",true],["orders","Atividades",false],["users","Pessoas e acessos",true],["import","Importar planilha",true],["security","Minha senha",false]];
const STATUS_LABEL: Record<string,string> = { pending:"Pendente", in_progress:"Em andamento", completed:"Concluída", blocked:"Bloqueada", cancelled:"Cancelada" };
const PRIORITY_LABEL: Record<string,string> = { low:"Baixa", normal:"Normal", high:"Alta", urgent:"Urgente", critical:"Crítica" };
type Profile = { username:string; display_name:string; role:"super_admin"|"admin"|"technician"; must_change_password:boolean };
type Order = { id:string; order_number:string|null; title:string; description:string|null; location:string|null; equipment:string|null; priority:string; status:string; assigned_username:string|null; scheduled_for:string|null };
type SheetPerson = { username:string; sheet_name:string|null; total:number; completed:number; registered:boolean; suggestedName:string };
type AppUser = { username:string; display_name:string; role:string; is_active:boolean; must_change_password:boolean };
type PersonReport = { username:string; profile:AppUser|null; summary:{total:number;completed:number;pending:number;in_progress:number;overdue:number;minutes:number}; orders:Array<{id:string;order_number:string|null;title:string;location:string|null;status:string;scheduled_for:string|null;work_minutes:number;completed_at:string|null;sheet_name:string|null}>; occurrences:Array<{category:string;description:string;status:string;created_at:string;order_number:string|null}> };
type WeekData = { start:string; days:string[]; people:Array<{username:string;name:string|null}>; orders:Array<{id:string;order_number:string|null;title:string;location:string|null;status:string;assigned_username:string|null;day:string;work_minutes:number}> };
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const shiftDay = (iso:string|undefined, days:number) => { const d = new Date((iso ?? todayIso()) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); };
const allocClass = (m:number) => m === 0 ? "alloc-nok" : m < 360 ? "alloc-low" : m > 480 ? "alloc-high" : "alloc-ok";
type Summary = { total:number; new:number; changed:number; unchanged:number; existing:number; notInFile:number; completedPreserved:number; preview:Array<Record<string,unknown>> };
type Allocation = { periodDays:number; daily:Array<{day:string;minutes:number;orders:number}>; people:Array<{name:string;minutes:number;orders:number}>; totals:{minutes:number;orders:number;days:number} };
type Analytics = { periodDays:number; summary:Record<string,number>; byStatus:Array<{status:string;count:number}>; byPriority:Array<{priority:string;count:number}>; trend:Array<{day:string;created:number;completed:number}>; byTechnician:Array<{username:string;total:number;completed:number;pending:number;overdue:number}>; occurrences:Array<{category:string;status:string;count:number}>; imports:Array<Record<string,unknown>>; recentOrders:Array<Record<string,unknown>> };

export default function Home() {
  const [user,setUser] = useState<Profile|null>(null);
  const [orders,setOrders] = useState<Order[]>([]);
  const [setupRequired,setSetupRequired] = useState(false);
  const [setupName,setSetupName] = useState("");
  const [setupEmail,setSetupEmail] = useState("");
  const [setupPassword,setSetupPassword] = useState("");
  const [setupSecret,setSetupSecret] = useState("");
  const [login,setLogin] = useState("");
  const [password,setPassword] = useState("");
  const [currentPassword,setCurrentPassword] = useState("");
  const [newPassword,setNewPassword] = useState("");
  const [name,setName] = useState("");
  const [newRole,setNewRole] = useState<"admin"|"technician">("technician");
  const [created,setCreated] = useState<{username:string;temporaryPassword:string}|null>(null);
  const [file,setFile] = useState<File|null>(null);
  const [summary,setSummary] = useState<Summary|null>(null);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [tab,setTab] = useState<"dashboard"|"placar"|"allocation"|"orders"|"import"|"users"|"security"|"person">("dashboard");
  const [menuOpen,setMenuOpen] = useState(false);
  const [week,setWeek] = useState<WeekData|null>(null);
  const [cell,setCell] = useState<{username:string;day:string}|null>(null);
  const [newAct,setNewAct] = useState({username:"",day:"",minutes:"60",title:"",orderNumber:"",location:""});
  const [people,setPeople] = useState<{people:SheetPerson[];users:AppUser[]}|null>(null);
  const [report,setReport] = useState<PersonReport|null>(null);
  const [analytics,setAnalytics] = useState<Analytics|null>(null);
  const [allocation,setAllocation] = useState<Allocation|null>(null);
  const [periodDays,setPeriodDays] = useState(30);
  const [analyticsBusy,setAnalyticsBusy] = useState(false);
  const [ready,setReady] = useState(false);

  const load = useCallback(async (afterLogin = false) => {
    const me = await fetch("/api/me");
    if (!me.ok) { setUser(null); if (me.status === 401 && afterLogin) { setError("Login aceito, mas o servidor não reconheceu a sessão (cookie). Tente novamente ou avise o suporte."); } if (me.status !== 401) { const failure = await me.json().catch(() => ({})) as { error?: string; detail?: string }; setError(`${failure.error ?? "Falha ao carregar perfil."} (${me.status})${failure.detail ? " — " + failure.detail : ""}`); } const setup = await fetch("/api/setup/status"); if (setup.ok) setSetupRequired(Boolean((await setup.json()).setupRequired)); setReady(true); return; }
    const payload = await me.json();
    setUser(payload.user);
    if (!payload.user.must_change_password) {
      const res = await fetch("/api/orders");
      if (res.ok) setOrders((await res.json()).orders);
      if (payload.user.role !== "technician") {
        const stats = await fetch("/api/admin/analytics?days=30");
        if (stats.ok) setAnalytics(await stats.json());
      }
    }
    setReady(true);
  },[]);
  useEffect(() => { void load(); },[load]);

  async function bootstrap(e:React.FormEvent) {
    e.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      const username = makeUsername(setupName);
      const created = await authClient.signUp.email({ email: setupEmail.trim().toLowerCase(), password: setupPassword, name: setupName.trim() });
      if (created.error) {
        const existingSignIn = await authClient.signIn.email({ email: setupEmail.trim().toLowerCase(), password: setupPassword });
        if (existingSignIn.error) throw new Error("Já existe uma conta com este e-mail, mas a senha não confere. Use a mesma senha do primeiro cadastro.");
      } else {
        const signedIn = await authClient.signIn.email({ email: setupEmail.trim().toLowerCase(), password: setupPassword });
        if (signedIn.error) throw new Error(signedIn.error.message || "Conta criada, mas não foi possível iniciar a sessão. Tente entrar com o login gerado.");
      }
      const response = await fetch("/api/setup/bootstrap",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:setupName,secret:setupSecret})});
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "Falha ao configurar administrador.");
      setMessage(`Administrador principal configurado: ${data.username}`); setSetupPassword(""); setSetupSecret(""); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Falha na configuração inicial."); }
    finally { setBusy(false); }
  }
  async function signIn(e:React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const username = login.trim().toLowerCase();
      let result = await authClient.signIn.email({ email: username.includes("@") ? username : loginEmail(username), password });
      // Contas internas usam e-mail sintético; se digitou um e-mail real, tenta o login gerado pelo nome.
      if (result.error && username.includes("@") && !username.endsWith("@login.gera.invalid")) {
        const local = username.split("@")[0].replace(/\d+$/, "");
        if (local.includes(".")) result = await authClient.signIn.email({ email: loginEmail(local), password });
      }
      if (result.error) throw new Error(username.includes("@") ? "Login ou senha inválidos. Use o login no formato nome.sobrenome." : "Login ou senha inválidos.");
      setPassword(""); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  async function loadAnalytics(days = periodDays) {
    setAnalyticsBusy(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error((data.error || "Não foi possível carregar os indicadores.") + (data.detail ? ` (${data.detail})` : ""));
      setAnalytics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dashboard.");
    } finally {
      setAnalyticsBusy(false);
    }
  }
  async function loadAllocation(days = periodDays) {
    setAnalyticsBusy(true);
    try {
      const res = await fetch(`/api/admin/allocation?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar a alocação.");
      setAllocation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar alocação.");
    } finally {
      setAnalyticsBusy(false);
    }
  }
  function formatMinutes(value:number) {
    const minutes = Number(value || 0);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
  }
  function exportAnalyticsCsv() {
    if (!analytics) return;
    const rows = [["Indicador","Valor"],["Total de ordens",analytics.summary.total],["Pendentes",analytics.summary.pending],["Em andamento",analytics.summary.in_progress],["Concluídas",analytics.summary.completed],["Bloqueadas",analytics.summary.blocked],["Atrasadas",analytics.summary.overdue],["Taxa de conclusão (%)",analytics.summary.completionRate]];
    rows.push(["",""],["Técnico","Total","Concluídas","Pendentes","Atrasadas"]);
    analytics.byTechnician.forEach(t => rows.push([t.username,String(t.total),String(t.completed),String(t.pending),String(t.overdue)]));
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `gera-relatorio-${periodDays}d.csv`; link.click(); URL.revokeObjectURL(url);
  }
  async function signOut() { await authClient.signOut(); setUser(null); setOrders([]); setMessage(""); setError(""); const setup = await fetch("/api/setup/status"); if (setup.ok) setSetupRequired(Boolean((await setup.json()).setupRequired)); }
  async function changePassword(e:React.FormEvent) {
    e.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      if (newPassword.length < 12) throw new Error("A nova senha deve ter pelo menos 12 caracteres.");
      // Troca a senha direto no Neon Auth (mesmo caminho do login) e depois libera o perfil no servidor.
      const changed = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (changed.error) throw new Error(/password/i.test(changed.error.message ?? "") ? "Senha provisória atual incorreta." : (changed.error.message || "Falha ao trocar senha."));
      const res = await fetch("/api/me/password",{method:"POST"});
      const data = await res.json(); if(!res.ok) throw new Error(data.error || "Falha ao trocar senha.");
      setCurrentPassword("");setNewPassword("");setMessage("Senha atualizada. Seu acesso está liberado.");await load();
    } catch(e) {setError(e instanceof Error?e.message:"Falha ao trocar senha.");}
    finally {setBusy(false);}
  }
  async function updateStatus(order:Order,status:"in_progress"|"completed"|"blocked") {
    if (status==="completed" && !window.confirm(`Confirmar a conclusão da ordem ${order.order_number||order.title}? Depois de concluída ela não pode mais ser alterada.`)) return;
    setError("");setMessage("");
    const res=await fetch("/api/orders",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:order.id,status})});
    const data=await res.json();if(!res.ok){setError(data.error||"Falha ao atualizar ordem.");return;}
    setMessage("Atividade atualizada.");await load();
  }
  async function reportOccurrence(order:Order) {
    const category = window.prompt("Categoria da ocorrência (ex.: material, segurança, equipamento):");
    if (!category) return;
    const description = window.prompt("Descreva a ocorrência:");
    if (!description) return;
    setError(""); setMessage("");
    const res = await fetch("/api/occurrences", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({workOrderId:order.id,category,description}) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Falha ao registrar ocorrência."); return; }
    setMessage("Ocorrência registrada."); 
  }
  async function loadWeek(start?:string) {
    const res = await fetch(`/api/admin/allocation/week${start?`?start=${start}`:""}`); const data = await res.json();
    if (!res.ok) { setError((data.error || "Falha ao carregar a alocação.") + (data.detail ? ` (${data.detail})` : "")); return; }
    setWeek(data); setCell(null);
  }
  function weekMinutes(username:string, day:string) { return (week?.orders ?? []).filter(o=>o.assigned_username===username&&o.day===day).reduce((sum,o)=>sum+Number(o.work_minutes||0),0); }
  async function moveOrder(id:string, day:string) {
    setError(""); setMessage("");
    const res = await fetch("/api/admin/allocation/week",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,day})});
    const data = await res.json(); if (!res.ok) { setError(data.error || "Falha ao mudar a data."); return; }
    setMessage(`Atividade movida para ${new Date(day+"T12:00:00").toLocaleDateString("pt-BR")}.`); const keep = cell; await loadWeek(week?.start); setCell(keep);
  }
  async function createActivity(e:React.FormEvent) {
    e.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      const res = await fetch("/api/admin/allocation/week",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...newAct,minutes:Number(newAct.minutes)})});
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao criar a atividade.");
      setMessage("Atividade criada."); const keep = {username:newAct.username,day:newAct.day}; setNewAct(a=>({...a,title:"",orderNumber:"",location:""}));
      await loadWeek(shiftDay(newAct.day,0)); setCell(keep);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao criar a atividade."); }
    finally { setBusy(false); }
  }
  async function loadPeople() {
    const res = await fetch("/api/admin/people"); const data = await res.json();
    if (!res.ok) { setError(data.error || "Falha ao carregar pessoas."); return; }
    setPeople(data);
  }
  async function openPerson(username:string) {
    setReport(null); setTab("person"); setMenuOpen(false); setError(""); setMessage("");
    const res = await fetch(`/api/admin/people?username=${encodeURIComponent(username)}`); const data = await res.json();
    if (!res.ok) { setError(data.error || "Falha ao carregar o relatório."); return; }
    setReport(data);
  }
  async function resetPassword(username:string) {
    if (!window.confirm(`Gerar uma nova senha provisória para ${username}? A senha atual deixará de funcionar.`)) return;
    setError(""); setMessage(""); setCreated(null);
    const res = await fetch("/api/admin/users/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username})});
    const data = await res.json(); if (!res.ok) { setError((data.error || "Falha ao redefinir a senha.") + (data.detail ? ` (${data.detail})` : "")); return; }
    setCreated({username:data.username,temporaryPassword:data.temporaryPassword}); setMessage("Nova senha provisória gerada. Copie e entregue à pessoa."); window.scrollTo({top:0,behavior:"smooth"});
  }
  function startRegistration(fullName:string) { setName(fullName); setCreated(null); setTimeout(()=>document.getElementById("new-user-name")?.focus(),0); document.getElementById("new-user")?.scrollIntoView({behavior:"smooth"}); }
  async function createUser(e:React.FormEvent) {
    e.preventDefault();setError("");setMessage("");setCreated(null);setBusy(true);
    try {
      const res=await fetch("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,role:newRole})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Falha ao cadastrar usuário.");
      setCreated({username:data.user.username,temporaryPassword:data.temporaryPassword});setName("");void loadPeople();setMessage("Cadastro criado. Copie a senha provisória agora.");
    } catch(e){setError(e instanceof Error?e.message:"Falha ao cadastrar usuário.");}
    finally{setBusy(false);}
  }
  async function importFile(apply:boolean) {
    if(!file){setError("Escolha um arquivo Excel ou CSV.");return;}
    setError("");setMessage("");setBusy(true);
    try {
      const form=new FormData();form.set("file",file);form.set("apply",String(apply));
      const res=await fetch("/api/import",{method:"POST",body:form});const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Falha ao processar planilha.");
      setSummary(data.summary);setMessage(data.message);
      if(apply){setFile(null);await load();}
    } catch(e){setError(e instanceof Error?e.message:"Falha ao processar planilha.");}
    finally{setBusy(false);}
  }
  if(!ready) return <main className="shell"><div className="panel">Carregando Gera…</div></main>;
  if(!user) return <main className="shell" style={{maxWidth:480,paddingTop:"10vh"}}>
    <header className="header"><div><div className="brand">gera<span style={{color:"var(--accent)"}}>.</span></div><div className="muted">Ordens do Dia · Gestão de atividades</div></div></header>
    <section className="panel stack">{setupRequired?<><div><h1>Configuração inicial</h1><p className="muted">Crie a conta do administrador principal. Este formulário desaparece após a configuração inicial.</p></div>
      <form className="stack" onSubmit={bootstrap}><div><label className="label">Nome completo</label><input className="field" autoComplete="name" value={setupName} onChange={e=>setSetupName(e.target.value)} placeholder="Seu nome e sobrenome" required /></div><div><label className="label">E-mail do administrador</label><input className="field" type="email" autoComplete="email" value={setupEmail} onChange={e=>setSetupEmail(e.target.value)} required /></div><div><label className="label">Senha inicial (mínimo 12 caracteres)</label><input className="field" type="password" autoComplete="new-password" minLength={12} value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} required /></div><div><label className="label">Código de configuração</label><input className="field" type="password" value={setupSecret} onChange={e=>setSetupSecret(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Configurando…":"Criar administrador principal"}</button></form><p className="muted">Antes de abrir o sistema, configure GERA_BOOTSTRAP_SECRET na Vercel com um segredo aleatório de pelo menos 20 caracteres. Você poderá entrar usando seu e-mail ou o login gerado pelo nome.</p></>:<><div><h1>Entrar no Gera</h1><p className="muted">Use o login no formato <b>nome.sobrenome</b> (ex.: anderson.motta), não o seu e-mail pessoal.</p></div>
      <form className="stack" onSubmit={signIn}><div><label className="label">Login</label><input className="field" autoComplete="username" value={login} onChange={e=>setLogin(e.target.value)} placeholder="nome.sobrenome" required /></div><div><label className="label">Senha</label><input className="field" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Entrando…":"Entrar"}</button></form><p className="muted">O acesso é criado por um administrador. Não há cadastro público.</p></>}</section>
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
</main>;
  if(user.must_change_password) return <main className="shell" style={{maxWidth:520,paddingTop:"8vh"}}><section className="panel stack"><div className="brand">Primeiro acesso</div><h1>Crie sua senha pessoal</h1><p className="muted">Por segurança, você precisa substituir a senha provisória antes de acessar suas atividades.</p><form className="stack" onSubmit={changePassword}><div><label className="label">Senha provisória atual</label><input className="field" type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required /></div><div><label className="label">Nova senha (mínimo 12 caracteres)</label><input className="field" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Salvando…":"Salvar nova senha"}</button></form>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}</section></main>;

  const admin = user.role!=="technician";
  const current = admin ? tab : (tab==="security"?"security":"orders");
  const go = (t:typeof tab) => { setTab(t); setMenuOpen(false); setError(""); setMessage(""); if(t==="dashboard"||t==="placar") void loadAnalytics(); if(t==="allocation") void loadWeek(week?.start); if(t==="users") void loadPeople(); };
  const navItems = (NAV as Array<[typeof tab,string,boolean]>).filter(([, ,adminOnly])=>admin||!adminOnly);
  return <div className="app">
    <div className="topbar"><div className="brand">gera<span style={{color:"var(--accent)"}}>.</span></div><button className="menu-btn" aria-label="Abrir menu" onClick={()=>setMenuOpen(true)}><span/><span/><span/></button></div>
    {menuOpen&&<div className="backdrop" onClick={()=>setMenuOpen(false)}/>}
    <aside className={"sidebar"+(menuOpen?" open":"")}>
      <div className="sidebar-head"><div className="brand">gera<span style={{color:"var(--accent)"}}>.</span></div><div className="muted">Ordens do Dia</div></div>
      <nav className="side-nav">{navItems.map(([key,label])=><button key={key} className={"side-link"+((current===key||(key==="users"&&current==="person"))?" active":"")} onClick={()=>go(key)}>{label}</button>)}</nav>
      <div className="sidebar-foot"><div className="user-card"><strong>{user.display_name}</strong><span className="muted">{user.role==="super_admin"?"Administrador principal":admin?"Administrador":"Técnico"} · {user.username}</span></div><button className="btn ghost full" onClick={signOut}>Sair</button></div>
    </aside>
    <main className="content">
    <section className="grid"><div className="panel"><div className="muted">Atividades visíveis</div><div className="stats">{orders.length}</div></div><div className="panel"><div className="muted">Em andamento</div><div className="stats">{orders.filter(o=>o.status==="in_progress").length}</div></div><div className="panel"><div className="muted">Concluídas</div><div className="stats">{orders.filter(o=>o.status==="completed").length}</div></div></section>

    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    {admin&&current==="placar"&&<section className="stack">
      <div className="spread dashboard-heading"><div><h1>Placar operacional</h1><p className="muted">Ranking de colaboradores por volume de trabalho registrado na planilha.</p></div><div className="row"><select className="field period-select" aria-label="Período do placar" value={periodDays} onChange={e=>{const d=Number(e.target.value);setPeriodDays(d);void loadAnalytics(d);}}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select><button className="btn ghost" onClick={()=>void loadAnalytics()}>Atualizar</button></div></div>
      {!analytics?<div className="panel">Carregando placar…</div>:<><div className="grid"><div className="panel kpi"><span className="muted">Ordens registradas</span><strong className="stats">{analytics.summary.total??0}</strong></div><div className="panel kpi"><span className="muted">Concluídas</span><strong className="stats">{analytics.summary.completed??0}</strong></div><div className="panel kpi"><span className="muted">Taxa de conclusão</span><strong className="stats">{analytics.summary.completionRate??0}%</strong></div></div><div className="panel stack"><h2>Ranking por colaborador</h2>{analytics.byTechnician.length===0?<p className="muted">Ainda não há colaboradores atribuídos nas ordens.</p>:<div className="table-wrap"><table><thead><tr><th>Posição</th><th>Colaborador</th><th>Ordens</th><th>Concluídas</th><th>Pendentes</th><th>Atrasadas</th></tr></thead><tbody>{analytics.byTechnician.map((t,i)=><tr key={t.username}><td>{i+1}º</td><td>{t.username}</td><td>{t.total}</td><td>{t.completed}</td><td>{t.pending}</td><td>{t.overdue}</td></tr>)}</tbody></table></div>}</div></>}
    </section>}
    {admin&&current==="allocation"&&<section className="stack">
      <div className="spread dashboard-heading"><div><h1>Alocação semanal</h1><p className="muted">Minutos de trabalho previstos por pessoa e por dia. Clique numa célula para ver, mover ou criar atividades.</p></div>
        <div className="row"><button className="btn ghost" onClick={()=>void loadWeek(shiftDay(week?.start,-7))}>‹ Semana anterior</button><input className="field date-field" type="date" value={week?.start??""} onChange={e=>e.target.value&&void loadWeek(e.target.value)} aria-label="Escolher semana"/><button className="btn ghost" onClick={()=>void loadWeek(shiftDay(week?.start,7))}>Próxima semana ›</button><button className="btn ghost" onClick={()=>void loadWeek()}>Hoje</button></div></div>
      {!week?<div className="panel">Carregando alocação…</div>:<>
      <div className="panel alloc-panel">
        <div className="table-wrap"><table className="alloc"><thead><tr><th className="alloc-name">Nome</th>{week.days.map(d=>{const dt=new Date(d+"T12:00:00");return <th key={d} className={"alloc-day"+(d===todayIso()?" today":"")}><span>{dt.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","").toUpperCase()}</span><small>{dt.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}).replace(". de ","-").replace(" de ","-").replace(".","")}</small></th>;})}<th className="num">Total</th></tr></thead>
          <tbody>{week.people.map(p=>{const totals=week.days.map(d=>weekMinutes(p.username,d));return <tr key={p.username}><td className="alloc-name"><button className="link" onClick={()=>void openPerson(p.username)}>{p.name||p.username}</button></td>{week.days.map((d,k)=>{const m=totals[k];const sel=cell?.username===p.username&&cell.day===d;return <td key={d} className={"alloc-cell "+allocClass(m)+(sel?" selected":"")} onClick={()=>{setCell({username:p.username,day:d});setNewAct(a=>({...a,username:p.username,day:d}));}}>{m}</td>;})}<td className="num"><strong>{formatMinutes(totals.reduce((a,b)=>a+b,0))}</strong></td></tr>;})}</tbody></table></div>
        <div className="legend alloc-legend"><span><i className="alloc-ok"/>ALC OK (360–480 min)</span><span><i className="alloc-low"/>ALC &lt; 360 min</span><span><i className="alloc-high"/>ALC &gt; 480 min</span><span><i className="alloc-nok"/>ALC NOK (sem alocação)</span></div>
      </div>
      <div className="split">
        <div className="panel stack"><h2>{cell?`${week.people.find(p=>p.username===cell.username)?.name||cell.username} · ${new Date(cell.day+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})}`:"Atividades do dia"}</h2>
          {!cell?<p className="muted">Selecione uma célula da grade.</p>:(()=>{const list=week.orders.filter(o=>o.assigned_username===cell.username&&o.day===cell.day);return list.length===0?<p className="muted">Nenhuma atividade alocada neste dia.</p>:<ul className="plain-list">{list.map(o=><li key={o.id} className="alloc-order"><div><strong>{o.order_number||"Sem número"}</strong> · {o.title}<div className="muted">{formatMinutes(o.work_minutes)}{o.location?` · ${o.location}`:""} · {STATUS_LABEL[o.status]||o.status}</div></div>{o.status==="completed"?<span className="locked">Concluída</span>:<label className="move">Mudar data<input className="field" type="date" defaultValue={o.day} onChange={e=>e.target.value&&e.target.value!==o.day&&void moveOrder(o.id,e.target.value)}/></label>}</li>)}</ul>;})()}
        </div>
        <form className="panel stack" onSubmit={createActivity}><h2>Nova atividade</h2>
          <div><label className="label">Responsável</label><select className="field" value={newAct.username} onChange={e=>setNewAct({...newAct,username:e.target.value})} required><option value="">Selecione…</option>{week.people.map(p=><option key={p.username} value={p.username}>{p.name||p.username}</option>)}</select></div>
          <div className="row two"><div><label className="label">Data</label><input className="field" type="date" value={newAct.day} onChange={e=>setNewAct({...newAct,day:e.target.value})} required/></div><div><label className="label">Tempo (min)</label><input className="field" type="number" min={1} max={1440} value={newAct.minutes} onChange={e=>setNewAct({...newAct,minutes:e.target.value})} required/></div></div>
          <div><label className="label">Descrição</label><input className="field" value={newAct.title} onChange={e=>setNewAct({...newAct,title:e.target.value})} placeholder="Ex.: Inspeção da enchedora 01" required/></div>
          <div className="row two"><div><label className="label">Nº da ordem (opcional)</label><input className="field" value={newAct.orderNumber} onChange={e=>setNewAct({...newAct,orderNumber:e.target.value})}/></div><div><label className="label">Local (opcional)</label><input className="field" value={newAct.location} onChange={e=>setNewAct({...newAct,location:e.target.value})}/></div></div>
          <button className="btn" disabled={busy}>{busy?"Salvando…":"Criar atividade"}</button>
        </form>
      </div></>}
    </section>}
    {admin&&current==="dashboard"&&<section className="stack">
      <div className="spread dashboard-heading"><div><h1>Visão gerencial</h1><p className="muted">Indicadores operacionais baseados nos dados do Gera.</p></div><div className="row"><select className="field period-select" aria-label="Período do relatório" value={periodDays} onChange={e=>{const d=Number(e.target.value);setPeriodDays(d);void loadAnalytics(d);}}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select><button className="btn ghost" onClick={()=>void loadAnalytics()}>Atualizar</button><button className="btn secondary" disabled={!analytics} onClick={exportAnalyticsCsv}>Exportar CSV</button></div></div>
      {analyticsBusy&&!analytics?<div className="panel">Carregando indicadores…</div>:!analytics?<div className="panel"><p className="muted">Ainda não foi possível carregar os indicadores.</p><button className="btn" onClick={()=>void loadAnalytics()}>Tentar novamente</button></div>:<>
      <div className="grid kpi-grid">
        <div className="panel kpi"><span className="muted">Total de ordens</span><strong className="stats">{analytics.summary.total??0}</strong><span className="kpi-note">Base completa</span></div>
        <div className="panel kpi"><span className="muted">Concluídas</span><strong className="stats">{analytics.summary.completed??0}</strong><span className="kpi-note">{analytics.summary.completionRate??0}% do total</span></div>
        <div className="panel kpi"><span className="muted">Pendentes</span><strong className="stats">{analytics.summary.pending??0}</strong><span className="kpi-note">Aguardando execução</span></div>
        <div className="panel kpi"><span className="muted">Em andamento</span><strong className="stats">{analytics.summary.in_progress??0}</strong><span className="kpi-note">Em execução</span></div>
        <div className="panel kpi warning-kpi"><span className="muted">Atrasadas</span><strong className="stats">{analytics.summary.overdue??0}</strong><span className="kpi-note">Data prevista ultrapassada</span></div>
        <div className="panel kpi"><span className="muted">Concluídas no período</span><strong className="stats">{analytics.summary.completed_in_period??0}</strong><span className="kpi-note">Últimos {periodDays} dias</span></div>
      </div>
      <div className="analytics-columns">
        <div className="panel stack"><div><h2>Evolução diária</h2><p className="muted">Ordens criadas versus concluídas.</p></div><div className="trend-list">{analytics.trend.map(d=>{const max=Math.max(1,...analytics.trend.map(x=>Math.max(x.created,x.completed)));return <div className="trend-row" key={d.day}><span className="trend-date">{d.day.slice(5)}</span><div className="trend-bars"><div className="bar-track"><div className="bar created-bar" style={{width:`${Number(d.created)/max*100}%`}} /></div><div className="bar-track"><div className="bar completed-bar" style={{width:`${Number(d.completed)/max*100}%`}} /></div></div><span className="trend-values">{d.created}/{d.completed}</span></div>})}</div><div className="legend"><span><i className="legend-dot created-dot" />Criadas</span><span><i className="legend-dot completed-dot" />Concluídas</span></div></div>
        <div className="panel stack"><h2>Ordens por status</h2>{analytics.byStatus.length===0?<p className="muted">Sem ordens cadastradas.</p>:analytics.byStatus.map(s=>{const total=Math.max(1,Number(analytics.summary.total));return <div className="metric-line" key={s.status}><div className="spread"><span>{({"pending":"Pendente","in_progress":"Em andamento","completed":"Concluída","blocked":"Bloqueada","cancelled":"Cancelada"} as Record<string,string>)[s.status]||s.status}</span><strong>{s.count}</strong></div><div className="bar-track"><div className="bar status-bar" style={{width:`${Number(s.count)/total*100}%`}} /></div></div>})}<h2 className="subsection-title">Prioridade em aberto</h2>{analytics.byPriority.map(p=><div className="spread metric-line" key={p.priority}><span>{({"critical":"Crítica","high":"Alta","normal":"Normal","low":"Baixa"} as Record<string,string>)[p.priority]||p.priority}</span><strong>{p.count}</strong></div>)}</div>
      </div>
      <div className="analytics-columns">
        <div className="panel stack"><h2>Desempenho por responsável</h2>{analytics.byTechnician.length===0?<p className="muted">Nenhuma atribuição encontrada.</p>:<div className="table-wrap"><table><thead><tr><th>Responsável</th><th>Total</th><th>Concluídas</th><th>Pendentes</th><th>Atrasadas</th></tr></thead><tbody>{analytics.byTechnician.map(t=><tr key={t.username}><td>{t.username}</td><td>{t.total}</td><td>{t.completed}</td><td>{t.pending}</td><td>{t.overdue}</td></tr>)}</tbody></table></div>}</div>
        <div className="panel stack"><h2>Ocorrências por categoria</h2>{analytics.occurrences.length===0?<p className="muted">Nenhuma ocorrência no período.</p>:analytics.occurrences.map((o,i)=><div className="spread metric-line" key={o.category+o.status+i}><span>{o.category}<small className="block-muted">{({"open":"Aberta","investigating":"Em análise","resolved":"Resolvida"} as Record<string,string>)[o.status]||o.status}</small></span><strong>{o.count}</strong></div>)}</div>
      </div>
      <div className="analytics-columns">
        <div className="panel stack"><h2>Importações recentes</h2>{analytics.imports.length===0?<p className="muted">Nenhuma importação registrada.</p>:<div className="table-wrap"><table><thead><tr><th>Arquivo</th><th>Status</th><th>Linhas</th><th>Novas</th><th>Alteradas</th><th>Erros</th></tr></thead><tbody>{analytics.imports.map((item,i)=><tr key={String(item.id??i)}><td>{String(item.filename??"—")}</td><td>{String(item.status??"—")}</td><td>{String(item.total_rows??0)}</td><td>{String(item.created_count??0)}</td><td>{String(item.updated_count??0)}</td><td>{String(item.error_count??0)}</td></tr>)}</tbody></table></div>}</div>
        <div className="panel stack"><h2>Atividades atualizadas recentemente</h2>{analytics.recentOrders.length===0?<p className="muted">Nenhuma atividade registrada.</p>:analytics.recentOrders.map((o,i)=><div className="recent-order" key={String(o.id??i)}><div className="spread"><strong>{String(o.order_number||"Sem número")}</strong><span className={"status-pill status-"+String(o.status)}>{({"pending":"Pendente","in_progress":"Em andamento","completed":"Concluída","blocked":"Bloqueada","cancelled":"Cancelada"} as Record<string,string>)[String(o.status)]||String(o.status)}</span></div><div>{String(o.title)}</div><small className="block-muted">{String(o.assigned_username||"Não atribuído")} · {String(o.priority)}</small></div>)}</div>
      </div>
      </>}
    </section>}
    {current==="orders"&&<section className="panel stack"><div className="spread"><div><h2>Atividades</h2><p className="muted">{orders.length} {orders.length===1?"atividade":"atividades"}</p></div><button className="btn ghost" onClick={()=>void load()}>Atualizar</button></div>{orders.length===0?<p className="muted">Nenhuma atividade disponível. Um administrador pode importar uma planilha.</p>:<ul className="order-list">{orders.map(o=>{const number=o.order_number||"Sem número";const showTitle=o.title&&!o.title.includes(o.order_number??"\u0000");return <li className="order-item" key={o.id}><div className="order-main"><div className="order-head"><strong className="order-number">{number}</strong><span className={"status-pill status-"+o.status}>{STATUS_LABEL[o.status]||o.status}</span>{o.priority&&o.priority!=="normal"&&<span className={"priority priority-"+o.priority}>{PRIORITY_LABEL[o.priority]||o.priority}</span>}</div>{showTitle&&<div className="order-title">{o.title}</div>}{o.description&&<div className="muted">{o.description}</div>}{(o.location||o.equipment)&&<div className="order-meta">{[o.location,o.equipment].filter(Boolean).join(" · ")}</div>}</div>{o.status!=="completed"&&<div className="order-actions">{o.status!=="in_progress"&&<button className="btn sm secondary" onClick={()=>void updateStatus(o,"in_progress")}>Iniciar</button>}<button className="btn sm" onClick={()=>void updateStatus(o,"completed")}>Concluir</button>{o.status!=="blocked"&&<button className="btn sm ghost" onClick={()=>void updateStatus(o,"blocked")}>Bloquear</button>}<button className="btn sm ghost" onClick={()=>void reportOccurrence(o)}>Ocorrência</button></div>}{o.status==="completed"&&<span className="locked">Concluída · bloqueada para edição</span>}</li>;})}</ul>}</section>}
    {admin&&current==="import"&&<section className="panel stack"><h2>Importar atividades</h2><p className="muted">Envie uma planilha .xlsx, .xls ou .csv. Primeiro vamos validar e mostrar a prévia; nada muda até você confirmar.</p><input className="field" type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]??null);setSummary(null)}}/><div className="row"><button className="btn secondary" disabled={busy||!file} onClick={()=>void importFile(false)}>Analisar planilha</button>{summary&&<button className="btn" disabled={busy||!file} onClick={()=>void importFile(true)}>Confirmar importação</button>}</div>{summary&&<><div className="grid"><div><div className="muted">Linhas</div><div className="stats">{summary.total}</div></div><div><div className="muted">Novas</div><div className="stats">{summary.new}</div></div><div><div className="muted">Alteradas</div><div className="stats">{summary.changed}</div></div></div><div className="notice">{summary.completedPreserved} ordem(ns) já concluídas serão mantidas como concluídas.</div><p className="muted">{summary.unchanged} sem alteração · {summary.notInFile} ordens existentes não aparecem nesta planilha e não serão excluídas.</p><div className="table-wrap"><table><thead><tr><th>Ação</th><th>Ordem</th><th>Atividade</th><th>Responsável</th><th>Prioridade</th></tr></thead><tbody>{summary.preview.map((r,i)=><tr key={i}><td>{String(r.action)}</td><td>{String(r.order||"—")}</td><td>{String(r.title)}</td><td>{String(r.assigned||"—")}</td><td>{String(r.priority)}</td></tr>)}</tbody></table></div></>}</section>}
    {admin&&current==="users"&&<section className="stack">
      <div className="dashboard-heading"><h1>Pessoas e acessos</h1><p className="muted">Pessoas que aparecem na planilha e quem já tem acesso ao Gera. Clique em um nome para ver o relatório.</p></div>
      {created&&<div className="notice stack"><strong>Credenciais de {created.username} — copie agora, elas não serão exibidas de novo</strong><div>Login: <code>{created.username}</code></div><div>Senha provisória: <code>{created.temporaryPassword}</code></div><div className="row"><button className="btn secondary" onClick={()=>void navigator.clipboard?.writeText(`Login: ${created.username}\nSenha provisória: ${created.temporaryPassword}`)}>Copiar credenciais</button><button className="btn ghost" onClick={()=>setCreated(null)}>Fechar</button></div></div>}
      <div className="split">
        <div className="panel stack"><div className="spread"><h2>Pessoas da planilha</h2>{people&&<span className="muted">{people.people.filter(p=>!p.registered).length} sem cadastro</span>}</div>
          {!people?<p className="muted">Carregando…</p>:people.people.length===0?<p className="muted">Nenhuma pessoa encontrada. Importe uma planilha primeiro.</p>:<div className="table-wrap"><table><thead><tr><th>Nome na planilha</th><th>Login</th><th className="num">Ordens</th><th className="num">Concluídas</th><th>Situação</th><th></th></tr></thead><tbody>{people.people.map(p=><tr key={p.username}><td><button className="link" onClick={()=>void openPerson(p.username)}>{p.sheet_name||p.username}</button></td><td className="muted">{p.username}</td><td className="num">{p.total}</td><td className="num">{p.completed}</td><td>{p.registered?<span className="status-pill status-completed">Cadastrado</span>:<span className="status-pill status-blocked">Sem cadastro</span>}</td><td className="num">{p.registered?<button className="btn sm ghost" onClick={()=>void resetPassword(p.username)}>Redefinir senha</button>:<button className="btn sm" onClick={()=>startRegistration(p.suggestedName)}>Cadastrar</button>}</td></tr>)}</tbody></table></div>}
        </div>
        <div className="stack">
          <div className="panel stack" id="new-user"><h2>Novo acesso</h2><p className="muted">O login é gerado pelo nome (nome.sobrenome) e deve bater com o da planilha. A senha provisória aparece uma única vez e a troca é exigida no primeiro acesso.</p><form className="stack" onSubmit={createUser}><div><label className="label">Nome completo</label><input id="new-user-name" className="field" value={name} onChange={e=>setName(e.target.value)} placeholder="Nome Sobrenome" required /></div>{user.role==="super_admin"&&<div><label className="label">Perfil</label><select className="field" value={newRole} onChange={e=>setNewRole(e.target.value as "admin"|"technician")}><option value="technician">Técnico</option><option value="admin">Administrador</option></select></div>}<button className="btn" disabled={busy}>{busy?"Criando…":"Gerar acesso"}</button></form></div>
          {people&&people.users.length>0&&<div className="panel stack"><h2>Acessos cadastrados</h2><ul className="plain-list">{people.users.map(u=><li key={u.username} className="spread"><div><button className="link" onClick={()=>void openPerson(u.username)}>{u.display_name}</button><div className="muted">{u.username} · {u.role==="super_admin"?"Admin principal":u.role==="admin"?"Administrador":"Técnico"}{u.must_change_password?" · aguardando 1º acesso":""}</div></div>{u.username!==user.username&&<button className="btn sm ghost" onClick={()=>void resetPassword(u.username)}>Redefinir senha</button>}</li>)}</ul></div>}
        </div>
      </div>
    </section>}
    {admin&&current==="person"&&<section className="stack">
      <div className="spread dashboard-heading"><div><button className="link" onClick={()=>go("users")}>← Pessoas e acessos</button><h1>{report?.profile?.display_name||report?.orders[0]?.sheet_name||report?.username||"Relatório"}</h1><p className="muted">{report?.username}{report&&!report.profile?" · sem acesso cadastrado":""}</p></div><div className="row">{report&&<button className="btn ghost" onClick={()=>window.print()}>Imprimir / PDF</button>}</div></div>
      {!report?<div className="panel">Carregando relatório…</div>:<>
        <div className="grid kpi-grid six">
          <div className="panel kpi"><span className="muted">Ordens</span><strong className="stats">{report.summary.total}</strong></div>
          <div className="panel kpi"><span className="muted">Concluídas</span><strong className="stats">{report.summary.completed}</strong><span className="kpi-note">{report.summary.total?Math.round(report.summary.completed/report.summary.total*100):0}% do total</span></div>
          <div className="panel kpi"><span className="muted">Pendentes</span><strong className="stats">{report.summary.pending}</strong></div>
          <div className="panel kpi"><span className="muted">Em andamento</span><strong className="stats">{report.summary.in_progress}</strong></div>
          <div className="panel kpi warning-kpi"><span className="muted">Atrasadas</span><strong className="stats">{report.summary.overdue}</strong></div>
          <div className="panel kpi"><span className="muted">Tempo previsto</span><strong className="stats">{formatMinutes(report.summary.minutes)}</strong></div>
        </div>
        <div className="panel stack"><h2>Histórico de ordens</h2>{report.orders.length===0?<p className="muted">Nenhuma ordem atribuída.</p>:<div className="table-wrap"><table><thead><tr><th>Ordem</th><th>Atividade</th><th>Local</th><th>Data</th><th className="num">Tempo</th><th>Status</th><th>Concluída em</th></tr></thead><tbody>{report.orders.map(o=><tr key={o.id}><td>{o.order_number||"—"}</td><td>{o.title}</td><td className="muted">{o.location||"—"}</td><td>{o.scheduled_for?new Date(String(o.scheduled_for).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td className="num">{formatMinutes(o.work_minutes)}</td><td><span className={"status-pill status-"+o.status}>{STATUS_LABEL[o.status]||o.status}</span></td><td>{o.completed_at?new Date(o.completed_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—"}</td></tr>)}</tbody></table></div>}</div>
        <div className="panel stack"><h2>Ocorrências</h2>{report.occurrences.length===0?<p className="muted">Nenhuma ocorrência registrada.</p>:<ul className="plain-list">{report.occurrences.map((o,i)=><li key={i}><strong>{o.category}</strong> · ordem {o.order_number||"—"} · {new Date(o.created_at).toLocaleDateString("pt-BR")}<div className="muted">{o.description}</div></li>)}</ul>}</div>
      </>}
    </section>}
    {current==="security"&&<section className="panel stack" style={{maxWidth:620}}><h2>Segurança da conta</h2><p className="muted">Altere sua senha a qualquer momento. Use uma senha única com pelo menos 12 caracteres.</p><form className="stack" onSubmit={changePassword}><div><label className="label">Senha atual</label><input className="field" type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required /></div><div><label className="label">Nova senha (mínimo 12 caracteres)</label><input className="field" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Salvando…":"Alterar senha"}</button></form></section>}
    </main>
  </div>;
}
