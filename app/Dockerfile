FROM node:24-alpine AS build
WORKDIR /srv
COPY app/package*.json ./
RUN npm ci
# The alias in vite.config.ts reaches outside app/, so the shared module must be
# in place at the same relative path before the build runs.
COPY shared/ /shared/
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /srv
ENV NODE_ENV=production
# The image ships an npm CLI (and its own node_modules — tar, sigstore, etc.) that this
# container never runs.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build /srv/build ./build
COPY --from=build /srv/node_modules ./node_modules
COPY --from=build /srv/package.json ./
COPY app/migrate.mjs db/schema.sql ./

USER node
EXPOSE 3000
CMD ["sh", "-c", "node migrate.mjs && node build"]
