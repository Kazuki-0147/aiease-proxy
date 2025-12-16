# 使用官方 Node.js 轻量级镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖 (生产环境)
# 添加 --no-cache 清理缓存以减小镜像体积
# 添加 python3 make g++ 用于编译 sqlite3 等原生模块
RUN apk add --no-cache python3 make g++ && \
    npm install --production && \
    apk del python3 make g++

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3001

# 环境变量 (默认值)
ENV PORT=3001
ENV NODE_ENV=production

# 启动命令
CMD ["npm", "start"]