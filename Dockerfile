# ใช้ Node.js LTS เป็น Base Image
FROM node:18-alpine

# กำหนด Working Directory ภายใน Container
WORKDIR /app

# คัดลอก package.json และ package-lock.json
COPY package*.json ./

# ติดตั้ง Dependencies
RUN npm install --production

# คัดลอกซอร์สโค้ดทั้งหมด
COPY . .

# เปิด Port 3000
EXPOSE 3000

# คำสั่งเริ่มต้นรัน Server
CMD ["node", "server.js"]
