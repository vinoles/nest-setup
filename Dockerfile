FROM node:22-alpine

WORKDIR /usr/src/app

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

RUN npm install -g bun && \
    mkdir -p /bun/store /usr/src/app/dist && chown -R node:node /bun /usr/src/app

USER node

COPY --chown=node:node package.json bun.lockb* ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./

RUN bun install

COPY --chown=node:node . .

EXPOSE 3000

CMD ["bun", "run", "start:dev"]