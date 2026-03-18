FROM node:24.14.0-alpine3.23

ENV \
  NODE_ENV=production \
  APP_DIR=/app

RUN apk update \
  && apk upgrade --no-cache \
  && mkdir -p $APP_DIR/data \
  && chown -R node:node $APP_DIR

USER node
WORKDIR $APP_DIR

COPY --chown=node:node . .

RUN yarn install

CMD [ "node", "server.js" ]
