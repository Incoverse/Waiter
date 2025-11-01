FROM node:latest
LABEL org.opencontainers.image.authors="Inimi (contact@inimicalpart.com)"
WORKDIR /app

COPY . .

RUN node -v
RUN npm -v

RUN npm install -g typescript pnpm

RUN pnpm install
RUN pnpm cleanup
RUN pnpm build


ENTRYPOINT ["pnpm", "start"]
