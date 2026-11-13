@echo off
setlocal
set APP_HOME=%~dp0
if "%APP_HOME%"=="" set APP_HOME=.
if defined JAVA_HOME goto java_home
set JAVA_EXE=java.exe
goto execute
:java_home
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%\bin\java.exe
if exist "%JAVA_EXE%" goto execute
echo ERROR: JAVA_HOME points to a missing java.exe: %JAVA_EXE% 1>&2
exit /b 1
:execute
set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=gradlew" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
endlocal
