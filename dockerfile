FROM node:16-alpine
WORKDIR /usr/src/app
COPY . .
RUN npm config set registry https://registry.npm.taobao.org && npm install --no-package-lock

EXPOSE 9904

CMD ["npm", "start"]
