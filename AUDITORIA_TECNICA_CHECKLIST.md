# Auditoria Tecnica - Checklist Executavel

Data da auditoria: 2026-02-07  
Repositorio: `c:\Users\user\Desktop\loja-platform`

## Resumo executivo
- Status geral: **ATENCAO**
- Bloqueadores principais:
1. Higiene de repositorio comprometida (`.env` rastreado e muitos artefatos gerados versionados).
2. Estado de submodulo inconsistente (`gitlink` sem `.gitmodules`).
3. Worktree com muitas mudancas simultaneas sem gate de validacao final.

## Execucao do plano de correcao (2026-02-07)

Aplicado nesta execucao:
1. `.gitignore` raiz reforcado para Python/Node/Flutter/IDE.
2. Submodulo mobile regularizado com `.gitmodules`.
3. `backend/.env` desrastreado do indice Git (arquivo local preservado).
4. Artefatos gerados desrastreados do indice (`__pycache__`, `*.pyc`, cache Flutter/Chrome).
5. `backend/app/api/routes/admin_catalog.py` atualizado para entradas tipadas em criacao (`ProductCreateIn` / `ProductVariantCreateIn`) e persistencia de preco com `Decimal`.
6. Gate de CI adicionado em `.github/workflows/technical-audit.yml` + `scripts/check_repo_hygiene.sh`.

Validacao apos execucao:
- `git ls-files backend/.env` -> sem retorno (`OK`).
- `git ls-files | rg "__pycache__|\.pyc$|\.dart_tool|android\.gradle-nb-cache"` -> sem retorno (`OK`).
- `git submodule status` -> sem erro fatal (`OK`, submodulo ainda nao inicializado no root, prefixo `-`).

Bloqueios de ambiente (nao resolvidos aqui):
- `python -m pip install -r requirements-dev.txt` falhou por indisponibilidade de pacote no indice (`email-validator==2.2.0`).
- `python -m pytest tests/test_admin_security_and_uploads.py -q` segue bloqueado por `httpx` ausente.
- `docker compose ...` indisponivel localmente (daemon Docker nao encontrado).

## Checklist executavel (com status atual)

Legenda de status:
- `OK`: passou no estado atual
- `ATENCAO`: risco relevante, mas nao bloqueia sozinho
- `CRITICO`: deve ser corrigido antes de release

### 1) Integridade de repositorio

1. [CRITICO] Worktree limpo antes de release  
Comando:
```powershell
git status --short
```
Criterio de aprovacao: sem linhas de `M`, `D`, `??` para arquivos fora da release planejada.
Resultado atual: **falhou** (muitas mudancas em `backend/`, `admin_panel/`, `mobile_app/`).

2. [CRITICO] Segredos locais nao rastreados  
Comando:
```powershell
git ls-files backend/.env
```
Criterio de aprovacao: sem retorno.
Resultado atual: **falhou** (`backend/.env` esta rastreado).

3. [CRITICO] Sem cache/artefatos gerados versionados  
Comando:
```powershell
git ls-files | rg "__pycache__|\.pyc$|\.dart_tool|android\.gradle-nb-cache"
```
Criterio de aprovacao: sem retorno.
Resultado atual: **falhou** (258 entradas).

4. [CRITICO] Configuracao de submodulos consistente  
Comandos:
```powershell
git ls-files -s mobile_app/flutter_application_1_loja_virtual
git submodule status
```
Criterio de aprovacao: se houver `160000` (gitlink), precisa existir `.gitmodules` valido e `git submodule status` sem erro.
Resultado atual: **falhou** (`160000 ... mobile_app/flutter_application_1_loja_virtual` + erro "no submodule mapping found in .gitmodules").

5. [ATENCAO] `.gitignore` raiz cobre stacks usadas (Python/Node/Flutter/IDE)  
Comando:
```powershell
Get-Content .gitignore
```
Criterio de aprovacao: incluir regras para `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.venv/`, `.dart_tool/`, `.idea/`, etc.
Resultado atual: **falhou** (apenas `node_modules`, `.env`, `dist`, `build`).

### 2) Banco e migracoes

6. [OK] Cadeia de migracoes sequencial e presente ate o head atual  
Comando:
```powershell
Get-ChildItem backend/alembic/versions -File | Sort-Object Name | ForEach-Object { $_.Name }
```
Criterio de aprovacao: sequencia coerente sem saltos inesperados.
Resultado atual: **passou** (`0001` ate `0012` presentes).

7. [ATENCAO] Aplicar migracoes em ambiente limpo  
Comando:
```powershell
docker compose -f docker-compose.dev.yml --env-file backend/.env run --rm api alembic upgrade head
```
Criterio de aprovacao: `upgrade head` sem erro.
Resultado atual: **nao executado nesta auditoria**.

### 3) Qualidade de codigo backend

8. [ATENCAO] Contratos de entrada tipados (evitar `payload: dict`)  
Comando:
```powershell
Select-String -Path backend/app/api/routes/admin_catalog.py -Pattern "payload: dict|base_price=float|price=float"
```
Criterio de aprovacao: endpoints administrativos com schemas Pydantic e sem conversoes monetarias por `float`.
Resultado atual: **falhou** (ocorrencias em `admin_catalog.py`).

9. [OK] Envelope padrao de erro e correlacao de request  
Comando:
```powershell
rg -n "request_id|exception_handler|legacy_router|include_router\(legacy_router\)" backend/app/main.py
```
Criterio de aprovacao: middleware de `request_id`, handlers consistentes e roteamento claro.
Resultado atual: **passou** (implementado).

10. [OK] Testes de isolamento multi-tenant existentes  
Comando:
```powershell
rg -n "test_no_leak|404|Anti-vazamento" backend/tests/test_tenant_isolation.py
```
Criterio de aprovacao: cobertura minima para anti-vazamento por loja.
Resultado atual: **passou** (testes presentes).

### 4) Testes e ambiente de desenvolvimento

11. [ATENCAO] Dependencias de teste instaladas no ambiente local  
Comandos:
```powershell
python -m pytest tests/test_admin_security_and_uploads.py -q
Get-Content backend/requirements-dev.txt
```
Criterio de aprovacao: pytest executa sem erro de dependencia ausente.
Resultado atual: **falhou no ambiente local auditado** (`httpx` ausente em runtime), embora `requirements-dev.txt` inclua `httpx==0.27.2`.

## Evidencias rapidas (arquivos)
- `.gitignore:1`
- `.gitignore:4`
- `backend/app/api/routes/admin_catalog.py:253`
- `backend/app/api/routes/admin_catalog.py:265`
- `backend/app/api/routes/admin_catalog.py:355`
- `backend/app/api/routes/admin_catalog.py:369`
- `backend/app/main.py:16`
- `backend/app/main.py:199`
- `backend/tests/test_tenant_isolation.py:61`
- `backend/tests/test_tenant_isolation.py:90`

## Plano de correcao recomendado (ordem)
1. Corrigir integridade Git: decidir se `mobile_app/flutter_application_1_loja_virtual` sera pasta normal ou submodulo; alinhar `.gitmodules`.
2. Desrastrear segredos e artefatos (`backend/.env`, caches Python/Flutter/Chrome), reforcar `.gitignore` raiz.
3. Reinstalar deps de dev/teste e rodar gates minimos (`pytest`, build do painel).
4. Refatorar `admin_catalog` para schemas tipados e valores monetarios em `Decimal`.
5. Congelar checklist em CI (job de higiene + testes criticos).
