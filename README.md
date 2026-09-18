# Site da G.E. Corretora de Seguros

Site institucional responsivo com formulário rápido em uma única etapa, mensagem pronta no WhatsApp, envio de leads por e-mail e pontos de conexão para automações.

## Visualizar localmente

Com Python instalado:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Abra `http://127.0.0.1:4173` no navegador.

Esse modo é suficiente para revisar o visual e testar a abertura do WhatsApp. Para testar também a função `/api/lead`, use a Vercel CLI com `npx vercel dev` depois de configurar as variáveis de ambiente.

## Arquivos principais

- `index.html`: conteúdo, SEO e formulários.
- `styles.css`: identidade visual e responsividade-base.
- `enhancements.css`: refinamentos da abertura, carrosséis, mapa, pop-up e rodapé editorial.
- `app.js`: pop-up de etapa única, validações, múltiplos carrosséis, revelações no scroll, WhatsApp e eventos.
- `site-config.js`: número público do WhatsApp e opções do pop-up.
- `api/lead.js`: entrega de leads por e-mail, webhook e ActiveCampaign.
- `docs/INTEGRACOES.md`: configuração dos serviços externos.

