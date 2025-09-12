FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
