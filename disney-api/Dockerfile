FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY wait-collector.js ./
COPY start.sh ./
COPY ride-scorer.js ./
COPY seed-attraction-metadata.js ./

# Make start script executable
RUN chmod +x start.sh

# /data  — SQLite DB volume (disney.db)
# /storage — motherbrain ironwolf_01 bind mount (photos, wishlist, venues)
# /waittimes — motherbrain ironwolf_02 bind mount (waittimes.db)
RUN mkdir -p /data /storage /waittimes

EXPOSE 3001

CMD ["./start.sh"]