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
Venda > Proposta > Visita > Agendamento > Negociação > Interação.

Observação: esta versão usa uma sessão própria armazenada em token e funções SECURITY DEFINER no Supabase, sem expor acesso direto às tabelas para o frontend.
