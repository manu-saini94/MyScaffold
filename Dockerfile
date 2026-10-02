# syntax=docker/dockerfile:1
# Our Story: one image, one process. Spring Boot serves the React app and the API on :8080.
#   docker build -t our-story .
#   docker run --rm -p 8080:8080 --env-file <your env file> -v our-story-data:/data our-story

# ---- 1. Frontend: Vite build -> /web/frontend/dist. Node 24 is the current LTS line (same as the Maven ship profile).
FROM node:24-alpine3.24 AS web
WORKDIR /web/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend: Maven wrapper build, SPA copied into static resources (no npm in this stage).
FROM eclipse-temurin:21-jdk-alpine-3.24 AS build
WORKDIR /src/backend
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY backend/src src
COPY --from=web /web/frontend/dist src/main/resources/static
# Tests run before building the image (mvnw test); the image build only packages.
RUN ./mvnw -q -B -DskipTests package \
 && cp target/our-story-*.jar /app.jar \
 && mkdir /data

# ---- 3. Runtime: Temurin 21 JRE on Alpine (current official tag). Chosen over distroless because it keeps
# busybox wget, which gives a real in-image HEALTHCHECK without adding curl; the JRE already contains
# java.desktop (ImageIO) for image reads. Non-root user; only /data and /tmp are written.
FROM eclipse-temurin:21-jre-alpine-3.24
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app -h /home/app app
COPY --from=build --chown=app:app /app.jar /app/our-story.jar
COPY --from=build --chown=app:app /data /data
USER app
WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=prod \
    OURSTORY_DATA_DIR=/data \
    JAVA_TOOL_OPTIONS="-Xmx256m -Djava.awt.headless=true"
VOLUME /data
EXPOSE 8080
# Liveness only: /actuator/health is public and exposes no details. start-period covers Flyway + first boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/our-story.jar"]
