FROM node:24.21.0-alpine
WORKDIR /app
COPY --chown=node:node package.json server.ts routes.json ./
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.ts"]
