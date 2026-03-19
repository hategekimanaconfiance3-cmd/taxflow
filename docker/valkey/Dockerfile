FROM --platform=linux/amd64 valkey/valkey:9.0.1-alpine3.23
RUN mkdir -p /data
COPY valkey.conf /etc/valkey/valkey.conf
EXPOSE 6379
CMD ["valkey-server", "/etc/valkey/valkey.conf"]
