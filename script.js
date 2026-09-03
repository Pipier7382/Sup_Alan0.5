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
  ['leads_novos','Leads Novos'],['interacoes','Interações'],['negociacoes','Negociações'],
  ['agendamentos','Agendamentos'],['visitas','Visitas'],
  ['propostas','Propostas'],['pre_vendas','Pré-vendas'],['vendas','Vendas 100%']
];
const PERIODOS = ['12:00','15:00','18:00','21:00'];
const CHAVE_RANK = ['vendas','pre_vendas','propostas','visitas','agendamentos','negociacoes','interacoes','leads_novos'];
const DIAS_SEMANA = [['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];
const CONVERSOES = [
  ['leads_novos','interacoes','Leads Novos → Interações'],
  ['interacoes','negociacoes','Interações → Negociações'],
  ['negociacoes','agendamentos','Negociações → Agendamentos'],
  ['agendamentos','visitas','Agendamentos → Visitas'],
  ['visitas','propostas','Visitas → Propostas'],
  ['propostas','pre_vendas','Propostas → Pré-vendas'],
  ['pre_vendas','vendas','Pré-vendas → Vendas 100%'],
];
function pct(num,den){ return den?(num/den*100).toFixed(1)+'%':'—'; }

let sessao = localStorage.getItem('sup_token') || '';
let usuario = null;
let dados = null;
let tela = 'inicio';
let filtroInicio = dataHoje();
let filtroFim = dataHoje();
let corretorSelecionado = null;
let semanaSelecionada = inicioDaSemana(dataHoje());
let modoAgendaPeriodo = 'semana';
let dataAgendaPeriodo = dataHoje();
let filtroPeriodoGerencia = {};
let supSelecionada = null;
let gerenciaSuporteSelecionada = null;
let funilExpandido = null;
let mesMetricas = new Date().toISOString().slice(0,7);

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
function diaSemanaKeyDeData(dataChave){
  const [y,m,d]=dataChave.split('-').map(Number);
  const mapa=['dom','seg','ter','qua','qui','sex','sab'];
  return mapa[new Date(y,m-1,d).getDay()];
}
function totalPeriodoCorretor(corretorId,modo,dataRef){
  if(modo==='dia'){
    const semana=inicioDaSemana(dataRef);
    const v=agendamentoSemanaDe(corretorId,semana)||vazioSemana();
    return n(v[diaSemanaKeyDeData(dataRef)]);
  }
  if(modo==='semana'){
    const semana=inicioDaSemana(dataRef);
    return somaSemana(agendamentoSemanaDe(corretorId,semana)||vazioSemana());
  }
  const [y,m]=dataRef.split('-').map(Number);
  let total=0;
  (dados?.agendamentos_semanais||[]).filter(a=>a.corretor_id===corretorId).forEach(a=>{
    DIAS_SEMANA.forEach(([id],idx)=>{
      const [dy,dm]=somaDias(a.semana_inicio,idx).split('-').map(Number);
      if(dy===y&&dm===m) total+=n(a[id]);
    });
  });
  return total;
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
async function criarGerente(nomeGerencia,nomeGerente,senha,superintendenciaId){
  return rpc('criar_gerente',{p_token:sessao,p_nome_gerencia:nomeGerencia,p_nome_gerente:nomeGerente,p_senha:senha,p_superintendencia_id:superintendenciaId||null});
}
async function excluirGerente(gerenciaId){
  return rpc('excluir_gerente',{p_token:sessao,p_gerencia_id:gerenciaId});
}
async function criarCorretor(nome,senha,gerenciaId){
  return rpc('criar_corretor',{p_token:sessao,p_nome:nome,p_senha:senha,p_gerencia_id:gerenciaId||null});
}
async function excluirCorretor(corretorId){
  return rpc('excluir_corretor',{p_token:sessao,p_corretor_id:corretorId});
}
async function criarSuperintendencia(nomeSuperintendencia,nomeSuperintendente,senha){
  return rpc('criar_superintendencia',{p_token:sessao,p_nome_superintendencia:nomeSuperintendencia,p_nome_superintendente:nomeSuperintendente,p_senha:senha});
}
async function excluirSuperintendencia(superintendenciaId){
  return rpc('excluir_superintendencia',{p_token:sessao,p_superintendencia_id:superintendenciaId});
}
async function salvarMetricasExtras(corretorId,mes,contratosAssinados,possibilidadesVenda){
  return rpc('salvar_metricas_extras',{p_token:sessao,p_corretor_id:corretorId,p_mes:mes,p_contratos_assinados:contratosAssinados,p_possibilidades_venda:possibilidadesVenda});
}
async function salvarRecebimento(corretorId,data,valor,descricao){
  return rpc('salvar_recebimento',{p_token:sessao,p_corretor_id:corretorId,p_data:data,p_valor:valor,p_descricao:descricao||null});
}
async function excluirRecebimento(id){
  return rpc('excluir_recebimento',{p_token:sessao,p_id:id});
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
          <select id="tipo"><option value="corretor">Corretor</option><option value="gerente">Gerente</option><option value="superintendente">Superintendente</option><option value="suporte">Suporte</option></select>
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
  const tipoLabel={corretor:'Corretor',gerente:'Gerente',superintendente:'Superintendente',suporte:'Suporte'}[usuario.tipo];
  const badgeMaster=usuario.tipo==='suporte'?' <span class="badge">Acesso master</span>':'';
  app.innerHTML=`<div class="shell"><header class="topbar">
    <div><div class="title">🐊 Superintendência</div><div style="font-size:11px;opacity:.7">${tipoLabel}${badgeMaster}</div></div>
    <div class="userbox"><span>${esc(usuario.nome)}</span><button class="btn secondary" id="sair">Sair</button></div>
  </header><main class="layout">${content}</main></div>`;
  document.getElementById('sair').onclick=logout;
}

function nav(){
  const itens=usuario.tipo==='corretor'
    ? [['inicio','📊 Meu painel'],['lancamento','✏️ Lançamento'],['agenda','📅 Agendamentos']]
    : usuario.tipo==='gerente'
    ? [['inicio','📊 Minha equipe'],['lancamento','✏️ Lançamento'],['agenda','📅 Agendamentos']]
    : usuario.tipo==='suporte'
    ? [['inicio','🛠️ Suporte']]
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

function svgFunil(etapas){
  const max=Math.max(1,...etapas.map(e=>e[1]));
  const W=560,padTop=14,padBot=14,bandH=42,H=padTop+padBot+bandH*etapas.length;
  const minW=54,maxW=W-60;
  const cores=['#d4af37','#e3c168','#f0d896','#4fc38a','#2fa876','#1f7c58','#8b98b0','#cdd6e6','#c23d50','#e0596b'];
  let y=padTop,rows='';
  etapas.forEach((e,i)=>{
    const propTop=i===0?1:(etapas[i-1][1]/max);
    const propBot=e[1]/max;
    const wTop=minW+(maxW-minW)*propTop;
    const wBot=minW+(maxW-minW)*propBot;
    const xTopL=(W-wTop)/2,xTopR=xTopL+wTop;
    const xBotL=(W-wBot)/2,xBotR=xBotL+wBot;
    const yTop=y,yBot=y+bandH-4;
    rows+=`<polygon points="${xTopL},${yTop} ${xTopR},${yTop} ${xBotR},${yBot} ${xBotL},${yBot}" fill="${cores[i%cores.length]}" opacity="0.92"/>`;
    rows+=`<text x="${W/2}" y="${(yTop+yBot)/2+4}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#050b16">${esc(e[0])}: ${e[1]}</text>`;
    y+=bandH;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:560px;display:block;margin:0 auto">${rows}</svg>`;
}
function dadosFunilCorretor(corretorId){
  const lista=(dados.relatorios||[]).filter(r=>r.corretor_id===corretorId);
  const t=somar(lista);
  const extras=(dados.metricas_extras||[]).find(m=>m.corretor_id===corretorId&&m.mes===mesMetricas+'-01')||{};
  return CAMPOS.map(([id,label])=>[label,t[id]]).concat([
    ['Contratos assinados',n(extras.contratos_assinados)],
    ['Possibilidades de venda',n(extras.possibilidades_venda)]
  ]);
}
function painelMetricasCorretor(corretorId,nomeCorretor){
  const extras=(dados.metricas_extras||[]).find(m=>m.corretor_id===corretorId&&m.mes===mesMetricas+'-01')||{};
  const recebimentos=(dados.recebimentos||[]).filter(r=>r.corretor_id===corretorId&&r.data.slice(0,7)===mesMetricas);
  const totalRecebido=recebimentos.reduce((s,r)=>s+Number(r.valor||0),0);
  const linhasReceb=recebimentos.map(r=>`<tr><td>${br(r.data)}</td><td>${esc(r.descricao||'—')}</td><td>R$ ${Number(r.valor).toFixed(2)}</td><td><button class="danger-link" data-del-receb="${r.id}">Remover</button></td></tr>`).join('');
  return `<div class="panel" style="margin-top:20px">
    <h2>📐 Funil — ${esc(nomeCorretor)}</h2>
    ${svgFunil(dadosFunilCorretor(corretorId))}
  </div>
  <div class="panel" style="margin-top:20px">
    <h3>Métricas mensais</h3>
    <div class="toolbar" style="margin-bottom:14px"><label>Mês <input type="month" id="mesMetricasInput" value="${mesMetricas}"></label></div>
    <div class="form-grid">
      <div class="field"><label>Contratos assinados</label><input type="number" min="0" id="contratosAssinados" value="${n(extras.contratos_assinados)}"></div>
      <div class="field"><label>Possibilidades de venda</label><input type="number" min="0" id="possibilidadesVenda" value="${n(extras.possibilidades_venda)}"></div>
    </div>
    <button class="btn" id="salvarMetricas" style="margin-top:8px">Salvar métricas do mês</button>

    <h3 style="margin-top:24px">Recebimentos do mês <span class="badge">Total: R$ ${totalRecebido.toFixed(2)}</span></h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
      <tbody>${linhasReceb||'<tr><td colspan="4" class="empty">Nenhum recebimento lançado neste mês.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Data</label><input type="date" id="novoRecebData" value="${dataHoje()}"></div>
      <div class="field wide"><label>Descrição (opcional)</label><input id="novoRecebDescricao" placeholder="Ex: Comissão venda apto 302"></div>
      <div class="field"><label>Valor (R$)</label><input type="number" min="0" step="0.01" id="novoRecebValor" placeholder="0,00"></div>
    </div>
    <button class="btn" id="addRecebimento" style="margin-top:8px">Adicionar recebimento</button>
  </div>`;
}
function bindFunilCorretor(corretorId){
  document.getElementById('mesMetricasInput')?.addEventListener('change',e=>{ if(e.target.value){mesMetricas=e.target.value; render();} });
  document.getElementById('salvarMetricas')?.addEventListener('click',async()=>{
    try{
      const ca=Number(document.getElementById('contratosAssinados').value||0);
      const pv=Number(document.getElementById('possibilidadesVenda').value||0);
      await salvarMetricasExtras(corretorId,mesMetricas+'-01',ca,pv);
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addRecebimento')?.addEventListener('click',async()=>{
    try{
      const d=document.getElementById('novoRecebData').value;
      const desc=document.getElementById('novoRecebDescricao').value.trim();
      const v=Number(document.getElementById('novoRecebValor').value||0);
      if(!d||!v) throw new Error('Preencha a data e o valor do recebimento.');
      await salvarRecebimento(corretorId,d,v,desc);
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
  document.querySelectorAll('[data-del-receb]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover esse recebimento?'))return;
    try{ await excluirRecebimento(b.dataset.delReceb); await atualizar(); render(); }
    catch(e){ mostrarErro(e.message); }
  });
}

function painelCorretoresEquipe(){
  const lista=dados.corretores||[];
  const linhas=lista.map(c=>`<tr><td>${esc(c.nome)}</td><td style="white-space:normal"><button class="btn secondary" data-funil="${c.id}" style="padding:6px 12px;font-size:12px;margin-right:8px">${funilExpandido===c.id?'▲ Ocultar funil':'▼ Ver funil'}</button><button class="danger-link" data-del-corretor="${c.id}">Remover</button></td></tr>`).join('');
  const alvo=lista.find(c=>c.id===funilExpandido);
  const blocoFunil=alvo?painelMetricasCorretor(alvo.id,alvo.nome):'';
  return `<div class="panel">
    <h2>Corretores da equipe</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Corretor</th><th></th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="2" class="empty">Nenhum corretor cadastrado.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Nome do corretor</label><input id="novoCorretorNome" placeholder="Nome do corretor"></div>
      <div class="field"><label>Senha</label><input id="novoCorretorSenha" type="password" placeholder="Senha de acesso"></div>
    </div>
    <button class="btn" id="addCorretor" style="margin-top:8px">Adicionar corretor</button>
  </div>${blocoFunil}`;
}
function bindPainelCorretoresEquipe(){
  document.querySelectorAll('[data-funil]').forEach(b=>b.onclick=()=>{
    funilExpandido=funilExpandido===b.dataset.funil?null:b.dataset.funil;
    render();
  });
  document.querySelectorAll('[data-del-corretor]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover esse corretor da equipe? O acesso dele será desativado; o histórico de relatórios é mantido.'))return;
    try{ await excluirCorretor(b.dataset.delCorretor); await atualizar(); render(); }
    catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addCorretor')?.addEventListener('click',async()=>{
    try{
      const nn=document.getElementById('novoCorretorNome').value.trim();
      const sn=document.getElementById('novoCorretorSenha').value;
      if(!nn||!sn) throw new Error('Preencha o nome e a senha do corretor.');
      await criarCorretor(nn,sn);
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
  if(funilExpandido) bindFunilCorretor(funilExpandido);
}

function renderGerente(){
  const equipe=registrosPorCorretor();
  const ranked=equipe.map(c=>({corretor:c.nome,gerencia:c.gerencia,...somar(c.linhas)})).sort(ordenarRank);
  const total=somar(dados.relatorios||[]);
  shell(`${nav()}<h1>${esc(usuario.nome)} — ${esc((dados.corretores||[])[0]?.gerencia||'Minha equipe')}</h1>${filtros()}${cards(total)}
    <div class="panel"><h2>🏆 Ranking da equipe</h2><p class="muted">Critério: Venda 100% → Pré-venda → Proposta → Visita → Agendamento → Negociação → Interação → Lead Novo.</p>${tabelaRanking(ranked)}</div>
    <div class="panel"><h2>Corretores</h2>${tabelaCorretores(equipe)}</div>
    ${painelCorretoresEquipe()}
    ${painelAgendamentosPeriodo(equipe)}
    ${paineisAgendamentosSemanaGerente(equipe)}`);
  bindNav();bindFiltros();bindAgendamentosPeriodo();bindAgendamentosSemanaGerente();bindPainelCorretoresEquipe();
}
function tabelaRanking(rows){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Corretor</th>${CAMPOS.map(x=>`<th>${x[1]}</th>`).join('')}${CONVERSOES.map(c=>`<th>${c[2]}</th>`).join('')}</tr></thead><tbody>
  ${rows.map((r,i)=>`<tr><td class="rank">${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td><b>${esc(r.corretor)}</b></td>${CAMPOS.map(([id])=>`<td>${r[id]}</td>`).join('')}${CONVERSOES.map(([a,b])=>`<td>${pct(r[b],r[a])}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function tabelaCorretores(equipe){
  const linhasDados=equipe.flatMap(c=>c.linhas).sort((a,b)=>a.data.localeCompare(b.data));
  const totaisPorPeriodo=PERIODOS.map(p=>[p,somar(linhasDados.filter(r=>r.periodo===p))]);
  const totalGeral=somar(linhasDados);
  const convVazia=CONVERSOES.map(()=>'<td></td>').join('');
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Corretor</th><th>Período</th><th>Data</th>${CAMPOS.map(x=>`<th>${x[1]}</th>`).join('')}${CONVERSOES.map(c=>`<th>${c[2]}</th>`).join('')}</tr></thead><tbody>
  ${linhasDados.map(r=>`<tr><td>${esc(r.corretor)}</td><td>${r.periodo}</td><td>${br(r.data)}</td>${CAMPOS.map(([id])=>`<td>${r[id]}</td>`).join('')}${convVazia}</tr>`).join('')||`<tr><td colspan="${9+CONVERSOES.length}" class="empty">Sem lançamentos no período.</td></tr>`}
  ${linhasDados.length?totaisPorPeriodo.map(([p,t])=>`<tr class="rank"><td colspan="2">Total das ${p}</td><td></td>${CAMPOS.map(([id])=>`<td>${t[id]}</td>`).join('')}${CONVERSOES.map(([a,b])=>`<td>${pct(t[b],t[a])}</td>`).join('')}</tr>`).join(''):''}
  ${linhasDados.length?`<tr class="rank"><td colspan="3">Total geral</td>${CAMPOS.map(([id])=>`<td>${totalGeral[id]}</td>`).join('')}${CONVERSOES.map(([a,b])=>`<td>${pct(totalGeral[b],totalGeral[a])}</td>`).join('')}</tr>`:''}
  </tbody></table></div>`;
}

function painelGerentes(){
  const lista=dados.gerentes||[];
  const linhas=lista.map(g=>`<tr><td>${esc(g.gerencia)}</td><td>${esc(g.nome)}</td><td><button class="danger-link" data-del-gerente="${g.gerencia_id}">Remover</button></td></tr>`).join('');
  return `<div class="panel">
    <h2>Gerentes</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Gerência</th><th>Gerente</th><th></th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="3" class="empty">Nenhum gerente cadastrado.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Nome da equipe/gerência</label><input id="novaGerenciaNome" placeholder="Ex: Gerência 6"></div>
      <div class="field"><label>Nome do gerente</label><input id="novoGerenteNome" placeholder="Nome do gerente"></div>
      <div class="field"><label>Senha</label><input id="novoGerenteSenha" type="password" placeholder="Senha de acesso"></div>
    </div>
    <button class="btn" id="addGerente" style="margin-top:8px">Adicionar gerente</button>
  </div>`;
}
function bindPainelGerentes(){
  document.querySelectorAll('[data-del-gerente]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover esse gerente e toda a equipe dele (corretores inclusive)? Os acessos serão desativados; o histórico de relatórios é mantido.'))return;
    try{ await excluirGerente(b.dataset.delGerente); await atualizar(); render(); }
    catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addGerente')?.addEventListener('click',async()=>{
    try{
      const ng=document.getElementById('novaGerenciaNome').value.trim();
      const nn=document.getElementById('novoGerenteNome').value.trim();
      const sn=document.getElementById('novoGerenteSenha').value;
      if(!ng||!nn||!sn) throw new Error('Preencha o nome da equipe, o nome do gerente e a senha.');
      await criarGerente(ng,nn,sn);
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
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
  const rankingGeral=corretores.map(c=>({corretor:c.nome,gerencia:c.gerencia,...somar(c.linhas)})).sort(ordenarRank);

  const periodoSelTotal=filtroPeriodoGerencia['__TOTAL__']||'total';
  const linhasTotal=corretores.flatMap(c=>c.linhas);
  const linhasTotalFiltradas=periodoSelTotal==='total'?linhasTotal:linhasTotal.filter(r=>r.periodo===periodoSelTotal);
  const tTotal=somar(linhasTotalFiltradas);
  const seletorTotal=`<select class="select" data-periodo-ger="__TOTAL__" onclick="event.stopPropagation()">
    <option value="total" ${periodoSelTotal==='total'?'selected':''}>Total do dia</option>
    ${PERIODOS.map(p=>`<option value="${p}" ${periodoSelTotal===p?'selected':''}>${p}</option>`).join('')}
  </select>`;
  const cardTotalGeral=`<div class="panel manager-card manager-card-total"><h2>🏢 Total geral (todas as gerências)</h2>
    <div class="toolbar" style="margin-bottom:12px"><label>Selecionar período ${seletorTotal}</label></div>
    ${cardsMini(tTotal)}
    <div class="muted" style="margin-top:10px">1º ${esc(rankingGeral[0]?.corretor||'—')} · ${n(rankingGeral[0]?.vendas)} venda(s)</div>
    <button class="btn secondary" id="btnCopiarTotalGeral" style="margin-top:14px" onclick="event.stopPropagation()">📋 Copiar relatório</button></div>`;

  const gerCards=Object.entries(gerMap).sort().map(([g,cs])=>{
    const periodoSel=filtroPeriodoGerencia[g]||'total';
    const linhasGerencia=cs.flatMap(c=>c.linhas);
    const linhasFiltradas=periodoSel==='total'?linhasGerencia:linhasGerencia.filter(r=>r.periodo===periodoSel);
    const t=somar(linhasFiltradas);
    const ranking=cs.map(c=>({corretor:c.nome,...somar(c.linhas)})).sort(ordenarRank);
    const seletor=`<select class="select" data-periodo-ger="${esc(g)}" onclick="event.stopPropagation()">
      <option value="total" ${periodoSel==='total'?'selected':''}>Total do dia</option>
      ${PERIODOS.map(p=>`<option value="${p}" ${periodoSel===p?'selected':''}>${p}</option>`).join('')}
    </select>`;
    return `<div class="panel manager-card" data-ger="${esc(g)}"><h2>${esc(g)}</h2>
      <div class="toolbar" style="margin-bottom:12px"><label>Selecionar período ${seletor}</label></div>
      ${cardsMini(t)}
      <div class="muted" style="margin-top:10px">1º ${esc(ranking[0]?.corretor||'—')} · ${n(ranking[0]?.vendas)} venda(s)</div></div>`;
  }).join('');
  shell(`${nav()}<h1>Visão geral da Superintendência</h1>${filtros()}${cards(total)}
    ${painelGerentes()}
    <div class="grid2">${cardTotalGeral}${gerCards}</div>
    <div class="panel"><h2>Ranking geral de corretores</h2>${tabelaRanking(rankingGeral)}</div>
    ${painelAgendamentosPeriodo(corretores)}
    ${paineisAgendamentosSemanaGerente(corretores)}`);
  bindNav();bindFiltros();bindAgendamentosPeriodo();bindAgendamentosSemanaGerente();bindPainelGerentes();
  bindCopiarTotalGeral(tTotal,periodoSelTotal,rankingGeral,filtroInicio,filtroFim);
  document.querySelectorAll('[data-periodo-ger]').forEach(s=>{
    s.onchange=e=>{ filtroPeriodoGerencia[e.target.dataset.periodoGer]=e.target.value; render(); };
  });
}
function cardsMini(t){
  return `<div class="cards" style="margin:0">${CAMPOS.map(([id,l])=>`<div class="card"><div class="label">${l}</div><div class="value" style="font-size:22px">${t[id]}</div></div>`).join('')}</div>`;
}

function textoTotalGeral(t,periodoLabel,rankingGeral,dataIni,dataFim){
  const faixa=dataIni===dataFim?br(dataIni):`${br(dataIni)} a ${br(dataFim)}`;
  const linhas=CAMPOS.map(([id,l])=>`${l}: ${n(t[id])}`).join('\n');
  const top=rankingGeral[0];
  return `🏢 TOTAL GERAL (TODAS AS GERÊNCIAS)\n`+
    `Período: ${faixa} — ${periodoLabel}\n\n`+
    `${linhas}\n\n`+
    `1º lugar: ${top?.corretor||'—'} (${top?.gerencia||'—'}) — ${n(top?.vendas)} venda(s)`;
}
async function copiarTexto(texto,btn){
  const textoOriginal=btn.textContent;
  try{
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(texto);
    }else{
      const ta=document.createElement('textarea');
      ta.value=texto; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    btn.textContent='✅ Copiado!';
  }catch(e){
    btn.textContent='❌ Falha ao copiar';
  }
  setTimeout(()=>{btn.textContent=textoOriginal;},2000);
}
function bindCopiarTotalGeral(tTotal,periodoSelTotal,rankingGeral,dataIni,dataFim){
  const btn=document.getElementById('btnCopiarTotalGeral');
  if(!btn) return;
  const periodoLabel=periodoSelTotal==='total'?'Total do dia':periodoSelTotal;
  btn.onclick=e=>{
    e.stopPropagation();
    copiarTexto(textoTotalGeral(tTotal,periodoLabel,rankingGeral,dataIni,dataFim),btn);
  };
}

function renderSuporte(){
  const superintendencias=dados.superintendencias||[];
  const superintendentes=dados.superintendentes||[];
  const gerencias=dados.gerencias||[];
  const gerentes=dados.gerentes||[];
  const corretores=dados.corretores||[];

  if((!supSelecionada||!superintendencias.some(s=>s.id===supSelecionada))) supSelecionada=superintendencias[0]?.id||null;
  const gerenciasDaSup=gerencias.filter(g=>g.superintendencia_id===supSelecionada);
  if(!gerenciaSuporteSelecionada||!gerenciasDaSup.some(g=>g.id===gerenciaSuporteSelecionada)) gerenciaSuporteSelecionada=gerenciasDaSup[0]?.id||null;

  const linhasSup=superintendencias.map(s=>{
    const nomeSuperintendente=superintendentes.find(x=>x.superintendencia_id===s.id)?.nome||'—';
    return `<tr><td>${esc(s.nome)}</td><td>${esc(nomeSuperintendente)}</td><td><button class="danger-link" data-del-sup="${s.id}">Remover</button></td></tr>`;
  }).join('');
  const painelSup=`<div class="panel">
    <h2>Superintendências</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Superintendência</th><th>Superintendente</th><th></th></tr></thead>
      <tbody>${linhasSup||'<tr><td colspan="3" class="empty">Nenhuma superintendência cadastrada.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Nome da superintendência</label><input id="novaSupNome" placeholder="Ex: Superintendência São Paulo"></div>
      <div class="field"><label>Nome do superintendente</label><input id="novoSupNome" placeholder="Nome do superintendente"></div>
      <div class="field"><label>Senha</label><input id="novoSupSenha" type="password" placeholder="Senha de acesso"></div>
    </div>
    <button class="btn" id="addSup" style="margin-top:8px">Adicionar superintendência</button>
  </div>`;

  const seletorSup=`<select class="select" id="selSupAlvo">${superintendencias.map(s=>`<option value="${s.id}" ${s.id===supSelecionada?'selected':''}>${esc(s.nome)}</option>`).join('')}</select>`;
  const linhasGer=gerenciasDaSup.map(g=>{
    const nomeGerente=gerentes.find(x=>x.gerencia_id===g.id)?.nome||'—';
    return `<tr><td>${esc(g.nome)}</td><td>${esc(nomeGerente)}</td><td><button class="danger-link" data-del-ger-sup="${g.id}">Remover</button></td></tr>`;
  }).join('');
  const painelGer=supSelecionada?`<div class="panel">
    <h2>Gerências</h2>
    <div class="toolbar" style="margin-bottom:12px"><label>Superintendência ${seletorSup}</label></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Gerência</th><th>Gerente</th><th></th></tr></thead>
      <tbody>${linhasGer||'<tr><td colspan="3" class="empty">Nenhuma gerência cadastrada.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Nome da equipe/gerência</label><input id="novaGerSupNome" placeholder="Ex: Equipe 1"></div>
      <div class="field"><label>Nome do gerente</label><input id="novoGerSupNome" placeholder="Nome do gerente"></div>
      <div class="field"><label>Senha</label><input id="novoGerSupSenha" type="password" placeholder="Senha de acesso"></div>
    </div>
    <button class="btn" id="addGerSup" style="margin-top:8px">Adicionar gerência</button>
  </div>`:'<div class="panel"><p class="muted">Cadastre uma superintendência para começar.</p></div>';

  const corretoresDaGerencia=corretores.filter(c=>c.gerencia_id===gerenciaSuporteSelecionada);
  const seletorGer=gerenciasDaSup.length?`<select class="select" id="selGerAlvo">${gerenciasDaSup.map(g=>`<option value="${g.id}" ${g.id===gerenciaSuporteSelecionada?'selected':''}>${esc(g.nome)}</option>`).join('')}</select>`:'';
  const linhasCor=corretoresDaGerencia.map(c=>`<tr><td>${esc(c.nome)}</td><td><button class="danger-link" data-del-cor-sup="${c.id}">Remover</button></td></tr>`).join('');
  const painelCor=gerenciaSuporteSelecionada?`<div class="panel">
    <h2>Corretores</h2>
    <div class="toolbar" style="margin-bottom:12px"><label>Gerência ${seletorGer}</label></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Corretor</th><th></th></tr></thead>
      <tbody>${linhasCor||'<tr><td colspan="2" class="empty">Nenhum corretor cadastrado.</td></tr>'}</tbody></table></div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>Nome do corretor</label><input id="novoCorSupNome" placeholder="Nome do corretor"></div>
      <div class="field"><label>Senha</label><input id="novoCorSupSenha" type="password" placeholder="Senha de acesso"></div>
    </div>
    <button class="btn" id="addCorSup" style="margin-top:8px">Adicionar corretor</button>
  </div>`:(gerenciasDaSup.length?'':'<div class="panel"><p class="muted">Cadastre uma gerência para poder adicionar corretores.</p></div>');

  shell(`${nav()}<h1>🛠️ Painel do Suporte</h1>
    <p class="muted">Acesso master: crie e remova superintendências, gerências e corretores de qualquer empresa. Remover sempre desativa o acesso — o histórico de relatórios é mantido.</p>
    ${painelSup}
    <div class="grid2">${painelGer}${painelCor}</div>`);
  bindNav();
  bindSuporte();
}
function bindSuporte(){
  document.getElementById('selSupAlvo')?.addEventListener('change',e=>{supSelecionada=e.target.value;gerenciaSuporteSelecionada=null;render();});
  document.getElementById('selGerAlvo')?.addEventListener('change',e=>{gerenciaSuporteSelecionada=e.target.value;render();});

  document.querySelectorAll('[data-del-sup]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover essa superintendência inteira (todas as gerências e corretores dela)? Os acessos serão desativados; o histórico é mantido.'))return;
    try{
      await excluirSuperintendencia(b.dataset.delSup);
      if(supSelecionada===b.dataset.delSup) supSelecionada=null;
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addSup')?.addEventListener('click',async()=>{
    try{
      const ns=document.getElementById('novaSupNome').value.trim();
      const nn=document.getElementById('novoSupNome').value.trim();
      const sn=document.getElementById('novoSupSenha').value;
      if(!ns||!nn||!sn) throw new Error('Preencha o nome da superintendência, o nome do superintendente e a senha.');
      const id=await criarSuperintendencia(ns,nn,sn);
      supSelecionada=id;
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });

  document.querySelectorAll('[data-del-ger-sup]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover essa gerência e toda a equipe dela (corretores inclusive)? Os acessos serão desativados; o histórico é mantido.'))return;
    try{ await excluirGerente(b.dataset.delGerSup); await atualizar(); render(); }
    catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addGerSup')?.addEventListener('click',async()=>{
    try{
      const ng=document.getElementById('novaGerSupNome').value.trim();
      const nn=document.getElementById('novoGerSupNome').value.trim();
      const sn=document.getElementById('novoGerSupSenha').value;
      if(!ng||!nn||!sn) throw new Error('Preencha o nome da equipe, o nome do gerente e a senha.');
      const id=await criarGerente(ng,nn,sn,supSelecionada);
      gerenciaSuporteSelecionada=id;
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });

  document.querySelectorAll('[data-del-cor-sup]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover esse corretor? O acesso será desativado; o histórico é mantido.'))return;
    try{ await excluirCorretor(b.dataset.delCorSup); await atualizar(); render(); }
    catch(e){ mostrarErro(e.message); }
  });
  document.getElementById('addCorSup')?.addEventListener('click',async()=>{
    try{
      const nn=document.getElementById('novoCorSupNome').value.trim();
      const sn=document.getElementById('novoCorSupSenha').value;
      if(!nn||!sn) throw new Error('Preencha o nome e a senha do corretor.');
      await criarCorretor(nn,sn,gerenciaSuporteSelecionada);
      await atualizar(); render();
    }catch(e){ mostrarErro(e.message); }
  });
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
      const args={p_token:sessao,p_corretor_id:c,p_data:d,p_periodo:p};
      CAMPOS.forEach(([id],idx)=>{ args['p_'+id]=vals[idx]; });
      await rpc('salvar_relatorio',args);
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
function painelAgendamentosPeriodo(equipe){
  const modo=modoAgendaPeriodo, dataRef=dataAgendaPeriodo;
  let faixaTexto='';
  if(modo==='dia'){
    faixaTexto=br(dataRef);
  }else if(modo==='semana'){
    const ini=inicioDaSemana(dataRef);
    faixaTexto=`${br(ini)} a ${br(somaDias(ini,6))}`;
  }else{
    const [y,m]=dataRef.split('-').map(Number);
    const ultimo=new Date(y,m,0).getDate();
    faixaTexto=`${pad2(1)}/${pad2(m)}/${y} a ${pad2(ultimo)}/${pad2(m)}/${y}`;
  }
  let totalGeral=0;
  const linhas=equipe.map(c=>{
    const t=totalPeriodoCorretor(c.id,modo,dataRef);
    totalGeral+=t;
    return `<tr><td>${esc(c.nome)}</td><td style="text-align:right">${t}</td></tr>`;
  }).join('');
  return `<div class="panel">
    <h2>Agendamentos totais por período</h2>
    <div class="nav" style="margin-bottom:10px">
      <button class="${modo==='dia'?'active':''}" data-modo-ag="dia">Diário</button>
      <button class="${modo==='semana'?'active':''}" data-modo-ag="semana">Semanal</button>
      <button class="${modo==='mes'?'active':''}" data-modo-ag="mes">Mensal</button>
    </div>
    <div class="toolbar" style="margin-bottom:10px"><label>Data de referência <input id="agendaPeriodoData" type="date" value="${dataRef}"></label></div>
    <p class="muted">Período: ${faixaTexto}</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Corretor</th><th style="text-align:right">Agendamentos</th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="2" class="empty">Nenhum corretor.</td></tr>'}<tr class="rank"><td>Total da equipe</td><td style="text-align:right">${totalGeral}</td></tr></tbody>
    </table></div>
  </div>`;
}
function bindAgendamentosPeriodo(){
  document.querySelectorAll('[data-modo-ag]').forEach(b=>b.onclick=()=>{modoAgendaPeriodo=b.dataset.modoAg;render();});
  document.getElementById('agendaPeriodoData').onchange=e=>{dataAgendaPeriodo=e.target.value;render();};
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
  const cartaoTotal=`<div class="week-card week-card-total"><h4>🏢 Total da equipe</h4>
    <div class="week-days">${DIAS_SEMANA.map(([id,l])=>`<div class="week-day"><span>${l}</span><strong>${n(totalSemana[id])}</strong></div>`).join('')}</div>
    <div class="week-total">Total da semana: <strong>${somaSemana(totalSemana)}</strong></div>
  </div>`;
  return `<div class="panel">
    <h2>Agendamentos totais da semana</h2>
    <div class="form-grid"><div class="field"><label>Qualquer dia da semana desejada</label><input id="semanaGerData" type="date" value="${semanaSelecionada}"></div></div>
    <p class="muted">Semana: ${faixa}</p>
    <div class="week-cards">${cartaoTotal}${cards||'<p class="empty">Nenhum corretor.</p>'}</div>
  </div>`;
}
function bindAgendamentosSemanaGerente(){
  document.getElementById('semanaGerData').onchange=e=>{semanaSelecionada=e.target.value;render();};
}

function cartaoAgendamentosSemanaLeitura(corretor){
  const semana=inicioDaSemana(semanaSelecionada);
  const faixa=`${br(semana)} a ${br(somaDias(semana,6))}`;
  const v=agendamentoSemanaDe(corretor.id,semana)||vazioSemana();
  return `<div class="panel">
    <h2>Agendamentos totais da semana</h2>
    <div class="form-grid"><div class="field"><label>Qualquer dia da semana desejada</label><input id="semanaData" type="date" value="${semanaSelecionada}"></div></div>
    <p class="muted">Semana: ${faixa}</p>
    <div class="week-cards"><div class="week-card"><h4>${esc(corretor.nome)}</h4>
      <div class="week-days">${DIAS_SEMANA.map(([id,l])=>`<div class="week-day"><span>${l}</span><strong>${n(v[id])}</strong></div>`).join('')}</div>
      <div class="week-total">Total da semana: <strong>${somaSemana(v)}</strong></div>
    </div></div>
  </div>`;
}
function bindSemanaDataApenas(){
  document.getElementById('semanaData').onchange=e=>{semanaSelecionada=e.target.value;render();};
}

function renderAgenda(){
  const corretores=dados.corretores||[];
  const souGerente=usuario.tipo!=='corretor';
  if(usuario.tipo==='corretor') corretorSelecionado=usuario.corretor_id;
  if(!corretorSelecionado) corretorSelecionado=corretores[0]?.id;
  const todos=souGerente&&corretorSelecionado==='TODOS';
  const sel=(souGerente?`<option value="TODOS" ${corretorSelecionado==='TODOS'?'selected':''}>Todos</option>`:'')
    +corretores.map(c=>`<option value="${c.id}" ${c.id===corretorSelecionado?'selected':''}>${esc(c.nome)}</option>`).join('');
  const itens=todos?(dados.agendamentos_clientes||[]):(dados.agendamentos_clientes||[]).filter(a=>a.corretor_id===corretorSelecionado);
  const corretorAtual=corretores.find(c=>c.id===corretorSelecionado);

  const formAdicionar=usuario.tipo==='corretor'?`<div class="panel">
    <div class="form-grid"><div class="field"><label>Corretor</label><select class="select" id="agendaCorretor" disabled>${sel}</select></div>
    <div class="field"><label>Data</label><input id="agendaData" type="date" value="${filtroInicio}"></div>
    <div class="field"><label>Horário</label><input id="agendaHora" type="time"></div>
    <div class="field"><label>Cliente</label><input id="agendaCliente" placeholder="Nome do cliente"></div>
    <div class="field"><label>Telefone</label><input id="agendaTelefone" placeholder="Telefone"></div></div>
    <button class="btn" id="addAgenda">Adicionar agendamento</button></div>`
    :`<div class="panel"><div class="form-grid"><div class="field"><label>Corretor</label><select class="select" id="agendaCorretor">${sel}</select></div></div>
    <p class="muted" style="margin-top:10px">Como gerente, você só pode visualizar os agendamentos — quem cadastra é o próprio corretor.</p></div>`;

  const painelSemana=usuario.tipo==='corretor'
    ? painelAgendamentosSemana()
    : todos
    ? paineisAgendamentosSemanaGerente(corretores)
    : corretorAtual ? cartaoAgendamentosSemanaLeitura(corretorAtual) : '';

  shell(`${nav()}<h1>Agendamentos</h1>
    ${souGerente?filtros():''}
    ${formAdicionar}
    ${painelSemana}
    <div class="panel"><h2>Agenda cadastrada</h2>${tabelaAgenda(itens,usuario.tipo==='corretor')}</div>`);
  bindNav();
  if(souGerente) bindFiltros();
  if(usuario.tipo==='corretor') bindAgendamentosSemana();
  else if(todos) bindAgendamentosSemanaGerente();
  else if(corretorAtual) bindSemanaDataApenas();

  document.getElementById('agendaCorretor')?.addEventListener('change',e=>{corretorSelecionado=e.target.value;render();});
  document.getElementById('agendaData')?.addEventListener('change',async e=>{filtroInicio=filtroFim=e.target.value;await atualizar();render();});
  document.getElementById('addAgenda')?.addEventListener('click',async()=>{
    try{
      const c=document.getElementById('agendaCorretor').value,d=document.getElementById('agendaData').value,h=document.getElementById('agendaHora').value,
      cl=document.getElementById('agendaCliente').value.trim(),tel=document.getElementById('agendaTelefone').value.trim();
      if(!h||!cl) throw new Error('Informe horário e cliente.');
      await rpc('salvar_agendamento_cliente',{p_token:sessao,p_corretor_id:c,p_data:d,p_horario:h,p_cliente:cl,p_telefone:tel});
      await atualizar();render();
    }catch(e){mostrarErro(e.message);}
  });
  document.querySelectorAll('[data-del-ag]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Excluir este agendamento?'))return;
    try{await rpc('excluir_agendamento_cliente',{p_token:sessao,p_id:b.dataset.delAg});await atualizar();render();}catch(e){mostrarErro(e.message);}
  });
}
function tabelaAgenda(itens,permiteExcluir){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Horário</th><th>Cliente</th><th>Telefone</th><th>Corretor</th>${permiteExcluir?'<th></th>':''}</tr></thead><tbody>
  ${itens.map(a=>`<tr><td>${br(a.data)}</td><td>${String(a.horario).slice(0,5)}</td><td>${esc(a.cliente)}</td><td>${esc(a.telefone||'')}</td><td>${esc(a.corretor)}</td>${permiteExcluir?`<td><button class="danger-link" data-del-ag="${a.id}">Excluir</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${permiteExcluir?6:5}" class="empty">Nenhum agendamento.</td></tr>`}
  </tbody></table></div>`;
}

function render(){
  if(!usuario){renderLogin();return;}
  if(usuario.tipo==='corretor'){
    if(tela==='lancamento')renderLancamento(); else if(tela==='agenda')renderAgenda(); else renderCorretor();
  }else if(usuario.tipo==='gerente'){
    if(tela==='lancamento')renderLancamento(); else if(tela==='agenda')renderAgenda(); else renderGerente();
  }else if(usuario.tipo==='suporte'){
    renderSuporte();
  }else renderSuper();
}

validarSessao();
