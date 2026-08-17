FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# ۱. اول فایل تنظیمات و کدهای برنامه رو کامل کپی می‌کنیم
COPY go.mod ./
COPY . .

# ۲. حالا که کدها رو می‌بینه، پکیج‌های لازم رو به درستی دانلود می‌کنه
RUN go mod tidy
RUN go mod download

# ۳. بیلد کردن برنامه
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o birusk-master .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/birusk-master .
COPY --from=builder /app/ui ./ui

EXPOSE 8080
ENV PORT=8080

CMD ["./birusk-master"]