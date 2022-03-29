# Build Postgres
FROM postgres:14 as immich_postgres

ENV PGDATA=/var/lib/postgresql/data
ENV POSTGRES_PASSWORD=postgres 
ENV POSTGRES_USER=postgres 
ENV POSTGRES_DB=immich

EXPOSE 5432

# Build base Image
FROM node:16-bullseye-slim as base
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install gcc g++ make cmake python3 python3-pip ffmpeg -y


# Build Server
FROM base as build_server

WORKDIR /usr/src/immich_server

COPY server/package.json server/package-lock.json ./

RUN npm install

COPY server/ .

EXPOSE 3000

RUN npm run build

# Build Microservice
FROM base as build_microservices

WORKDIR /usr/src/microservices

COPY microservices/package.json microservices/package-lock.json ./

RUN npm install

COPY microservices/ .

EXPOSE 3001

RUN npm run build

# Run all
FROM base as final

WORKDIR /usr/src/immich

# Add build directory
COPY --from=build_server /usr/src/immich_server/node_modules /usr/src/immich/server/node_modules
COPY --from=build_server /usr/src/immich_server/dist /usr/src/immich/server/dist
COPY --from=build_microservices /usr/src/microservices/node_modules /usr/src/immich/microservices/node_modules
COPY --from=build_microservices /usr/src/microservices/dist /usr/src/immich/microservices/dist

ENV NODE_ENV=production

CMD ["node", "microservices/dist/main.js"]


# Buiold & Run command
# docker build -t immich-single:latest .
# docker run -p 3000:3000 -p 3001:3001 -p 5432:5432 immich-single:latest 