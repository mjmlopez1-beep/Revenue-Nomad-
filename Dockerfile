FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER_BUILD=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pilot starter credits (the landing page shows whatever this is). Heap: 1 GB held 100 concurrent
# members (peak RSS about 700 MB); 320 MB ran out of memory at that load. Needs a 1 GB+ container.
ENV RN_STARTER_CREDITS=25
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN addgroup -S nomad && adduser -S nomad -G nomad
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Encrypted member seed (opened at runtime with RN_INTEL_SEED_KEY)
COPY --from=builder /app/data/intel-seed.enc ./data/intel-seed.enc
# Never serve the sample data from this image. If the seed does not open (RN_INTEL_SEED_KEY
# missing or wrong), every route answers 503 and GET /api/health fails, so the deploy does not
# go live and nobody can sign in with the sample code.
ENV RN_REQUIRE_SEED=1
# Merlin's state (intel.json, its backups, company icons) lives here; mount a volume at /data to persist across deploys.
ENV RN_DATA_DIR=/data
RUN mkdir -p /data && chown -R nomad:nomad /data /app
USER nomad
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# Set these on the host (Railway service variables). The server reads them when it runs, so
# nothing here is baked into the build and a change needs only a restart. See .env.example.
#   RN_INTEL_SEED_KEY   opens data/intel-seed.enc (the contents of data/intel-seed.key). Required.
#   RN_ID_SECRET        signs public ids and unsubscribe links. Give it the seed key's current
#                       value once and keep it, so no id or link already sent changes.
#   RN_ADMIN_EMAILS     admin addresses (comma-separated).
#   RN_SUPPORT_EMAIL    where members write for sign-in help, questions and feedback. Shown on
#                       the sign-in screens and in the app (View.contact.support).
#   RN_INTRO_EMAIL      where "Ask for an intro" to a seat holder goes (View.contact.intro).
#   RN_CRON_SECRET, RN_SCAN, RN_PUBLIC_URL, RESEND_API_KEY, RN_EMAIL_FROM: the weekly scan and email.
#   RN_CLIENT_IP_HEADER or RN_TRUSTED_PROXY_HOPS: the client address the rate limits and the
#                       invite rule use. Check once with RN_LOG_IP_HEADERS=1, then remove it.
# Health check: GET /api/health answers 200 only when the seed opened, the state loaded and
# /data takes writes (railway.json sets it with 15 s to drain; set it in the service settings too).
# The volume at /data must be writable by the nomad user.
CMD ["node", "server.js"]
