FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY tsconfig.json ./
COPY nest-cli.json ./
COPY src ./src

RUN yarn build

EXPOSE 8080

CMD ["yarn", "start"]