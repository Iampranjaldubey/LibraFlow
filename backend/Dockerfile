# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /app

# Resolve dependencies first so this layer is cached until pom.xml changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

# Compile and package (tests run in CI, not in the image build).
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---- Runtime stage ----
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Run as an unprivileged user rather than root.
RUN groupadd --system spring && useradd --system --gid spring spring
USER spring

COPY --from=build --chown=spring:spring /app/target/library-management.jar app.jar

# Container-aware JVM defaults: size the heap from the container memory limit
# (free tiers are ~512 MB), crash fast on OOM so the platform restarts us
# instead of limping along, and use a fast entropy source for startup.
# Override per environment with JAVA_OPTS.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"

EXPOSE 8080

# Readiness = app up AND database reachable (Spring Boot Actuator).
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS "http://localhost:${PORT:-8080}/actuator/health/readiness" || exit 1

# `exec` makes the JVM PID 1 so it receives SIGTERM directly -> graceful shutdown.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
