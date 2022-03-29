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

RUN npm install -g pm2

WORKDIR /use/src/app/

# Copy package.json Server
COPY server/package.json /use/src/app/server/
COPY server/package-lock.json /use/src/app/server/

# Copy package.json Microservice
COPY microservices/package.json /use/src/app/microservices/
COPY microservices/package-lock.json /use/src/app/microservices/

# Copy Source File
COPY server/ ./server/
COPY microservices/ ./microservices/
COPY ecosystem.config.js ./

# Install packages
WORKDIR /use/src/app/server/
RUN npm install && npm run build

WORKDIR /use/src/app/microservices/
RUN npm install && npm run build

# Expose ports
EXPOSE 3000
EXPOSE 3001
EXPOSE 5432

# Start PM2 as PID 1 process
WORKDIR /use/src/app
CMD ["pm2-runtime", "ecosystem.config.js"]




# Buiold & Run command
# docker build -t immich-single:latest .
# docker run -p 3000:3000 -p 3001:3001 -p 5432:5432 immich-single:latest 