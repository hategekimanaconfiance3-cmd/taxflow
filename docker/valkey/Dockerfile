FROM --platform=linux/amd64 valkey/valkey:9.0.1-alpine3.23
RUN mkdir -p /data
COPY valkey.conf /etc/valkey/valkey.conf
EXPOSE 6379
CMD ["sh", "-c", "test -n \"$VALKEY_PASSWORD\" || { echo 'VALKEY_PASSWORD is required' >&2; exit 1; }; exec valkey-server /etc/valkey/valkey.conf --requirepass \"$VALKEY_PASSWORD\""]
