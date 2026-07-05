FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
COPY lib ./lib
COPY data ./data
COPY public ./public
ENV PORT=8080 PHOTO_CACHE_DIR=/app/photo-cache
EXPOSE 8080
CMD ["node", "server.mjs"]
