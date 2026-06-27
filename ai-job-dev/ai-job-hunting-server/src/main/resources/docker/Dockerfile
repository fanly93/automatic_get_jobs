FROM eclipse-temurin:17-jre
WORKDIR /app/
COPY ./ai-job.jar /app/
EXPOSE 9100
EXPOSE 6768
ENTRYPOINT ["java", "-XX:+StartAttachListener", "-jar"]
CMD ["/app/ai-job.jar"]
