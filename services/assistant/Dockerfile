FROM public.ecr.aws/docker/library/node:22-bookworm-slim
WORKDIR /app
COPY packages/shared ./packages/shared
COPY services/assistant ./services/assistant
WORKDIR /app/services/assistant
RUN npm install --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
