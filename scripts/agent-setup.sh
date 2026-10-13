#!/usr/bin/env bash
# MARVEL PWA — one-link AI agent setup orchestrator.
# Usage: ./scripts/agent-setup.sh  (alias: npm run setup)
# Each phase is idempotent: re-running resumes safely.
# Supabase Cloud only. Never commit .env* or print secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
cd "$ROOT"

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }
ask()  { local v; printf '%s ' "$1"; IFS= read -r v; printf '%s' "$v"; }
ask_secret() { local v; printf '%s ' "$1"; IFS= read -rs v; printf '\n'; printf '%s' "$v"; }

set_env() {
  # set_env KEY VALUE — upsert into .env.local without touching other lines
  local key="$1" val="$2" esc
  esc=$(printf '%s' "$val" | sed 's/[\/&]/\\&/g')
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s/^${key}=.*/${key}=${esc}/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# ---------------------------------------------------------------- 00 prereqs
say "00/07 prereqs"
missing=0
for t in node npm git curl; do
  have "$t" || { warn "missing required: $t"; missing=1; }
done
for t in gh supabase vercel ollama psql; do
  have "$t" || warn "missing optional (installs later or login needed): $t — brew install $t / npm i -g vercel / brew install supabase/tap/supabase / curl -fsSL https://ollama.com/install.sh | sh"
done
node_major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
[ "$node_major" -ge 20 ] || { warn "node >= 20 required (have $(node -v 2>/dev/null || echo none))"; missing=1; }
[ "$missing" -eq 0 ] || { warn "Install the required tools above, then re-run."; exit 1; }
echo "node $(node -v) npm $(npm -v) — ok"

# ---------------------------------------------------------------- 10 github
say "10/07 github (your account)"
if have gh; then
  gh auth status >/dev/null 2>&1 || { echo "gh needs login:"; gh auth login; }
  if ! git remote get-url origin >/dev/null 2>&1; then
    name=$(ask "No git remote. New repo name? [marvel-pwa]:")
    gh repo create "${name:-marvel-pwa}" --private --source=. --push
  else
    echo "remote: $(git remote get-url origin)"
  fi
else
  warn "gh CLI missing — push manually later: gh repo create --private --source=. --push"
fi

# ---------------------------------------------------------------- 20 supabase
say "20/07 supabase cloud"
if have supabase; then
  supabase login || true
  if [ ! -f "$ROOT/supabase/config.toml" ]; then
    warn "supabase/config.toml missing — run phase 3 of the plan first."
  fi
  if ! supabase status >/dev/null 2>&1; then
    echo "Linked projects:"; supabase projects list || true
    ref=$(ask "Paste Supabase project ref (20-char id from dashboard URL):")
    supabase link --project-ref "$ref"
  fi
  supabase db push
  # seed (idempotent SQL) + storage buckets + admin profile template
  if have psql; then
    db_url=$(supabase status 2>/dev/null | grep -o 'postgres://[^ ]*' | head -1 || true)
    [ -n "${db_url:-}" ] && psql "$db_url" -f "$ROOT/supabase/seed.sql" || warn "seed via dashboard SQL editor: paste supabase/seed.sql"
  else
    warn "psql missing — paste supabase/seed.sql in Dashboard SQL Editor, then continue."
    printf 'Press Enter when seed.sql is applied... '; IFS= read -r _
  fi
  sup_url=$(ask "Paste Supabase project URL (https://<ref>.supabase.co):")
  anon=$(ask_secret "Paste Supabase anon key (hidden, never logged):")
  set_env VITE_SUPABASE_URL "$sup_url"
  set_env VITE_SUPABASE_ANON_KEY "$anon"
  echo "wrote VITE_SUPABASE_* to .env.local"
  echo "Next (dashboard, 1 min): Auth -> Users -> add storekeeper login, then run supabase/bootstrap-admin.sql with their email + auth uuid."
else
  warn "supabase CLI missing — install: brew install supabase/tap/supabase — then re-run."
  exit 1
fi

# ---------------------------------------------------------------- 30 ollama
say "30/07 ollama (your admin machine)"
ram_gb=0; gpu="none"
if [ "$(uname)" = "Darwin" ]; then
  ram_gb=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1024/1024/1024}')
  system_profiler SPDisplaysDataType 2>/dev/null | grep -qi 'metal' && gpu="apple-silicon"
else
  ram_gb=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0)
  have nvidia-smi && nvidia-smi -L >/dev/null 2>&1 && gpu=$(nvidia-smi -L | head -1 || echo "nvidia")
fi
echo "detected: RAM ~${ram_gb}GB, GPU: $gpu"
if [ "$ram_gb" -ge 16 ] && [ "$gpu" != "none" ]; then
  rec="qwen2.5:3b"
else
  rec="laya"
fi
model=$(ask "Ollama model for offline classify? [${rec}]:")
model=${model:-$rec}
if have ollama; then
  ollama pull "$model" || warn "ollama pull failed — keyword fallback in src/lib/ai.ts still works offline."
  ollama serve >/dev/null 2>&1 &
  sleep 2
  set_env VITE_OLLAMA_URL "http://localhost:11434"
  set_env VITE_OLLAMA_MODEL "$model"
  curl -sf -m 5 -X POST http://localhost:11434/api/generate \
    -d "{\"model\":\"$model\",\"prompt\":\"Reply {\\\"category\\\":\\\"Dev Board\\\",\\\"p\\\":1,\\\"merge_with_id\\\":null,\\\"merge_p\\\":0}\",\"stream\":false}" \
    >/dev/null && echo "ollama ping ok ($model)" || warn "ollama ping failed — app falls back to keyword classify."
else
  warn "ollama missing — install: curl -fsSL https://ollama.com/install.sh | sh — then: ollama pull $model"
  set_env VITE_OLLAMA_URL "http://localhost:11434"
  set_env VITE_OLLAMA_MODEL "$model"
fi

# ---------------------------------------------------------------- 40 llm
say "40/07 cloud LLM (your provider + key)"
echo "Which cloud model cleans up 10s voice notes (Job B)? Any provider works."
provider=$(ask "Provider name? [openrouter]:"); provider=${provider:-openrouter}
docs=$(ask "Provider docs URL (agent reads this to wire base URL + model):")
key=$(ask_secret "API key (hidden, never logged):")
model_id=$(ask "Model id (blank = agent picks cheap default from docs):")
set_env VITE_LLM_PROVIDER "$provider"
if [ -n "$docs" ]; then
  echo "Agent: fetch $docs and derive VITE_LLM_BASE_URL + VITE_LLM_MODEL."
  echo "Default path keeps OpenAI-compatible POST {BASE}/chat/completions (Bearer)."
  echo "If docs show a different shape, add one adapter in src/lib/llm-providers.ts"
  echo "selected by VITE_LLM_PROVIDER and patch src/lib/ai.ts at buildLlmRequest only."
fi
base=$(ask "Base URL (from docs, e.g. https://openrouter.ai/api/v1):")
[ -n "$model_id" ] || model_id=$(ask "Model id (required if not given above):")
set_env VITE_LLM_BASE_URL "$base"
set_env VITE_LLM_API_KEY "$key"
set_env VITE_LLM_MODEL "$model_id"
echo "wrote VITE_LLM_* to .env.local + will mirror to vercel env in phase 50."

# ---------------------------------------------------------------- 50 vercel
say "50/07 vercel (your account)"
if have vercel; then
  vercel login || true
  vercel link || true
  # shellcheck disable=SC1091
  [ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
  for v in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_LLM_BASE_URL VITE_LLM_API_KEY VITE_LLM_MODEL VITE_QR_BASE; do
    val=$(printenv "$v" || true)
    [ -n "$val" ] && printf '%s' "$val" | vercel env add "$v" production --force 2>/dev/null || warn "vercel env add $v — set manually if skipped."
  done
  url=$(vercel --prod --confirm | grep -oE 'https://[^ ]+' | tail -1)
  echo "live: $url"
  for p in "/" "/i/test" "/l/MRV-R1" "/m/test"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url$p" || echo 000)
    echo "$p -> $code"
  done
else
  warn "vercel CLI missing — install: npm i -g vercel — then: vercel login && vercel link && vercel --prod"
fi

# ---------------------------------------------------------------- 60 verify
say "60/07 verify"
npm ci
node scripts/check-env.mjs
npm run build
echo ""
echo "================ READINESS REPORT ================"
[ -f "$ENV_FILE" ] && grep -oE '^[A-Z_]+=' "$ENV_FILE" | tr -d '=' | sed 's/^/env: /'
echo "seed expects: 10 categories, 8 locations, 13 items/lots, 5 members"
echo "next: print location QRs, run scripts/trial-30-items.md, docs/qa.md sign-off"
echo "=================================================="
