FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5678

CMD ["npm", "run", "dev"]
