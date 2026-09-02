# Sistema Único da Superintendência

Arquivos:
- index.html
- style.css
- script.js
- supabase.sql

## Instalação
1. No Supabase SQL Editor, execute `supabase.sql`.
2. Publique os 4 arquivos no GitHub Pages.
3. O `script.js` já usa a URL/chave pública do projeto que estava no sistema anterior.
4. Teste os acessos abaixo.

## Usuários de teste
- Superintendente: Alan / 11111
- Gerentes: Gerente 1, Gerente 2, Gerente 3, Gerente 4, Gerente 5 / 11111
- Corretores: Corretor 1.1 até Corretor 5.10 / 11111

## Regra do ranking
Venda 100% > Pré-venda > Proposta > Visita > Agendamento > Negociação > Interação > Lead Novo.

Observação: esta versão usa uma sessão própria armazenada em token e funções SECURITY DEFINER no Supabase, sem expor acesso direto às tabelas para o frontend.

## Novidades: gerenciar gerentes e corretores

- O Superintendente agora tem, na Visão geral, um painel "Gerentes" para
  adicionar um novo gerente (nome da equipe/gerência + nome do gerente +
  senha) e remover um gerente existente (o que desativa a equipe inteira:
  o gerente e todos os corretores dela).
- O Gerente agora tem, no próprio painel ("Minha equipe"), um painel
  "Corretores da equipe" para adicionar e remover corretores da própria
  gerência.
- "Remover" desativa o acesso (login para de funcionar) mas mantém todo
  o histórico de relatórios e agendamentos já lançados — nada é apagado.

### Como instalar essa parte

1. NÃO rode o `supabase.sql` original de novo — ele começa com
   `drop table ... cascade` e apagaria todos os dados já lançados.
2. Rode apenas o `supabase_gerentes_corretores.sql` uma vez no SQL Editor
   do mesmo projeto Supabase. Ele só adiciona o que falta (é seguro
   rodar de novo se precisar).
3. Suba o `script.js` novo no repositório do GitHub Pages.

## Novidades: campos do relatório

O relatório agora tem 8 campos, nesta ordem: Leads Novos, Interações,
Negociações, Agendamentos, Visitas, Propostas, Pré-vendas e Vendas 100%
(antes eram só 6: Interações, Negociações, Agendamentos, Visitas,
Propostas e Vendas).

- NÃO rode o `supabase.sql` original de novo — apagaria os dados.
- Rode apenas o `supabase_leads_prevendas.sql` uma vez no SQL Editor
  do mesmo projeto (é seguro rodar de novo se precisar). Lançamentos
  já existentes ficam com Leads Novos e Pré-vendas = 0 automaticamente.
- Suba o `script.js` novo no GitHub Pages.
