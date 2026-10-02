# ===================================================
# E2Aubooks - Production Image
#   1. build    : vite bundle
#   2. tts-cpu  : Python runtime for the TTS daemons (CPU torch)
#   3. tts-gpu  : same, CUDA torch
#   4. runtime-cpu / runtime-gpu : Node server + the matching Python runtime
#
# The app spawns one daemon per engine (vieneu/mms/kokoro) on demand, so the
# Python interpreter and the daemon source must live inside the image —
# pointing TTS_PYTHON at a host venv does not work from a container.
# ===================================================

# ---------- 1. frontend build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# NODE_ENV must stay unset here: this project needs devDependencies (vite,
# tailwind, typescript) to build, and `npm install` honours NODE_ENV=production
# by omitting them.
ENV NODE_ENV=development

COPY package.json bun.lock* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY server.ts ./

RUN npx vite build

# ---------- 2. TTS daemons, CPU torch ----------
FROM python:3.12-slim-bookworm AS tts-cpu
RUN apt-get update && apt-get install -y --no-install-recommends \
      libsndfile1 \
 && rm -rf /var/lib/apt/lists/*
COPY docker/requirements-tts.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ---------- 3. TTS daemons, CUDA torch ----------
FROM tts-cpu AS tts-gpu
COPY docker/requirements-tts.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --force-reinstall \
      --index-url https://download.pytorch.org/whl/cu124 \
      torch==2.12.1 torchaudio==2.11.0

# ---------- 4a. runtime (CPU) ----------
FROM python:3.12-slim-bookworm AS runtime-cpu
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# node:22-bookworm-slim already has the right glibc, so copy the interpreter
# and its shared libs from the official image instead of installing Node.
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

COPY --from=tts-cpu /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=tts-cpu /usr/local/bin/python3.12 /usr/local/bin/python3.12
RUN ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3
COPY --from=tts-cpu /usr/lib/x86_64-linux-gnu/libstdc++.so.6* /usr/lib/x86_64-linux-gnu/
# Copy the libsndfile runtime out of tts-cpu rather than apt-get installing it:
# the slim Debian repos in this build context fail GPG verification, and the
# library is already present in the stage that installed it.
COPY --from=tts-cpu /usr/lib/x86_64-linux-gnu/libsndfile.so* /usr/lib/x86_64-linux-gnu/

ENV TTS_PYTHON=/usr/local/bin/python3
ENV VIENEU_SRC=/app/tts/vieneu-src
ENV TTS_DAEMON=/app/tts/tts_daemon.py
ENV PATH=/usr/local/lib/node_modules/.bin:$PATH

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund \
 && npm cache clean --force \
 && node -e "require.resolve('tsx/package.json')"

COPY --from=build /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY docker/tts ./tts
RUN mkdir -p /app/models /app/ebooks_queue /app/audiobooks_output

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server.ts"]

# ---------- 4b. runtime (GPU) ----------
FROM runtime-cpu AS runtime-gpu
COPY --from=tts-gpu /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
ENV DEVICE=cuda
ENV TORCH_DTYPE=float16
