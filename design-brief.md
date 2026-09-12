# G.E. Corretora de Seguros: direção de design

## Design read
Site institucional para famílias, motoristas e empresas do Alto Tietê que precisam entender opções de proteção e chegar rapidamente a um atendimento humano.

## Concept spine
**Rotas de proteção.** Curvas amplas, linhas de percurso e camadas que se encontram representam os diferentes seguros convergindo para um único ponto seguro: o atendimento pessoal da G.E.

## Delivery tier
Editorial. A experiência privilegia clareza, confiança, carregamento rápido e microinterações funcionais.

Animation mode: scroll-reveal leve, com entrada escalonada, carrossel de marcas e pilha editorial no processo. Todos os movimentos respeitam `prefers-reduced-motion`.

## Locked palette
- Marinho profundo: `#101C4E`
- Azul de apoio: `#25366F`
- Vermelho de ação: `#D9192A`
- Amarelo de sinalização: `#F5C400`
- Branco: `#FFFFFF`
- Fundo frio: `#F5F7FC`
- Texto: `#111735`

A combinação vem diretamente do logo fornecido. O marinho domina para transmitir confiança; vermelho e amarelo aparecem somente em pontos de ação e orientação.

## Locked type
Manrope para títulos e corpo, com fallbacks de sistema. A fonte aberta tem desenho contemporâneo e arredondado, próximo do registro visual da Porto Roobert sem copiar a tipografia proprietária da Porto.

## Combinatorial pick
- Theme paradigm: Pristine Light
- Background character: solid with soft ambient depth
- Typography character: clean grotesk
- Opening architecture: abertura tipográfica limpa, sem logo ou fotografia no hero
- Section system: asymmetric premium flow
- Signature components: hover-accordion slices, gapless bento, vertical rhythm lines, layered image crop frames
- Narrative spine: journey/waypoints
- Second-read moment: macro crop carrying the brand color

## Section plan
1. Navegação fixa, com menu mobile em tela cheia e logo acima dos links
2. Abertura institucional tipográfica com logos estáticos das seguradoras, dimensionada para caber na primeira tela
3. Área editorial sobre a parceria com o Incrível AutoShopping
4. Dois carrosséis de marcas: 12 seguradoras e 24 operadoras de saúde fornecidas nos PDFs
5. Seguros em carrossel fotográfico de seis opções, exibidas uma por vez
6. Sobre nós em bloco editorial com linha de percurso
7. Plano de saúde em composição dividida e seletor de perfil
8. Processo em três cartões empilhados durante o scroll
9. FAQ em acordeão com contato adjacente, sem logo redundante
10. Endereço, horários e mapa incorporado do Google Maps
11. Rodapé escuro editorial com chamada ampla, sitemap e wordmark tipográfico

No mobile, toda composição multicoluna vira fluxo vertical; o trilho de parceiros permite rolagem horizontal e o pop-up usa altura dinâmica com conteúdo rolável.

## Asset plan
- Logo original fornecido pelo usuário no cabeçalho, menu mobile e pop-up; seus contêineres seguem a proporção real para não criar bordas laterais
- Marcas das 12 seguradoras e das 24 operadoras de saúde listadas nos PDFs fornecidos pelo usuário
- Fotografia editorial para a seção do Incrível AutoShopping, sem ocupar o hero
- Padrão vetorial de rotas e pontos em CSS/SVG
- Ícones funcionais com traço único e mesma espessura
- Favicon e ícones derivados das quatro cores da marca
- Capa social própria para compartilhamento

## Tier-1 interaction
Revelação suave por interseção, com opacidade, desfoque e deslocamento vertical leves. O processo usa cartões sticky para contar a jornada em três passos. Carrosséis de seguros e marcas aceitam setas, teclado, toque e rolagem horizontal. No menu mobile, os textos entram em sequência com o mesmo vocabulário de movimento.

## CTA inventory
- Abertura: botão vermelho estático e link sublinhado
- Navegação: botão marinho estático
- Cards de seguro: link em formato de botão sem animação
- Plano de saúde: botão amarelo estático
- Contato e pop-up: botões vermelhos estáticos
- Flutuante: somente o ícone do WhatsApp em `#25D366`

## Conversão e integrações
Pop-up em uma única etapa, aberto somente pelos botões de atendimento: dados básicos, interesse, perfil, situação atual, melhor horário e observação opcional. O envio abre imediatamente o WhatsApp com uma mensagem contextualizada e também registra o lead em segundo plano no endpoint interno `/api/lead`. Os eventos `dataLayer`, `ge:lead-event` e `ge:lead-created` continuam disponíveis para Nextags e ActiveCampaign.

## Anti-convergence ledger
Primeiro site desta conversa. A identidade é derivada dos materiais reais da corretora: papel de apólice, linhas de rota, selos e cores do logo. Eixos escolhidos: paleta marinho/vermelho/amarelo, Manrope, hero editorial offset, B2 suave, CTAs de rota/cantos/bloco, cantos macios de 16px.
