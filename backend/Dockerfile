# Dockerfile Multi-Stage para o Backend FullFast (NestJS + Prisma)
# Usar 2 estagios mantem a imagem final menor, mais rapida e mais segura.

# ============================================================================
# ESTAGIO 1 (builder): instala dependencias, gera Prisma Client e compila TS -> JS
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia primeiro apenas package.json e schema do Prisma para aproveitar o cache de camadas do Docker
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copia o restante do codigo-fonte, gera o PrismaClient e compila o TypeScript para dist/
COPY . .
RUN npx prisma generate && npm run build

# ============================================================================
# ESTAGIO 2 (runner): imagem final enxuta apenas com o necessario para rodar
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Traz do estagio builder apenas os arquivos compilados e dependencias de execucao
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Boa pratica de seguranca DevOps: roda o container como usuario comum (nao-root)
USER node

# Documenta a porta onde a API escuta dentro do container
EXPOSE 3001

# Ao iniciar: aplica migrations pendentes no PostgreSQL e sobe o servidor compilado
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
