FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

ARG CACHEBUST=1
COPY . .

EXPOSE 3002

CMD ["node", "src/main/server.js"]
