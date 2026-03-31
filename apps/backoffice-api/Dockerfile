
FROM node:24-slim AS backoffice

ENV CI=true

# Install dependencies (apt instead of apk)
RUN apt-get update && apt-get install -y --no-install-recommends bash curl && \
  rm -rf /var/lib/apt/lists/*
RUN npm install -g corepack && corepack enable

WORKDIR /app

# Yarn caching layer
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Nx + TS config
COPY nx.json tsconfig.base.json ./

COPY apps/backoffice-api/ apps/backoffice-api/
COPY apps/backoffice-dashboard/ apps/backoffice-dashboard/
COPY apps/api/ apps/api/
COPY apps/dashboard/ apps/dashboard/

# Lib dependencies
COPY libs/backoffice-api-client/ libs/backoffice-api-client/

ENV NX_DAEMON=false

RUN yarn nx build backoffice-api --configuration=production --nxBail=true

RUN yarn nx build backoffice-dashboard --configuration=production --nxBail=true --output-style=stream

ARG VERSION=0.0.1
ENV VERSION=${VERSION}

ENV NODE_ENV=production

ENV PORT=8080

# Database defaults (can be overridden)
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_USERNAME=user
ENV DB_PASSWORD=pass
ENV DB_DATABASE=application_ctx

ENV BACKOFFICE_DB_HOST=postgres
ENV BACKOFFICE_DB_PORT=5432
ENV BACKOFFICE_DB_USERNAME=user
ENV BACKOFFICE_DB_PASSWORD=pass
ENV BACKOFFICE_DB_DATABASE=backoffice

# Auth defaults
ENV AUTH_MODE=basic
ENV BASIC_AUTH_USERNAME=admin
ENV BASIC_AUTH_PASSWORD=admin

# OIDC defaults (optional, can be left empty for basic auth)
ENV OIDC_ISSUER=
ENV OIDC_CLIENT_ID=
ENV OIDC_CLIENT_SECRET=
ENV OIDC_REDIRECT_URI=
ENV OIDC_AUDIENCE=
ENV OIDC_ALLOWED_DOMAIN=

# Frontend URL (for OAuth redirects)
ENV FRONTEND_URL=http://localhost:8080

# Session JWT (backend issues these, not OIDC provider)
ENV JWT_SECRET=change-this-in-production
ENV JWT_EXPIRES_IN=15m

# CORS
ENV CORS_ORIGIN=http://localhost:8080

# Environment
ENV ENVIRONMENT=production

# Features
ENV EXTERNAL_API_URL=https://app.daytona.io/api
ENV ADMIN_API_KEY=
ENV ADMIN_ORG_ID=

# Run migrations on startup (disable in production if using separate migration job)
ENV RUN_MIGRATIONS=true

EXPOSE 8080

HEALTHCHECK CMD [ "curl", "-f", "http://localhost:8080/api/v1/health" ]

ENTRYPOINT ["node", "dist/apps/backoffice-api/main.js"]
