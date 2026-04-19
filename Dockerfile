FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache bash git \
 && npm install -g wrangler

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4321 8788

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
