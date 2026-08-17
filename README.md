
# 📚 Study System

Um sistema de estudos pessoal, feito pra rodar direto do navegador, sem
backend, sem instalação chata. É feito pra você **usar** (organizar
matérias, anotações, flashcards, revisões espaçadas e pomodoro) e
também pra **ler o código** — todo comentado em inglês, pensado como
material de estudo em si.

## ✨ O que ele faz

- **Matérias** — organiza tudo por tema (ex: Inglês, Programação, Direito...) — crie, **renomeie, troque a cor ou exclua** (excluir uma matéria apaga junto suas anotações e flashcards, com confirmação antes)
- **Anotações** — texto livre, vinculado a uma matéria, **totalmente editável**
- **Flashcards** — pergunta/resposta, com repetição espaçada (algoritmo
  parecido com o do Anki: SM-2 simplificado), **conteúdo editável sem perder o progresso de revisão**
- **Revisões** — dois jeitos de estudar, alternáveis a qualquer momento:
  - 🧠 **Mapa mental** (padrão): árvore linear — a matéria no topo, "Anotações" e "Flashcards" como ramos, e cada item como uma caixa que **mostra o texto inteiro, sem cortar** (a caixa cresce pro tanto que precisar). Arraste pra mover, dê zoom (scroll ou botões), busque por palavra-chave, e clique numa caixa pra abrir ela **em tamanho grande** — se for flashcard, vira e avalia (Errei/Difícil/Bom/Fácil) sem sair da janela
  - 🔁 **Sequencial**: fila clássica de flashcards, um de cada vez
- **🎨 Personalizar** — cor principal (paleta pronta ou seletor de cor livre), cantos (retos/normais/arredondados), tamanho do texto (pequeno/médio/grande — afeta o app inteiro, incluindo o mapa mental), e um modo **"colorir por matéria"** que pinta anotações, flashcards e o mapa mental com a cor de cada matéria, tipo post-its. Tudo aplica na hora, sem precisar recarregar
- **Pomodoro** — timer configurável com anel de progresso, contagem de
  pomodoros do dia, streak, e **as durações que você define ficam salvas** (não voltam pro padrão 25/5/15 ao reabrir)
- **Exportar/Importar dados** — baixa um `.json` com tudo (matérias, anotações, flashcards, sessões e configs, incluindo seu tema personalizado), e **importa esse mesmo arquivo de volta** — super útil pra não ter que recriar tudo na mão toda vez que você testa uma versão nova do app

## 🧱 Stack e por quê

| Camada | Tecnologia | Motivo |
|---|---|---|
| Estrutura | HTML puro | sem framework, sem build step — abre e roda |
| Estilo | CSS puro (custom properties), **embutido em `<style>` dentro do `index.html`** | evita bugs de alguns navegadores (Safari, principalmente) que restringem uma página aberta via `file://` de carregar outro arquivo local (`css/style.css`) como stylesheet. O arquivo `css/style.css` continua no repo como a fonte "de leitura" — dá uma olhada nele pra estudar, só não é ele que o navegador carrega quando você abre direto do disco |
| Lógica | JavaScript "vanilla" (sem libs) | fundamentos, sem mágica escondida |
| Persistência | `localStorage` do navegador | zero servidor, seus dados ficam no seu PC |
| Relatórios extra | Python | script separado, pra praticar Python analisando os mesmos dados |

Não tem `npm install`, não tem bundler. É só abrir o `index.html`.

## 📂 Estrutura de pastas

```
study-system/
├── index.html            → estrutura da página (o "esqueleto")
├── css/
│   └── style.css         → todo o visual (cores, tipografia, layout)
├── js/
│   ├── storage.js         → única camada que fala com o localStorage
│   ├── srs.js              → algoritmo de repetição espaçada (SM-2 simplificado)
│   ├── mindmap.js           → calcula as posições dos nós do mapa mental (só matemática)
│   ├── pomodoro.js          → classe do timer pomodoro (não mexe no HTML)
│   └── app.js                → "cola" tudo junto: eventos, renderização de telas
├── python/
│   └── study_report.py    → lê o .json exportado e imprime um relatório no terminal
└── README.md
```

A ideia por trás dessa separação (isso é um padrão real chamado
**separation of concerns**): cada arquivo JS tem UM trabalho.
`storage.js` só sabe salvar/ler dados. `srs.js` só sabe calcular
datas. `pomodoro.js` só sabe contar o tempo. `app.js` é o único que
sabe mexer na tela — ele "pergunta" pros outros e desenha o resultado.

## ▶️ Como usar

1. Baixe/clone o repositório
2. Abra `index.html` no navegador (duplo clique já funciona)
3. Crie sua primeira matéria, adicione anotações e flashcards
4. Use a aba **Revisões** todo dia — só aparecem os cards que "vencem" hoje
5. Use a aba **Pomodoro** pra cronometrar seus blocos de foco

Todos os dados ficam salvos automaticamente no seu navegador
(`localStorage`). Se você limpar os dados de navegação do site, eles
somem — por isso existe o botão **Exportar dados**, pra fazer backup.

### Gerando um relatório em Python

```bash
# depois de clicar em "Exportar dados" no navegador:
cd python
python study_report.py ~/Downloads/study-system-export-2026-07-09.json
```

## 🧠 Como o repetição espaçada funciona (resumo)

Cada flashcard guarda três números: `interval` (dias até a próxima
revisão), `easeFactor` (o quão "fácil" o card tem sido) e
`repetitions` (quantas vezes seguidas você acertou). Toda vez que
você responde Errei/Difícil/Bom/Fácil, `js/srs.js` recalcula esses
três números e decide a nova `dueDate`. Errar zera o intervalo;
acertar aumenta ele progressivamente — é por isso que cards que você
já domina aparecem cada vez menos.

## 🛠️ Ideias pra evoluir (fica de exercício)

- [ ] Adicionar autenticação + backend real (Node/Express) pra sincronizar entre dispositivos
- [ ] Modo escuro/claro alternável
- [ ] Estatísticas de acerto por matéria (gráfico)
- [ ] Importar flashcards em massa via CSV
- [ ] Notificação de "hora de revisar" via Notification API

---

Feito com carinho pra estudar de verdade. Bons estudos! ✺

A interface tem o íntuito de auxiliar o usuário a organizar ideias, criar revisões, anotações 
e ter um local fixo digital para você armazenar informações importantes para seus estudos.

https://devtolps.github.io/Interface-de-Estudos/

