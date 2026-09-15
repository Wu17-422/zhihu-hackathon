# 通用 Dockerfile —— Render / Railway / Zeabur / HuggingFace / Koyeb 都能用
FROM python:3.11-slim

WORKDIR /app

# 先装依赖，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 云端平台一般用 $PORT 环境变量决定端口，本地默认 8000
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
