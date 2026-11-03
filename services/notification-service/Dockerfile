FROM golang:1.26-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod ./
COPY . .
# Build the pinned runtime dependency graph; tidy also downloads unrelated test
# dependencies and must not rewrite go.mod/go.sum while creating a release image.
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -ldflags="-s -w" -o server ./cmd/server

FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
