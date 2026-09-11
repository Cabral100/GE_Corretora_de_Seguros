# Integrações do formulário

O formulário envia os dados para `POST /api/lead`. A função está pronta para Vercel e pode entregar o mesmo lead por três canais independentes.

## 1. E-mail

Configure no ambiente de hospedagem:

- `RESEND_API_KEY`: chave da conta Resend.
- `LEAD_EMAIL_TO`: e-mail que receberá os novos contatos.
- `LEAD_EMAIL_FROM`: remetente verificado na Resend.

## 2. Webhook para Nextags, n8n ou outro integrador

- `LEAD_WEBHOOK_URL`: endereço HTTPS que receberá o evento `lead.created`.
- `LEAD_WEBHOOK_TOKEN`: token opcional enviado no cabeçalho `Authorization`.

O corpo contém `name`, `phone`, `email`, `interest`, `profile`, `preference`, `currentStatus`, `bestTime`, `message`, `source`, `campaign` e `tags`.

## 3. ActiveCampaign

- `ACTIVECAMPAIGN_URL`: endereço base da conta ActiveCampaign.
- `ACTIVECAMPAIGN_TOKEN`: token privado da API.

Quando o visitante informa e-mail, o endpoint usa a rota `contact/sync` da ActiveCampaign. Listas, automações, campos personalizados e tags podem ser ligados depois pelo webhook sem alterar o formulário.

## WhatsApp

Edite `whatsappNumber` em `site-config.js` usando apenas código do país, DDD e número. Se estiver vazio, o site abre o seletor de contatos do WhatsApp com a mensagem já preenchida.

## Analytics e gerenciadores de tags

O front-end publica eventos em `window.dataLayer` e também dispara `ge:lead-event` no navegador. Para evitar exposição indevida, esses eventos contêm apenas interesse, perfil, situação atual e origem. O evento `ge:lead-created` contém o lead completo para uma integração controlada no site. Nome, telefone e e-mail também seguem para `/api/lead`.

O envio do formulário não aguarda essas integrações para abrir o WhatsApp. Assim, uma indisponibilidade temporária do e-mail, webhook ou ActiveCampaign não bloqueia o atendimento do cliente.

## Domínio

O domínio usado no SEO está definido como `gecorretoradeseguros.com.br`. Caso o endereço final seja outro, atualize `index.html`, `robots.txt` e `sitemap.xml` antes da publicação.
