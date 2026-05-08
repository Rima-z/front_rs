FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ENV VITE_API_URL=http://localhost:4000

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
