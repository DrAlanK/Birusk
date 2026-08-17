FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY go.mod ./

RUN go mod tidy
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o birusk-master .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/birusk-master .
COPY --from=builder /app/ui ./ui

EXPOSE 8080
ENV PORT=8080

CMD ["./birusk-master"]