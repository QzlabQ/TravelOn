FROM node:22-alpine AS build
WORKDIR /usr/app

# Node.js ships Corepack, but it must be enabled before the packageManager
# declaration can select the repository-pinned Yarn release.
RUN corepack enable && corepack prepare yarn@4.2.2 --activate

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .
RUN yarn build

FROM nginx:1.25-alpine
EXPOSE 80
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/app/build /usr/share/nginx/html
