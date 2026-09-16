# 通用 Dockerfile —— 腾讯云开发云托管 / Render / Railway / Koyeb 都能用
#
# 为什么放仓库根目录，而不是 backend/ 里：
#   仓库是「文档 + 浏览器扩展 + 后端」混在一起的，后端代码在 backend/。
#   各平台的 Docker 构建上下文默认都是**仓库根目录**，只在子目录放 Dockerfile
#   会构建失败 —— 2026-09-16 腾讯云云托管实测报错：
#       failed to read dockerfile: open Dockerfile: no such file or directory
#   它的「目标目录」参数当时没生效。放根目录、在文件里指 backend/，
#   就不用赌各家的子目录参数行不行。
#
# 构建上下文 = 仓库根目录（不是 backend/）。

FROM python:3.11-slim

WORKDIR /app

# 先装依赖，利用 Docker 层缓存
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 再拷代码。放最后 —— 改代码不会让上面那层 pip 缓存失效，重建快得多
COPY backend/ .

# 云端平台一般用 $PORT 环境变量决定端口，本地默认 8000。
# 云托管的「端口」那一栏要填 8000，跟这里的 EXPOSE 对上，
# 否则平台探不到会报 Readiness probe failed: connection refused。
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
