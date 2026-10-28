FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080
ENV BASE_PATH=/
EXPOSE 8080
CMD ["node", "server.mjs"]
