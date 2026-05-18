FROM node:21-alpine as build
WORKDIR /usr/app
COPY . /usr/app
RUN yarn
RUN yarn build
COPY . /usr/app

FROM nginx:1.25-alpine
EXPOSE 80
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/app/build /usr/share/nginx/html
