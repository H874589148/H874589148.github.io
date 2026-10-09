@echo off
rem Rebuild blog/posts.json from blog/posts/*.md (double-click to run)
chcp 65001 >nul
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe"
echo [build-blog] rebuilding blog/posts.json ...
"%NODE_EXE%" "%~dp0build-blog.js"
echo.
pause
