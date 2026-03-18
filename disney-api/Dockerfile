FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

# Create a directory for the SQLite database
RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "server.js"]
