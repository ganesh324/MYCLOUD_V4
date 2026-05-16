FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Runs Vite in development mode and exposes it to your local network
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
