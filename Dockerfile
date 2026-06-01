FROM node:lts
WORKDIR /app

RUN curl https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh

COPY package.json package-lock.json ./

RUN npx astro add node --yes

COPY . .

RUN mise trust /app/mise.toml
RUN mise install

WORKDIR /app/packages/tildagon-app-directory-site
RUN npm install --omit=dev

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
