# 배포 가이드

## 개요

이 문서는 워드크래커 블로그를 다양한 환경에 배포하는 방법을 설명합니다.

## 사전 준비

### 1. 빌드 수행

```bash
pnpm install
pnpm build
```

빌드 결과:
- `dist/`: 프론트엔드 정적 파일 (HTML, CSS, JS)
- `dist/server.js`: 백엔드 번들 (Node.js 실행 가능)

### 2. 환경변수 준비

필수 환경변수:
```
DATABASE_URL=mysql://user:pass@host:3306/db
JWT_SECRET=your-random-secret-key-min-32-chars
VITE_APP_ID=your-manus-app-id
OAUTH_SERVER_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-api-key
```

## 배포 방법별 가이드

### 1. Docker 배포 (권장)

#### Dockerfile 작성

```dockerfile
# 빌드 스테이지
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm build

# 실행 스테이지
FROM node:20-alpine

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

# 빌드 결과 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

#### 빌드 및 실행

```bash
# 이미지 빌드
docker build -t wordcracker-blog:latest .

# 컨테이너 실행
docker run -d \
  --name wordcracker-blog \
  -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e JWT_SECRET="your-secret" \
  -e VITE_APP_ID="your-app-id" \
  -e OAUTH_SERVER_URL="https://api.manus.im" \
  -e BUILT_IN_FORGE_API_KEY="your-key" \
  wordcracker-blog:latest

# 로그 확인
docker logs -f wordcracker-blog
```

#### Docker Compose (MySQL 포함)

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://root:password@db:3306/wordcracker_blog
      JWT_SECRET: your-secret-key
      VITE_APP_ID: your-app-id
      OAUTH_SERVER_URL: https://api.manus.im
      BUILT_IN_FORGE_API_KEY: your-key
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: wordcracker_blog
    volumes:
      - db_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  db_data:
```

```bash
# 시작
docker-compose up -d

# 중지
docker-compose down
```

### 2. Linux 서버 배포 (systemd)

#### 1단계: 서버 준비

```bash
# Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 설치
npm install -g pnpm

# 애플리케이션 디렉토리 생성
sudo mkdir -p /opt/wordcracker-blog
sudo chown $USER:$USER /opt/wordcracker-blog
```

#### 2단계: 애플리케이션 배포

```bash
cd /opt/wordcracker-blog

# 코드 클론 또는 업로드
git clone <repository-url> .

# 의존성 설치 및 빌드
pnpm install
pnpm build

# 환경변수 설정
cat > .env.production << EOF
DATABASE_URL=mysql://user:pass@localhost:3306/wordcracker_blog
JWT_SECRET=your-secret-key
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-key
NODE_ENV=production
EOF
```

#### 3단계: systemd 서비스 설정

```bash
# 서비스 파일 생성
sudo tee /etc/systemd/system/wordcracker-blog.service > /dev/null << EOF
[Unit]
Description=Wordcracker Blog
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/wordcracker-blog
EnvironmentFile=/opt/wordcracker-blog/.env.production
ExecStart=/usr/local/bin/node /opt/wordcracker-blog/dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable wordcracker-blog
sudo systemctl start wordcracker-blog

# 상태 확인
sudo systemctl status wordcracker-blog

# 로그 확인
sudo journalctl -u wordcracker-blog -f
```

### 3. Railway 배포

#### 1단계: Railway 계정 생성

https://railway.app에서 계정 생성

#### 2단계: 프로젝트 생성

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성
railway init
```

#### 3단계: 환경변수 설정

```bash
railway variable set DATABASE_URL "mysql://..."
railway variable set JWT_SECRET "your-secret"
railway variable set VITE_APP_ID "your-app-id"
railway variable set OAUTH_SERVER_URL "https://api.manus.im"
railway variable set BUILT_IN_FORGE_API_KEY "your-key"
```

#### 4단계: 배포

```bash
railway up
```

### 4. Render 배포

#### 1단계: 저장소 연결

1. https://render.com에서 계정 생성
2. GitHub 저장소 연결
3. "New +" → "Web Service"

#### 2단계: 설정

- **Name**: wordcracker-blog
- **Environment**: Node
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `node dist/server.js`
- **Plan**: Free 또는 Paid

#### 3단계: 환경변수 설정

Environment 탭에서 다음 변수 추가:

```
DATABASE_URL=mysql://...
JWT_SECRET=your-secret
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-key
NODE_ENV=production
```

#### 4단계: 배포

저장소에 push하면 자동 배포

### 5. AWS EC2 배포

#### 1단계: EC2 인스턴스 생성

- AMI: Ubuntu 22.04 LTS
- 인스턴스 타입: t3.micro 이상
- 보안 그룹: 80, 443, 3000 포트 개방

#### 2단계: 인스턴스 설정

```bash
# SSH 접속
ssh -i your-key.pem ubuntu@your-instance-ip

# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 설치
npm install -g pnpm

# MySQL 설치 (또는 RDS 사용)
sudo apt-get install -y mysql-server
```

#### 3단계: 애플리케이션 배포

Linux 서버 배포 가이드 참고

#### 4단계: Nginx 리버스 프록시 설정

```bash
sudo apt-get install -y nginx

# Nginx 설정
sudo tee /etc/nginx/sites-available/wordcracker-blog > /dev/null << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# 사이트 활성화
sudo ln -s /etc/nginx/sites-available/wordcracker-blog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 5단계: SSL 인증서 (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 6. Kubernetes 배포

#### 1단계: Docker 이미지 빌드 및 푸시

```bash
docker build -t your-registry/wordcracker-blog:latest .
docker push your-registry/wordcracker-blog:latest
```

#### 2단계: Kubernetes 매니페스트 작성

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wordcracker-blog
spec:
  replicas: 2
  selector:
    matchLabels:
      app: wordcracker-blog
  template:
    metadata:
      labels:
        app: wordcracker-blog
    spec:
      containers:
      - name: app
        image: your-registry/wordcracker-blog:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: wordcracker-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: wordcracker-secrets
              key: jwt-secret
        # ... 다른 환경변수
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: wordcracker-blog
spec:
  selector:
    app: wordcracker-blog
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer

---
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: wordcracker-secrets
type: Opaque
stringData:
  database-url: "mysql://..."
  jwt-secret: "your-secret"
  # ... 다른 비밀값
```

#### 3단계: 배포

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f secrets.yaml

# 상태 확인
kubectl get pods
kubectl logs -f deployment/wordcracker-blog
```

## 배포 후 확인사항

### 1. 헬스 체크

```bash
curl http://localhost:3000/
curl http://your-domain.com/
```

### 2. 데이터베이스 마이그레이션

```bash
# 프로덕션 환경에서 마이그레이션 실행
DATABASE_URL="mysql://..." node dist/server.js --migrate
```

### 3. 로그 모니터링

```bash
# Docker
docker logs -f wordcracker-blog

# systemd
journalctl -u wordcracker-blog -f

# Kubernetes
kubectl logs -f deployment/wordcracker-blog
```

### 4. 성능 모니터링

- CPU/메모리 사용량
- 데이터베이스 연결 풀
- 응답 시간
- 에러율

## 업데이트 배포

### Docker 기반

```bash
# 새 이미지 빌드
docker build -t wordcracker-blog:v2 .

# 컨테이너 중지 및 제거
docker stop wordcracker-blog
docker rm wordcracker-blog

# 새 이미지로 실행
docker run -d --name wordcracker-blog wordcracker-blog:v2
```

### systemd 기반

```bash
cd /opt/wordcracker-blog
git pull
pnpm install
pnpm build
sudo systemctl restart wordcracker-blog
```

### Kubernetes

```bash
kubectl set image deployment/wordcracker-blog \
  app=your-registry/wordcracker-blog:v2
```

## 문제 해결

### 데이터베이스 연결 실패

```bash
# 연결 테스트
mysql -u user -p -h host -e "SELECT 1"

# 환경변수 확인
echo $DATABASE_URL
```

### 포트 충돌

```bash
# 포트 사용 확인
lsof -i :3000

# 다른 포트 사용
PORT=3001 node dist/server.js
```

### 메모리 부족

```bash
# Node.js 힙 크기 설정
NODE_OPTIONS="--max-old-space-size=512" node dist/server.js
```

## 성능 최적화

1. **캐싱**: Redis 또는 메모리 캐시 사용
2. **데이터베이스**: 쿼리 최적화, 인덱스 추가
3. **CDN**: 정적 파일 CDN 배포
4. **로드 밸런싱**: 여러 인스턴스 실행
5. **모니터링**: 성능 지표 추적

## 백업 및 복구

### 데이터베이스 백업

```bash
# 백업
mysqldump -u user -p database_name > backup.sql

# 복구
mysql -u user -p database_name < backup.sql
```

### 정기 백업 (cron)

```bash
# 매일 자정에 백업
0 0 * * * mysqldump -u user -p database_name > /backups/db_$(date +\%Y\%m\%d).sql
```

---

**마지막 업데이트**: 2026년 8월 11일
