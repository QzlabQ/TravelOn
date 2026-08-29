@ECHO OFF
SET "SCRIPT_DIR=%~dp0"
CALL "%SCRIPT_DIR%..\api-gateway\mvnw.cmd" -f "%SCRIPT_DIR%pom.xml" %*
