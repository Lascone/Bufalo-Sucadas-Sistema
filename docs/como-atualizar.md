# Como subir atualização do Búfalo Sucata Gestor

Documento para o assistente (Cursor) e para você. Sempre que for lançar uma att, peça: **“leia o md de atualização e sobe a release”**.

## Ideia

| Onde | O quê |
|------|--------|
| **Aqui** (seu PC / Cursor) | Mexe no código → publica o instalador no GitHub Releases |
| **Sucata** (app instalado) | Configurações → Verificar atualizações → Baixar → Instalar |

**Não usa GitHub Actions** (billing da conta). A publicação é **local**, com o script.

**`pnpm dev` não atualiza.** Só o app instalado pelo `.exe`.

---

## Pré-requisitos (sua máquina)

1. Node 20+ e `pnpm`
2. Logado no GitHub: `gh auth login`
3. Token disponível: o script usa `gh auth token` (ou `$env:GH_TOKEN`)
4. Repo do publish: `Lascone/Bufalo-Sucadas-Sistema` (já no `apps/desktop/package.json`)

---

## O que o assistente deve fazer quando você pedir uma att

1. Ler **este arquivo** (`docs/como-atualizar.md`).
2. Confirmar o que mudou nesta conversa / no código (bugfix, feature, etc.).
3. Decidir a **nova versão** (semver):
   - patch `0.1.2` → `0.1.3` — correção pequena
   - minor `0.1.x` → `0.2.0` — feature nova
   - major só se quebrar compatibilidade de propósito
4. Atualizar versão em:
   - `apps/desktop/package.json` → `"version"`
   - `packages/shared/src/constants.ts` → `APP_VERSION`
   - `package.json` (raiz) → `"version"` (manter alinhado)
5. (Opcional) Marcar algo visível em Configurações / changelog curto, se o usuário pedir “pra eu ver que atualizou”.
6. Rodar na **raiz do monorepo**:

```powershell
$env:GH_TOKEN = gh auth token
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release-desktop.ps1
```

Ou com bump automático do número (também ajusta desktop + shared):

```powershell
$env:GH_TOKEN = gh auth token
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release-desktop.ps1 -Version 0.1.3
```

7. Esperar o script terminar com sucesso (precisa existir `dist\index.html` no meio do caminho).
8. Confirmar a release:

```powershell
gh release view v0.1.3 --json url,assets --jq "{url, assets: [.assets[].name]}"
```

Deve ter pelo menos:

- `BufaloSucataGestor-Setup-X.Y.Z.exe`
- `BufaloSucataGestor-Setup-X.Y.Z.exe.blockmap`
- `latest.yml`

9. Commit/push do bump de versão **só se o usuário pedir** (o publish no GitHub Releases já sobe o instalador; tag costuma ser criada pelo electron-builder).
10. Responder com o **link da release** e o que fazer **na Sucata**.

---

## Na Sucata (depois que a release existir)

1. Abrir o **Búfalo Sucata Gestor instalado** (atalho / `.exe`), não o dev.
2. Ir em **Configurações**.
3. **Verificar atualizações**.
4. Se aparecer versão nova: **Baixar update** → **Instalar e reiniciar**.
5. Conferir o número da versão em Configurações.

### Primeira instalação na Sucata

Baixar o Setup da release mais recente e instalar uma vez:

https://github.com/Lascone/Bufalo-Sucadas-Sistema/releases

Depois disso, updates seguintes podem vir pelo botão do app.

---

## Frases prontas para você usar no chat

- `Leia docs/como-atualizar.md e sobe a release 0.1.3`
- `Att de update: lê o md de atualização e publica`
- `Bump patch, publica no GitHub Releases e me manda o link`

---

## Problemas comuns

| Sintoma | Causa / o que fazer |
|---------|---------------------|
| “Modo desenvolvimento” ao verificar update | Está no `pnpm dev`. Usar o app instalado. |
| Script falha em `dist/index.html` | Build incompleto; rodar de novo e ver erros do `pnpm build`. |
| Falha de download na Sucata (repo privado) | GitHub privado exige auth. Opções: tornar o repo **público**, ou levar o `.exe` por USB/pen. |
| Actions vermelho / billing | Ignorar. Release é pelo script local, não pelo CI. |
| `pwsh` não existe | Usar `powershell -File .\scripts\release-desktop.ps1`. |

---

## Arquivos envolvidos

- Script: [`scripts/release-desktop.ps1`](../scripts/release-desktop.ps1)
- Publish config: `apps/desktop/package.json` → `build.publish` (GitHub owner/repo)
- Updater: `apps/desktop/electron/main.ts` + UI em `SettingsPage.tsx`
- Workflow Actions: desligado (só `workflow_dispatch`); não depende dele

---

## Checklist rápido

- [ ] Código ok / testado no que dá
- [ ] Versão bumped
- [ ] `release-desktop.ps1` rodou OK
- [ ] Release tem `.exe` + `latest.yml`
- [ ] Link passado pro usuário
- [ ] Sucata: app instalado → Verificar atualizações
