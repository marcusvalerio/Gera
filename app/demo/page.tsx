"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type DemoOrder = { name:string; order:string; date:string; week:string; indicator:string; location:string; text:string; minutes:number; status:string };
const initial: DemoOrder[] = [
 {name:"JOEL KLIMASCHEVISKI DA SILVA",order:"100002999367",date:"07/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-ENCHEDORA 01 -ECH512005",text:"20C-QA-0-01-Inspe. encosto dos pratos",minutes:120,status:"Pendente"},
 {name:"JOEL KLIMASCHEVISKI DA SILVA",order:"100003711040",date:"07/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-ENCHEDORA 01 -ECH512005",text:"720H-QA-0-03-Limpeza da carcaça e troca",minutes:120,status:"Pendente"},
 {name:"JOEL KLIMASCHEVISKI DA SILVA",order:"100004011139",date:"07/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-ENCHEDORA 01 -ECH512005",text:"QA-0-97-Insp. Válv enchimento",minutes:180,status:"Pendente"},
 {name:"LUIZ GUILHERME JESUS DE FREITAS",order:"100003984163",date:"07/10/2026",week:"",indicator:"",location:"N3-05120-TRANSP PZ-EPC 01 -TRP512150",text:"P2S-Insp transportadores teste da bexiga",minutes:120,status:"Pendente"},
 {name:"EQUIPE TRP",order:"100004472816",date:"07/10/2026",week:"",indicator:"",location:"N3-05120-TRANSP EPC-PL 01 -R512330",text:"Subst. ou Vulcanizar o Tapete do M330",minutes:120,status:"Pendente"},
 {name:"WESLEY DA SILVA CORREA PEREIRA",order:"100004487913",date:"07/10/2026",week:"",indicator:"",location:"N3-05120-PASTEURIZADOR 01 -PZ512193",text:"Check na integridade do machado no piso",minutes:120,status:"Pendente"},
 {name:"RENATO TRIGUEIRO DOS REIS",order:"100003970654",date:"08/10/2026",week:"",indicator:"",location:"N3-05120-EMPACOTADORA 02 -EPC512002",text:"Vazamento ar comprimido na haste do cili",minutes:180,status:"Pendente"},
 {name:"SERGIO SILVA BELARMINO",order:"100004590288",date:"08/10/2026",week:"",indicator:"",location:"N3-05120-PALETIZADORA 02",text:"Recuperação de rolo tapete liso.",minutes:120,status:"Pendente"},
 {name:"KLAUS TEIXEIRA SCHMITT AVILA",order:"100004559178",date:"08/10/2026",week:"",indicator:"",location:"N3-05120-PASTEURIZADOR 01 -PZ512001",text:"Reparo Piso Danificado - PZ 512",minutes:60,status:"Pendente"},
 {name:"LUIZ GUILHERME JESUS DE FREITAS",order:"100004566030",date:"09/10/2026",week:"",indicator:"",location:"N3-05120-INSPETOR NIVEL 03",text:"Limpeza heuft lado sul 1 e sul 2",minutes:60,status:"Pendente"},
 {name:"HIGOR PEREIRA GUSMÃO",order:"100003572591",date:"09/10/2026",week:"",indicator:"",location:"N3-05120-PASTEURIZADOR 01 -PZ512001",text:"RETIRAR FORCE DOS SENSORES S921 E S923.",minutes:60,status:"Pendente"},
 {name:"MAURO AVELINO DA SILVA",order:"100003983903",date:"09/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-PASTEURIZADOR 01 -B512027",text:"1440H- Insp. bomba da cisterna PZ",minutes:120,status:"Pendente"},
 {name:"RENATO TRIGUEIRO DOS REIS",order:"100004529681",date:"10/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-EMPACOTADORA 01",text:"troca de acrílicos das portas da EPC/KHS",minutes:120,status:"Pendente"},
 {name:"STHERKINNE MARTINS CORREA",order:"100003968386",date:"10/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-ENCHEDORA 01 -ECH512005",text:"QA-1-24 Revisão das válvulas enchimento",minutes:1080,status:"Pendente"},
 {name:"STHERKINNE MARTINS CORREA",order:"100004034178",date:"10/10/2026",week:"S01",indicator:"P3M",location:"N3-05120-ENCHEDORA 01 -ECH512005",text:"QA-1-24 Revisão das válvulas enchimento",minutes:1080,status:"Pendente"},
];
const mins=(n:number)=>`${Math.floor(n/60)}h ${String(n%60).padStart(2,"0")}min`;
const norm=(v:unknown)=>String(v??"").trim();
export default function DemoPage(){
 const [orders,setOrders]=useState<DemoOrder[]>(initial);
 const [tab,setTab]=useState("dashboard");
 const [query,setQuery]=useState("");
 const [day,setDay]=useState("all");
 const [person,setPerson]=useState("all");
 const [fileName,setFileName]=useState("");
 const [importNote,setImportNote]=useState("Exibindo amostra demonstrativa baseada nas linhas visíveis da planilha enviada.");
 const [preview,setPreview]=useState<DemoOrder[]|null>(null);
 const [showAll,setShowAll]=useState(false);
 const people=useMemo(()=>Array.from(new Set(orders.map(o=>o.name))).sort(),[orders]);
 const days=useMemo(()=>Array.from(new Set(orders.map(o=>o.date))).sort(),[orders]);
 const filtered=orders.filter(o=>(person==="all"||o.name===person)&&(day==="all"||o.date===day)&&[o.name,o.order,o.location,o.text].join(" ").toLowerCase().includes(query.toLowerCase()));
 const totalMinutes=orders.reduce((s,o)=>s+o.minutes,0);
 const done=orders.filter(o=>o.status==="Concluída").length;
 async function handleFile(file?:File){
   if(!file)return;
   setFileName(file.name);setImportNote("Lendo arquivo localmente para gerar uma prévia. Nenhum dado será enviado ou salvo.");
   try{
    const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:"array",cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""});
    if(!rows.length)throw new Error("Não encontrei linhas de dados na primeira aba.");
    const key=(r:Record<string,unknown>,aliases:string[])=>{const entries=Object.entries(r);for(const a of aliases){const found=entries.find(([k])=>k.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()===a.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase());if(found&&norm(found[1]))return found[1]}return ""};
    const mapped=rows.map((r,i)=>{const d=key(r,["Data","data"]);let date="";if(d instanceof Date)date=d.toLocaleDateString("pt-BR");else if(typeof d==="number"){const dt=XLSX.SSF.parse_date_code(d);date=dt?`${String(dt.d).padStart(2,"0")}/${String(dt.m).padStart(2,"0")}/${dt.y}`:""}else date=norm(d);
     const rawMin=Number(String(key(r,["Trabalho","trabalho"])).replace(",","."))||0;
     return {name:norm(key(r,["Nome","nome"]))||"Sem técnico",order:norm(key(r,["Ordem","ordem"]))||String(i+1),date,week:norm(key(r,["Semana","semana"])),indicator:norm(key(r,["Indicador","indicador"])),location:norm(key(r,["Loc.instalação","Local de instalação","Loc instalação"])),text:norm(key(r,["Texto breve","txt","Texto"]))||"Atividade sem descrição",minutes:rawMin,status:"Pendente"} as DemoOrder;});
    setPreview(mapped);setImportNote(`Prévia local pronta: ${mapped.length} linhas reconhecidas. Nenhuma alteração foi gravada no sistema.`);setTab("import");
   }catch(e){setPreview(null);setImportNote(e instanceof Error?e.message:"Não foi possível ler a planilha.");}
 }
 const shown=preview??filtered;
 return <main className="shell" style={{maxWidth:1440}}>
  <header className="header"><div><div className="brand">gera<span style={{color:"var(--accent)"}}>.</span></div><div className="muted">Ordens do Dia · Gestão de atividades</div></div><div className="row"><span style={{background:"#e7f7ed",color:"#16794b",borderRadius:999,padding:"7px 11px",fontSize:12,fontWeight:700}}>PREVIEW · DEMONSTRAÇÃO</span><span className="muted">Dados isolados · sem gravação</span></div></header>
  <div className="notice" style={{marginBottom:18}}>Ambiente de apresentação. A tabela inicial é uma amostra das linhas visíveis na imagem fornecida. A importação abaixo lê o arquivo neste navegador e não envia dados ao banco.</div>
  <nav className="tabs">{[["dashboard","Visão geral"],["orders","Ordens"],["import","Importar planilha"],["people","Técnicos"]].map(([id,label])=><button key={id} className={`tab ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  {tab==="dashboard"&&<div className="stack">
   <div><h1 style={{margin:"0 0 5px",fontSize:28}}>Visão geral</h1><div className="muted">Resumo operacional da amostra importada</div></div>
   <section className="grid">{[[ "Ordens na amostra",orders.length,"Ordens identificadas"],["Técnicos / equipes",people.length,"Responsáveis distintos"],["Carga de trabalho",mins(totalMinutes),"Soma das durações"],["Concluídas",done,`${orders.length-done} ainda pendentes`],["Locais / equipamentos",new Set(orders.map(o=>o.location)).size,"Pontos de instalação"],["Datas programadas",days.length,"Dias com ordens"]].map(([label,value,sub])=><div className="panel" key={String(label)}><div className="muted">{label}</div><div className="stats">{value}</div><div className="muted" style={{marginTop:8}}>{sub}</div></div>)}</section>
   <section className="panel"><div className="spread"><div><h2 style={{margin:0,fontSize:18}}>Próximas ordens da amostra</h2><p className="muted">Dados demonstrativos derivados da captura da planilha.</p></div><button className="btn secondary" onClick={()=>setTab("orders")}>Ver todas as ordens →</button></div><OrdersTable rows={orders.slice(0,6)}/></section>
   <section className="panel"><h2 style={{marginTop:0,fontSize:18}}>Carga por técnico</h2><div className="stack">{people.map(p=>{const rows=orders.filter(o=>o.name===p);const m=rows.reduce((s,o)=>s+o.minutes,0);return <div key={p}><div className="spread"><span style={{fontWeight:600,fontSize:13}}>{p}</span><span className="muted">{rows.length} ordens · {mins(m)}</span></div><div style={{height:7,background:"#edf0f5",borderRadius:99,marginTop:7,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(3,m/Math.max(1,totalMinutes)*100)}%`,background:"var(--accent)",borderRadius:99}}/></div></div>})}</div></section>
  </div>}
  {tab==="orders"&&<section className="panel stack"><div><h1 style={{margin:"0 0 5px",fontSize:26}}>Ordens de serviço</h1><p className="muted">Pesquise e filtre a amostra por técnico e data.</p></div><div className="row"><input className="field" style={{flex:"2 1 240px"}} placeholder="Buscar ordem, atividade, local ou técnico…" value={query} onChange={e=>setQuery(e.target.value)}/><select className="field" style={{flex:"1 1 180px"}} value={person} onChange={e=>setPerson(e.target.value)}><option value="all">Todos os técnicos</option>{people.map(p=><option key={p}>{p}</option>)}</select><select className="field" style={{flex:"1 1 150px"}} value={day} onChange={e=>setDay(e.target.value)}><option value="all">Todas as datas</option>{days.map(d=><option key={d}>{d}</option>)}</select></div><div className="muted">{filtered.length} ordens encontradas · alteração de status apenas nesta demonstração</div><OrdersTable rows={filtered} onStatus={(order,status)=>setOrders(old=>old.map(o=>o.order===order?{...o,status}:o))}/></section>}
  {tab==="import"&&<section className="panel stack"><div><h1 style={{margin:"0 0 5px",fontSize:26}}>Importar planilha</h1><p className="muted">Selecione o Excel ou CSV original para conferir como o Gera interpreta as colunas.</p></div><label style={{border:"1.5px dashed #cbd5e1",borderRadius:14,padding:28,textAlign:"center",display:"block",cursor:"pointer"}}><div style={{fontSize:30,marginBottom:8}}>⇧</div><strong>Escolher arquivo .xlsx, .xls ou .csv</strong><p className="muted">{fileName||"A leitura acontece localmente neste navegador."}</p><input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>void handleFile(e.target.files?.[0])}/></label><div className="notice">{importNote}</div>{preview&&<><div className="spread"><strong>Prévia da planilha selecionada</strong><button className="btn ghost" onClick={()=>{setPreview(null);setFileName("");setImportNote("Exibindo amostra demonstrativa baseada nas linhas visíveis da planilha enviada.")}}>Voltar à amostra</button></div><div className="muted">{preview.length} linhas · {new Set(preview.map(o=>o.name)).size} técnicos/equipes · {mins(preview.reduce((s,o)=>s+o.minutes,0))} de trabalho estimado</div><OrdersTable rows={preview.slice(0,showAll?preview.length:100)}/>{preview.length>100&&<button className="btn secondary" onClick={()=>setShowAll(!showAll)}>{showAll?"Mostrar menos":"Mostrar todas as linhas"}</button>}</>}</section>}
  {tab==="people"&&<section className="panel stack"><h1 style={{margin:0,fontSize:26}}>Técnicos e equipes</h1><p className="muted">Distribuição demonstrativa de ordens e minutos por responsável.</p><div className="table-wrap"><table><thead><tr><th>Técnico / equipe</th><th>Ordens</th><th>Carga</th><th>Locais distintos</th></tr></thead><tbody>{people.map(p=>{const r=orders.filter(o=>o.name===p);return <tr key={p}><td style={{fontWeight:600}}>{p}</td><td>{r.length}</td><td>{mins(r.reduce((s,o)=>s+o.minutes,0))}</td><td>{new Set(r.map(o=>o.location)).size}</td></tr>})}</tbody></table></div></section>}
  <footer className="muted" style={{textAlign:"center",padding:"28px 0"}}>Gera · ambiente de demonstração · nenhuma alteração na produção</footer>
 </main>
}
function OrdersTable({rows,onStatus}:{rows:DemoOrder[];onStatus?:(order:string,status:string)=>void}){
 return <div className="table-wrap"><table><thead><tr><th>Ordem</th><th>Data</th><th>Técnico</th><th>Local de instalação</th><th>Texto breve / atividade</th><th>Trabalho</th><th>Status demo</th></tr></thead><tbody>{rows.map((o,i)=><tr key={o.order+"-"+i}><td style={{fontWeight:700,whiteSpace:"nowrap"}}>{o.order}</td><td style={{whiteSpace:"nowrap"}}>{o.date}</td><td>{o.name}</td><td>{o.location}</td><td>{o.text}<div className="muted">{o.week}{o.indicator?` · ${o.indicator}`:""}</div></td><td style={{whiteSpace:"nowrap"}}>{mins(o.minutes)}</td><td>{onStatus?<select aria-label={`Status da ordem ${o.order}`} value={o.status} onChange={e=>onStatus(o.order,e.target.value)} className="field" style={{minWidth:130,padding:7}}>{["Pendente","Em andamento","Concluída","Bloqueada"].map(s=><option key={s}>{s}</option>)}</select>:<span style={{background:"#fff4e5",color:"#8a5a00",padding:"5px 8px",borderRadius:999,fontSize:12}}>{o.status}</span>}</td></tr>)}</tbody></table></div>
}
