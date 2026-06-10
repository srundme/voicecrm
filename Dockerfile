FROM node:22-slim

RUN npm install -g pnpm@10

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN BASE_PATH=/ pnpm --filter @workspace/web run build

RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
