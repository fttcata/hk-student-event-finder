FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY config ./config
COPY routes ./routes
COPY queries ./queries
COPY middleware ./middleware
COPY realtime ./realtime
COPY utils ./utils
COPY scrapers ./scrapers
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["npm", "start"]
