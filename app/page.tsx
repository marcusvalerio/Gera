"use client";
import { useCallback, useEffect, useState } from "react";
import { createAuthClient } from "@neondatabase/auth/next";
import { loginEmail, makeUsername } from "@/lib/username";

const authClient = createAuthClient();
type Profile = { username:string; display_name:string; role:"super_admin"|"admin"|"technician"; must_change_password:boolean };
type Order = { id:string; order_number:string|null; title:string; description:string|null; location:string|null; equipment:string|null; priority:string; status:string; assigned_username:string|null; scheduled_for:string|null };
type Summary = { total:number; new:number; changed:number; unchanged:number; existing:number; notInFile:number; completedPreserved:number; preview:Array<Record<string,unknown>> };
type Analytics = { periodDays:number; summary:Record<string,number>; byStatus:Array<{status:string;count:number}>; byPriority:Array<{priority:string;count:number}>; trend:Array<{day:string;created:number;completed:number}>; byTechnician:Array<{username:string;total:number;completed:number;pending:number;overdue:number}>; occurrences:Array<{category:string;status:string;count:number}>; imports:Array<Record<string,unknown>>; recentOrders:Array<Record<string,unknown>> };

export default function Home() {
  const [user,setUser] = useState<Profile|null>(null);
  const [orders,setOrders] = useState<Order[]>([]);
  const [setupRequired,setSetupRequired] = useState(false);
  const [setupName,setSetupName] = useState("Anderson Motta");
  const [setupEmail,setSetupEmail] = useState("Anderson.motta95@yahoo.com.br");
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
  const [tab,setTab] = useState<"dashboard"|"orders"|"import"|"users">("dashboard");
  const [analytics,setAnalytics] = useState<Analytics|null>(null);
  const [periodDays,setPeriodDays] = useState(30);
  const [analyticsBusy,setAnalyticsBusy] = useState(false);
  const [ready,setReady] = useState(false);

  const load = useCallback(async () => {
    const me = await fetch("/api/me");
    if (!me.ok) { setUser(null); const setup = await fetch("/api/setup/status"); if (setup.ok) setSetupRequired(Boolean((await setup.json()).setupRequired)); setReady(true); return; }
    const payload = await me.json();
    setUser(payload.user);
    if (!payload.user.must_change_password) {
      const res = await fetch("/api/orders");
      if (res.ok) setOrders((await res.json()).orders);
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
        if (existingSignIn.error) throw new Error(created.error.message || "Não foi possível criar a conta inicial.");
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
      const result = await authClient.signIn.email({ email: username.includes("@") ? username : loginEmail(username), password });
      if (result.error) throw new Error(result.error.message || "Login ou senha inválidos.");
      setPassword(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  async function loadAnalytics(days = periodDays) {
    setAnalyticsBusy(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar os indicadores.");
      setAnalytics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dashboard.");
    } finally {
      setAnalyticsBusy(false);
    }
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
      const res = await fetch("/api/me/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});
      const data = await res.json(); if(!res.ok) throw new Error(data.error || "Falha ao trocar senha.");
      setCurrentPassword("");setNewPassword("");setMessage("Senha atualizada. Seu acesso está liberado.");await load();
    } catch(e) {setError(e instanceof Error?e.message:"Falha ao trocar senha.");}
    finally {setBusy(false);}
  }
  async function updateStatus(order:Order,status:"in_progress"|"completed"|"blocked") {
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
  async function createUser(e:React.FormEvent) {
    e.preventDefault();setError("");setMessage("");setCreated(null);setBusy(true);
    try {
      const res=await fetch("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,role:newRole})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Falha ao cadastrar usuário.");
      setCreated({username:data.user.username,temporaryPassword:data.temporaryPassword});setName("");setMessage("Cadastro criado. Copie a senha provisória agora.");
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
      <form className="stack" onSubmit={bootstrap}><div><label className="label">Nome completo</label><input className="field" autoComplete="name" value={setupName} onChange={e=>setSetupName(e.target.value)} placeholder="Seu nome e sobrenome" required /></div><div><label className="label">E-mail do administrador</label><input className="field" type="email" autoComplete="email" value={setupEmail} onChange={e=>setSetupEmail(e.target.value)} required /></div><div><label className="label">Senha inicial (mínimo 12 caracteres)</label><input className="field" type="password" autoComplete="new-password" minLength={12} value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} required /></div><div><label className="label">Código de configuração</label><input className="field" type="password" value={setupSecret} onChange={e=>setSetupSecret(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Configurando…":"Criar administrador principal"}</button></form><p className="muted">Antes de abrir o sistema, configure GERA_BOOTSTRAP_SECRET na Vercel com um segredo aleatório de pelo menos 20 caracteres. Você poderá entrar usando seu e-mail ou o login gerado pelo nome.</p></>:<><div><h1>Entrar no Gera</h1><p className="muted">Use o login fornecido pelo administrador.</p></div>
      <form className="stack" onSubmit={signIn}><div><label className="label">Login</label><input className="field" autoComplete="username" value={login} onChange={e=>setLogin(e.target.value)} placeholder="anderson.motta95@yahoo.com.br ou anderson.motta" required /></div><div><label className="label">Senha</label><input className="field" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Entrando…":"Entrar"}</button></form><p className="muted">O acesso é criado por um administrador. Não há cadastro público.</p></>}</section>
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
}</main>;
  if(user.must_change_password) return <main className="shell" style={{maxWidth:520,paddingTop:"8vh"}}><section className="panel stack"><div className="brand">Primeiro acesso</div><h1>Crie sua senha pessoal</h1><p className="muted">Por segurança, você precisa substituir a senha provisória antes de acessar suas atividades.</p><form className="stack" onSubmit={changePassword}><div><label className="label">Senha provisória atual</label><input className="field" type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required /></div><div><label className="label">Nova senha (mínimo 12 caracteres)</label><input className="field" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></div><button className="btn" disabled={busy}>{busy?"Salvando…":"Salvar nova senha"}</button></form>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}</section></main>;

  const admin = user.role!=="technician";
  return <main className="shell"><header className="header"><div><div className="brand">gera<span style={{color:"var(--accent)"}}>.</span></div><div className="muted">Ordens do Dia · Olá, {user.display_name}</div></div><div className="row"><span className="muted">{user.role==="super_admin"?"Administrador principal":admin?"Administrador":"Técnico"}</span><button className="btn ghost" onClick={signOut}>Sair</button></div></header>
    <section className="grid"><div className="panel"><div className="muted">Atividades visíveis</div><div className="stats">{orders.length}</div></div><div className="panel"><div className="muted">Em andamento</div><div className="stats">{orders.filter(o=>o.status==="in_progress").length}</div></div><div className="panel"><div className="muted">Concluídas</div><div className="stats">{orders.filter(o=>o.status==="completed").length}</div></div></section>
    {admin&&<nav className="tabs"><button className={"tab "+(tab==="dashboard"?"active":"")} onClick={()=>{setTab("dashboard");void loadAnalytics();}}>Dashboard</button><button className={"tab "+(tab==="orders"?"active":"")} onClick={()=>setTab("orders")}>Atividades</button><button className={"tab "+(tab==="import"?"active":"")} onClick={()=>setTab("import")}>Importar Excel</button><button className={"tab "+(tab==="users"?"active":"")} onClick={()=>setTab("users")}>Usuários</button></nav>}
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    {admin&&tab==="dashboard"&&<section className="stack">
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
    </section>
    {(!admin||tab==="orders")&&<section className="panel stack"><div className="spread"><h2>Atividades</h2><button className="btn ghost" onClick={()=>void load()}>Atualizar</button></div>{orders.length===0?<p className="muted">Nenhuma atividade disponível. Um administrador pode importar uma planilha.</p>:<div className="table-wrap"><table><thead><tr><th>Ordem / Atividade</th><th>Local / Equipamento</th><th>Prioridade</th><th>Status</th><th>Ação</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>{o.order_number||"Sem número"} · {o.title}</strong><div className="muted">{o.description}</div></td><td>{o.location||"—"}<div className="muted">{o.equipment||"—"}</div></td><td>{o.priority}</td><td>{o.status}</td><td>{o.status!=="completed"&&<div className="row"><button className="btn secondary" onClick={()=>void updateStatus(o,"in_progress")}>Iniciar</button><button className="btn" onClick={()=>void updateStatus(o,"completed")}>Concluir</button><button className="btn ghost" onClick={()=>void updateStatus(o,"blocked")}>Bloquear</button><button className="btn ghost" onClick={()=>void reportOccurrence(o)}>Ocorrência</button></div>}</td></tr>)}</tbody></table></div>}</section>}
    {admin&&tab==="import"&&<section className="panel stack"><h2>Importar atividades</h2><p className="muted">Envie uma planilha .xlsx, .xls ou .csv. Primeiro vamos validar e mostrar a prévia; nada muda até você confirmar.</p><input className="field" type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]??null);setSummary(null)}}/><div className="row"><button className="btn secondary" disabled={busy||!file} onClick={()=>void importFile(false)}>Analisar planilha</button>{summary&&<button className="btn" disabled={busy||!file} onClick={()=>void importFile(true)}>Confirmar importação</button>}</div>{summary&&<><div className="grid"><div><div className="muted">Linhas</div><div className="stats">{summary.total}</div></div><div><div className="muted">Novas</div><div className="stats">{summary.new}</div></div><div><div className="muted">Alteradas</div><div className="stats">{summary.changed}</div></div></div><div className="notice">{summary.completedPreserved} ordem(ns) já concluídas serão mantidas como concluídas.</div><p className="muted">{summary.unchanged} sem alteração · {summary.notInFile} ordens existentes não aparecem nesta planilha e não serão excluídas.</p><div className="table-wrap"><table><thead><tr><th>Ação</th><th>Ordem</th><th>Atividade</th><th>Responsável</th><th>Prioridade</th></tr></thead><tbody>{summary.preview.map((r,i)=><tr key={i}><td>{String(r.action)}</td><td>{String(r.order||"—")}</td><td>{String(r.title)}</td><td>{String(r.assigned||"—")}</td><td>{String(r.priority)}</td></tr>)}</tbody></table></div></>}</section>}
    {admin&&tab==="users"&&<section className="panel stack"><h2>Cadastrar acesso</h2><p className="muted">O login é gerado pelo nome e a senha provisória é exibida uma única vez. O primeiro acesso exige a troca de senha.</p><form className="stack" onSubmit={createUser}><div><label className="label">Nome completo</label><input className="field" value={name} onChange={e=>setName(e.target.value)} placeholder="Anderson Motta" required /></div>{user.role==="super_admin"&&<div><label className="label">Perfil</label><select className="field" value={newRole} onChange={e=>setNewRole(e.target.value as "admin"|"technician")}><option value="technician">Técnico</option><option value="admin">Administrador</option></select></div>}<button className="btn" disabled={busy}>{busy?"Criando…":"Gerar acesso"}</button></form>{created&&<div className="notice stack"><strong>Acesso criado — copie agora</strong><div>Login: <code>{created.username}</code></div><div>Senha provisória: <code>{created.temporaryPassword}</code></div><button className="btn secondary" onClick={()=>void navigator.clipboard?.writeText(`Login: ${created.username}\nSenha provisória: ${created.temporaryPassword}`)}>Copiar credenciais</button></div>}</section>}
    <footer className="muted" style={{padding:"24px 0"}}>Gera · Ações administrativas são registradas para auditoria.</footer>
  </main>;
}
