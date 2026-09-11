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
- `styles.css`: identidade visual e responsividade.
- `app.js`: pop-up de etapa única, validações, carrossel, revelações no scroll, WhatsApp e eventos.
- `site-config.js`: número público do WhatsApp e opções do pop-up.
- `api/lead.js`: entrega de leads por e-mail, webhook e ActiveCampaign.
- `docs/INTEGRACOES.md`: configuração dos serviços externos.

## Antes de publicar

1. Preencha o número do WhatsApp em `site-config.js`.
2. Configure o e-mail de destino e as credenciais na hospedagem conforme `docs/INTEGRACOES.md`.
3. Confirme o domínio final. O SEO está preparado para `gecorretoradeseguros.com.br`.
4. Rode `npm.cmd run check` no Windows para executar a validação local.

Nenhuma chave privada deve ser colocada em `site-config.js` ou enviada ao navegador.
