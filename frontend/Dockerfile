FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

# Bundle all app JS into one file (eliminates 10 separate HTTP requests)
RUN cat /usr/share/nginx/html/public/js/api.js \
        /usr/share/nginx/html/public/js/utils.js \
        /usr/share/nginx/html/public/js/modules/dashboard.js \
        /usr/share/nginx/html/public/js/modules/systems.js \
        /usr/share/nginx/html/public/js/modules/network.js \
        /usr/share/nginx/html/public/js/modules/mobiles.js \
        /usr/share/nginx/html/public/js/modules/sims.js \
        /usr/share/nginx/html/public/js/modules/gws.js \
        /usr/share/nginx/html/public/js/modules/employees.js \
        /usr/share/nginx/html/public/js/modules/reports.js \
        /usr/share/nginx/html/public/js/modules/users.js \
        /usr/share/nginx/html/public/js/app.js \
    > /usr/share/nginx/html/public/js/bundle.js

EXPOSE 80
