FROM node:22.14-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    cmake \
    g++ \
    make \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV HOST=0.0.0.0
EXPOSE 8142

CMD ["./docker-entrypoint.sh"]