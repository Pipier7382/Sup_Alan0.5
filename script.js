/* =========================================================
   SISTEMA ÚNICO DA SUPERINTENDÊNCIA
   - login: tipo + nome + senha
   - corretor: próprios dados
   - gerente: própria equipe
   - superintendente: todas as gerências
   ========================================================= */

const SUPABASE_URL = 'https://vuvukfpqiuhdjxlthklk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_umfrRCaQp-2dhZ-Fn1ANMw_F411sLKg';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CAMPOS = [
  ['interacoes','Interações'],['negociacoes','Negociações'],
  ['agendamentos','Agendamentos'],['visitas','Visitas'],
  ['propostas','Propostas'],['vendas','Vendas']
];
const PERIODOS = ['12:00','15:00','18:00','21:00'];
const CHAVE_RANK = ['vendas','propostas','visitas','agendamentos','negociacoes','interacoes'];
const DIAS_SEMANA = [['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];

let sessao = localStorage.getItem('sup_token') || '';
let usuario = null;
let dados = null;
let tela = 'inicio';
let filtroInicio = dataHoje();
let filtroFim = dataHoje();
let corretorSelecionado = null;
let semanaSelecionada = inicioDaSemana(dataHoje());

const app = document.getElementById('app');

function dataHoje(){ return new Date().toISOString().slice(0,10); }
function pad2(n){ return n<10?'0'+n:''+n; }
function inicioDaSemana(dataChave){
  const [y,m,d]=dataChave.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const dia=dt.getDay();
  const offset=dia===0?6:dia-1;
  dt.setDate(dt.getDate()-offset);
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
}
function somaDias(dataChave,qtd){
  const [y,m,d]=dataChave.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+qtd);
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
}
function vazioSemana(){ return Object.fromEntries(DIAS_SEMANA.map(([id])=>[id,0])); }
function somaSemana(v){ return DIAS_SEMANA.reduce((s,[id])=>s+n(v?.[id]),0); }
function agendamentoSemanaDe(corretorId,semana){
  return (dados?.agendamentos_semanais||[]).find(a=>a.corretor_id===corretorId&&a.semana_inicio===semana);
}
function br(d){ if(!d)return ''; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function n(v){ return Number(v||0); }
function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function vazio(){ return Object.fromEntries(CAMPOS.map(([id])=>[id,0])); }
function somar(lista){
  const t=vazio();
  (lista||[]).forEach(r=>CAMPOS.forEach(([id])=>t[id]+=n(r[id])));
  return t;
}
function ordenarRank(a,b){
  for(const k of CHAVE_RANK){ const d=n(b[k])-n(a[k]); if(d) return d; }
  return String(a.corretor||'').localeCompare(String(b.corretor||''));
}
function registrosPorCorretor(){
  const map={};
  (dados?.relatorios||[]).forEach(r=>{
    if(!map[r.corretor_id]) map[r.corretor_id]={id:r.corretor_id,nome:r.corretor,gerencia:r.gerencia,linhas:[]};
    map[r.corretor_id].linhas.push(r);
  });
  (dados?.corretores||[]).forEach(c=>{
    if(!map[c.id]) map[c.id]={id:c.id,nome:c.nome,gerencia:c.gerencia,linhas:[]};
  });
  return Object.values(map);
}
function mostrarErro(msg){ alert(msg); }

async function rpc(nome,args){
  const {data,error}=await db.rpc(nome,args);
  if(error) throw error;
  return data;
}

async function login(tipo,nome,senha){
  const r=await rpc('login_usuario',{p_tipo:tipo,p_nome:nome,p_senha:senha});
  sessao=r.token; usuario=r.usuario;
  localStorage.setItem('sup_token',sessao);
  await carregarDados();
  render();
}
async function logout(){
  try{ if(sessao) await rpc('logout_usuario',{p_token:sessao}); }catch(e){}
  localStorage.removeItem('sup_token'); sessao=''; usuario=null; dados=null; renderLogin();
}
async function validarSessao(){
  if(!sessao){ renderLogin(); return; }
  try{
    usuario=await rpc('me_usuario',{p_token:sessao});
    await carregarDados();
    render();
  }catch(e){ localStorage.removeItem('sup_token');sessao='';renderLogin(); }
}
async function carregarDados(){
  dados=await rpc('dados_painel',{p_token:sessao,p_inicio:filtroInicio,p_fim:filtroFim});
}
async function atualizar(){
  await carregarDados(); render();
}

function renderLogin(){
  app.innerHTML=`<div class="login-page">
    <div class="login-card">
      <div class="brand"><div class="logo">🐊</div><h1>Relatório da Superintendência</h1><p>Acesso ao sistema</p></div>
      <form id="loginForm">
        <div class="field"><label>Você é</label>
          <select id="tipo"><option value="corretor">Corretor</option><option value="gerente">Gerente</option><option value="superintendente">Superintendente</option></select>
        </div>
        <div class="field"><label>Nome</label><input id="nome" required autocomplete="username" placeholder="Digite seu nome"></div>
        <div class="field"><label>Senha</label><input id="senha" required type="password" autocomplete="current-password" placeholder="Digite sua senha"></div>
        <button class="btn full">Entrar</button>
        <div id="loginError"></div>
      </form>
      <div class="hint"><b>Dados de teste</b><br>Todos os usuários de teste usam a senha <b>11111</b>.<br>Superintendente: Alan · Gerentes: Gerente 1 a 5 · Corretores: Corretor 1.1 a 5.10</div>
    </div>
  </div>`;
  document.getElementById('loginForm').onsubmit=async e=>{
    e.preventDefault();
    const er=document.getElementById('loginError'); er.innerHTML='';
    try{ await login(document.getElementById('tipo').value,document.getElementById('nome').value,document.getElementById('senha').value); }
    catch(err){ er.innerHTML=`<div class="error">${esc(err.message||'Falha no login')}</div>`; }
  };
}

function shell(content){
  const tipoLabel={corretor:'Corretor',gerente:'Gerente',superintendente:'Superintendente'}[usuario.tipo];
  app.innerHTML=`<div class="shell"><header class="topbar">
    <div><div class="title">🐊 Superintendência</div><div style="font-size:11px;opacity:.7">${tipoLabel}</div></div>
    <div class="userbox"><span>${esc(usuario.nome)}</span><button class="btn secondary" id="sair">Sair</button></div>
  </header><main class="layout">${content}</main></div>`;
  document.getElementById('sair').onclick=logout;
}

function nav(){
  const itens=usuario.tipo==='corretor'
    ? [['inicio','📊 Meu painel'],['lancamento','✏️ Lançamento'],['agenda','📅 Agendamentos']]
    : usuario.tipo==='gerente'
    ? [['inicio','📊 Minha equipe'],['lancamento','✏️ Lançamento'],['agenda','📅 Agendamentos']]
    : [['inicio','🏢 Visão geral']];
  return `<div class="nav">${itens.map(([id,t])=>`<button class="${tela===id?'active':''}" data-nav="${id}">${t}</button>`).join('')}</div>`;
}
function bindNav(){ document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{tela=b.dataset.nav;render();}); }

function filtros(){
  return `<div class="toolbar">
    <label>De <input id="fInicio" type="date" value="${filtroInicio}"></label>
    <label>Até <input id="fFim" type="date" value="${filtroFim}"></label>
    <button class="btn" id="filtrar">Atualizar</button>
    <button class="btn secondary" id="hoje">Hoje</button>
  </div>`;
}
function cards(t){
  return `<div class="cards">${CAMPOS.map(([id,l])=>`<div class="card"><div class="label">${l}</div><div class="value">${n(t[id])}</div></div>`).join('')}</div>`;
}
function bindFiltros(){
  document.getElementById('filtrar')?.addEventListener('click',async()=>{
    filtroInicio=document.getElementById('fInicio').value; filtroFim=document.getElementById('fFim').value;
    await atualizar();
  });
  document.getElementById('hoje')?.addEventListener('click',async()=>{filtroInicio=filtroFim=dataHoje();await atualizar();});
}

function renderCorretor(){
  const lista=(dados.relatorios||[]).filter(r=>r.corretor_id===usuario.corretor_id);
  const t=somar(lista);
  shell(`${nav()}<h1>Meu painel</h1>${filtros()}${cards(t)}
    <div class="panel"><h2>Resumo por período</h2>${tabelaPeriodos(lista)}</div>`);
  bindNav();bindFiltros();
}
function tabelaPeriodos(lista){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Período</th>${CAMPOS.map(x=>`<th>${x[1]}</th>`).join('')}</tr></thead><tbody>
  ${PERIODOS.map(p=>{const t=somar(lista.filter(r=>r.periodo===p));return `<tr><td><b>${p}</b></td>${CAMPOS.map(([id])=>`<td>${t[id]}</td>`).join('')}</tr>`}).join('')}
  </tbody></table></div>`;
}

function renderGerente(){
  const equipe=registrosPorCorretor();
  const ranked=equipe.map(c=>({corretor:c.nome,gerencia:c.gerencia,...somar(c.linhas)})).sort(ordenarRank);
  const total=somar(dados.relatorios||[]);
  shell(`${nav()}<h1>${esc(usuario.nome)} — ${esc((dados.corretores||[])[0]?.gerencia||'Minha equipe')}</h1>${filtros()}${cards(total)}
    <div class="panel"><h2>🏆 Ranking da equipe</h2><p class="muted">Critério: Venda → Proposta → Visita → Agendamento → Negociação → Interação.</p>${tabelaRanking(ranked)}</div>
    <div class="panel"><h2>Corretores</h2>${tabelaCorretores(equipe)}</div>
    ${paineisAgendamentosSemanaGerente(equipe)}`);
  bindNav();bindFiltros();bindAgendamentosSemanaGerente();
}
function tabelaRanking(rows){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Corretor</th>${CAMPOS.map(x=>`<th>${x[1]}</th>`).join('')}</tr></thead><tbody>
  ${rows.map((r,i)=>`<tr><td class="rank">${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td><b>${esc(r.corretor)}</b></td>${CAMPOS.map(([id])=>`<td>${r[id]}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function tabelaCorretores(equipe){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Corretor</th><th>Período</th><th>Data</th>${CAMPOS.map(x=>`<th>${x[1]}</th>`).join('')}</tr></thead><tbody>
  ${equipe.flatMap(c=>c.linhas).sort((a,b)=>a.data.localeCompare(b.data)).map(r=>`<tr><td>${esc(r.corretor)}</td><td>${r.periodo}</td><td>${br(r.data)}</td>${CAMPOS.map(([id])=>`<td>${r[id]}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="9" class="empty">Sem lançamentos no período.</td></tr>`}
  </tbody></table></div>`;
}

function renderSuper(){
  const corretores=registrosPorCorretor();
  const gerMap={};
  corretores.forEach(c=>{
    const g=c.gerencia||'Sem gerência';
    if(!gerMap[g]) gerMap[g]=[];
    gerMap[g].push(c);
  });
  const total=somar(dados.relatorios||[]);
  const gerCards=Object.entries(gerMap).sort().map(([g,cs])=>{
    const t=somar(cs.flatMap(c=>c.linhas));
    const ranking=cs.map(c=>({corretor:c.nome,...somar(c.linhas)})).sort(ordenarRank);
    return `<div class="panel manager-card" data-ger="${esc(g)}"><h2>${esc(g)}</h2>${cardsMini(t)}
      <div class="muted" style="margin-top:10px">1º ${esc(ranking[0]?.corretor||'—')} · ${n(ranking[0]?.vendas)} venda(s)</div></div>`;
  }).join('');
  shell(`${nav()}<h1>Visão geral da Superintendência</h1>${filtros()}${cards(total)}
    <div class="grid2">${gerCards}</div>
    <div class="panel"><h2>Ranking geral de corretores</h2>${tabelaRanking(corretores.map(c=>({corretor:c.nome,gerencia:c.gerencia,...somar(c.linhas)})).sort(ordenarRank))}</div>
    ${paineisAgendamentosSemanaGerente(corretores)}`);
  bindNav();bindFiltros();bindAgendamentosSemanaGerente();
}
function cardsMini(t){
  return `<div class="cards" style="margin:0">${CAMPOS.map(([id,l])=>`<div class="card"><div class="label">${l}</div><div class="value" style="font-size:22px">${t[id]}</div></div>`).join('')}</div>`;
}

function renderLancamento(){
  const corretores=dados.corretores||[];
  const meu=usuario.tipo==='corretor'?corretores.find(c=>c.id===usuario.corretor_id):null;
  if(usuario.tipo==='corretor') corretorSelecionado=meu?.id;
  if(!corretorSelecionado) corretorSelecionado=corretores[0]?.id;
  const sel=corretores.map(c=>`<option value="${c.id}" ${c.id===corretorSelecionado?'selected':''}>${esc(c.nome)}${usuario.tipo==='superintendente'||usuario.tipo==='gerente'?' — '+esc(c.gerencia):''}</option>`).join('');
  const d=filtroInicio;
  const linhas=(dados.relatorios||[]).filter(r=>r.corretor_id===corretorSelecionado&&r.data===d);
  const byP=Object.fromEntries(linhas.map(r=>[r.periodo,r]));
  shell(`${nav()}<h1>Lançamento diário</h1>
    <div class="panel"><div class="form-grid">
      <div class="field"><label>Corretor</label><select class="select" id="selCorretor" ${usuario.tipo==='corretor'?'disabled':''}>${sel}</select></div>
      <div class="field"><label>Data</label><input id="dataLanc" type="date" value="${d}"></div>
    </div>
    <div class="period-grid">${PERIODOS.map(p=>periodoForm(p,byP[p])).join('')}</div>
    <button class="btn" id="salvarDia" style="margin-top:14px">Salvar dia</button>
    <button class="btn danger" id="excluirDia" style="margin-top:14px;margin-left:8px">Excluir dia</button>
    </div>`);
  bindNav();
  document.getElementById('selCorretor')?.addEventListener('change',e=>{corretorSelecionado=e.target.value;render();});
  document.getElementById('dataLanc').onchange=async e=>{filtroInicio=filtroFim=e.target.value;await atualizar();tela='lancamento';render();};
  document.getElementById('salvarDia').onclick=salvarDia;
  document.getElementById('excluirDia').onclick=excluirDia;
}
function periodoForm(p,r){
  return `<div class="period"><h4>${p}</h4>${CAMPOS.map(([id,l])=>`<div class="metric-row"><label>${l}</label><input min="0" type="number" id="${id}_${p.replace(':','')}" value="${n(r?.[id])}"></div>`).join('')}</div>`;
}
async function salvarDia(){
  try{
    const c=document.getElementById('selCorretor').value, d=document.getElementById('dataLanc').value;
    for(const p of PERIODOS){
      const vals=CAMPOS.map(([id])=>n(document.getElementById(`${id}_${p.replace(':','')}`).value));
      await rpc('salvar_relatorio',{p_token:sessao,p_corretor_id:c,p_data:d,p_periodo:p,
        p_interacoes:vals[0],p_negociacoes:vals[1],p_agendamentos:vals[2],p_visitas:vals[3],p_propostas:vals[4],p_vendas:vals[5]});
    }
    filtroInicio=filtroFim=d; await atualizar(); tela='lancamento'; alert('Dia salvo com sucesso.'); render();
  }catch(e){mostrarErro(e.message);}
}
async function excluirDia(){
  if(!confirm('Excluir todos os lançamentos desse corretor nessa data?'))return;
  try{
    await rpc('excluir_dia',{p_token:sessao,p_corretor_id:document.getElementById('selCorretor').value,p_data:document.getElementById('dataLanc').value});
    await atualizar();render();
  }catch(e){mostrarErro(e.message);}
}

function painelAgendamentosSemana(){
  const semana=inicioDaSemana(semanaSelecionada);
  const faixa=`${br(semana)} a ${br(somaDias(semana,6))}`;
  const existente=agendamentoSemanaDe(corretorSelecionado,semana)||vazioSemana();
  return `<div class="panel">
    <h2>Agendamentos totais da semana</h2>
    <p class="muted">Informe quantos agendamentos você tem em cada dia dessa semana.</p>
    <div class="form-grid">
      <div class="field"><label>Qualquer dia da semana desejada</label><input id="semanaData" type="date" value="${semanaSelecionada}"></div>
    </div>
    <p class="muted">Semana: ${faixa}</p>
    <div class="period-grid">
      ${DIAS_SEMANA.map(([id,l])=>`<div class="field"><label>${l}</label><input min="0" type="number" id="sem_${id}" value="${n(existente[id])}"></div>`).join('')}
    </div>
    <button class="btn" id="salvarSemana" style="margin-top:14px">Salvar agendamentos da semana</button>
  </div>`;
}
function bindAgendamentosSemana(){
  document.getElementById('semanaData').onchange=e=>{semanaSelecionada=e.target.value;render();};
  document.getElementById('salvarSemana').onclick=async()=>{
    try{
      const semana=inicioDaSemana(semanaSelecionada);
      const vals=DIAS_SEMANA.map(([id])=>n(document.getElementById('sem_'+id).value));
      await rpc('salvar_agendamento_semana',{p_token:sessao,p_corretor_id:corretorSelecionado,p_semana:semana,
        p_seg:vals[0],p_ter:vals[1],p_qua:vals[2],p_qui:vals[3],p_sex:vals[4],p_sab:vals[5],p_dom:vals[6]});
      await atualizar();render();
    }catch(e){mostrarErro(e.message);}
  };
}
function paineisAgendamentosSemanaGerente(equipe){
  const semana=inicioDaSemana(semanaSelecionada);
  const faixa=`${br(semana)} a ${br(somaDias(semana,6))}`;
  const totalSemana=vazioSemana();
  const cards=equipe.map(c=>{
    const v=agendamentoSemanaDe(c.id,semana)||vazioSemana();
    DIAS_SEMANA.forEach(([id])=>totalSemana[id]+=n(v[id]));
    return `<div class="week-card"><h4>${esc(c.nome)}</h4>
      <div class="week-days">${DIAS_SEMANA.map(([id,l])=>`<div class="week-day"><span>${l}</span><strong>${n(v[id])}</strong></div>`).join('')}</div>
      <div class="week-total">Total da semana: <strong>${somaSemana(v)}</strong></div>
    </div>`;
  }).join('');
  return `<div class="panel">
    <h2>Agendamentos totais da semana</h2>
    <div class="form-grid"><div class="field"><label>Qualquer dia da semana desejada</label><input id="semanaGerData" type="date" value="${semanaSelecionada}"></div></div>
    <p class="muted">Semana: ${faixa} · total da equipe: <b>${somaSemana(totalSemana)}</b></p>
    <div class="week-cards">${cards||'<p class="empty">Nenhum corretor.</p>'}</div>
  </div>`;
}
function bindAgendamentosSemanaGerente(){
  document.getElementById('semanaGerData').onchange=e=>{semanaSelecionada=e.target.value;render();};
}

function renderAgenda(){
  const corretores=dados.corretores||[];
  if(usuario.tipo==='corretor') corretorSelecionado=usuario.corretor_id;
  if(!corretorSelecionado) corretorSelecionado=corretores[0]?.id;
  const sel=corretores.map(c=>`<option value="${c.id}" ${c.id===corretorSelecionado?'selected':''}>${esc(c.nome)}</option>`).join('');
  const itens=(dados.agendamentos_clientes||[]).filter(a=>a.corretor_id===corretorSelecionado);
  shell(`${nav()}<h1>Agendamentos</h1><div class="panel">
    <div class="form-grid"><div class="field"><label>Corretor</label><select class="select" id="agendaCorretor" ${usuario.tipo==='corretor'?'disabled':''}>${sel}</select></div>
    <div class="field"><label>Data</label><input id="agendaData" type="date" value="${filtroInicio}"></div>
    <div class="field"><label>Horário</label><input id="agendaHora" type="time"></div>
    <div class="field"><label>Cliente</label><input id="agendaCliente" placeholder="Nome do cliente"></div>
    <div class="field"><label>Telefone</label><input id="agendaTelefone" placeholder="Telefone"></div></div>
    <button class="btn" id="addAgenda">Adicionar agendamento</button></div>
    ${painelAgendamentosSemana()}
    <div class="panel"><h2>Agenda cadastrada</h2>${tabelaAgenda(itens)}</div>`);
  bindNav();
  bindAgendamentosSemana();
  document.getElementById('agendaCorretor')?.addEventListener('change',e=>{corretorSelecionado=e.target.value;render();});
  document.getElementById('agendaData').onchange=async e=>{filtroInicio=filtroFim=e.target.value;await atualizar();render();};
  document.getElementById('addAgenda').onclick=async()=>{
    try{
      const c=document.getElementById('agendaCorretor').value,d=document.getElementById('agendaData').value,h=document.getElementById('agendaHora').value,
      cl=document.getElementById('agendaCliente').value.trim(),tel=document.getElementById('agendaTelefone').value.trim();
      if(!h||!cl) throw new Error('Informe horário e cliente.');
      await rpc('salvar_agendamento_cliente',{p_token:sessao,p_corretor_id:c,p_data:d,p_horario:h,p_cliente:cl,p_telefone:tel});
      await atualizar();render();
    }catch(e){mostrarErro(e.message);}
  };
  document.querySelectorAll('[data-del-ag]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Excluir este agendamento?'))return;
    try{await rpc('excluir_agendamento_cliente',{p_token:sessao,p_id:b.dataset.delAg});await atualizar();render();}catch(e){mostrarErro(e.message);}
  });
}
function tabelaAgenda(itens){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Horário</th><th>Cliente</th><th>Telefone</th><th>Corretor</th><th></th></tr></thead><tbody>
  ${itens.map(a=>`<tr><td>${br(a.data)}</td><td>${String(a.horario).slice(0,5)}</td><td>${esc(a.cliente)}</td><td>${esc(a.telefone||'')}</td><td>${esc(a.corretor)}</td><td><button class="danger-link" data-del-ag="${a.id}">Excluir</button></td></tr>`).join('')||`<tr><td colspan="6" class="empty">Nenhum agendamento.</td></tr>`}
  </tbody></table></div>`;
}

function render(){
  if(!usuario){renderLogin();return;}
  if(usuario.tipo==='corretor'){
    if(tela==='lancamento')renderLancamento(); else if(tela==='agenda')renderAgenda(); else renderCorretor();
  }else if(usuario.tipo==='gerente'){
    if(tela==='lancamento')renderLancamento(); else if(tela==='agenda')renderAgenda(); else renderGerente();
  }else renderSuper();
}

validarSessao();
