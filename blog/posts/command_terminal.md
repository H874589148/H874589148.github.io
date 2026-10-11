---
title: Terminal命令整理
date: 2024-07-31
tags: [tools]
abstract: 本文介绍了常用的terminl命令。
readtime: 6
---

# Terminal命令整理

# terminal

| nsqosusage | 查看总核数和当前使用核数 |
|-|-|
| quota -s | 显示当前用户的磁盘使用量和限制 |
| srun matlab -desktop -softwareopengl | 启动完整版Matlab |
| squeue | 查看提交作业的排队情况 |
| top | 显示系统中各个进程的资源占用情况 |
| htop | 互动进程查看器 支持鼠标操作 |
| free -g | 以 GB 为单位显示内存使用情况 |
| free -h | 以人类可读的方式显示内存使用情况 |
| nsname | 查看至安盾姓名和用户名对应关系 |
| nautilus | 打开文件资源管理器 |
| xdg-open . | 打开文件资源管理器 |
| find . -type f -size +2G | 查找大文件 |
| smic_pdk_query | 查询smic发布pdk的版本 |
| mlist | 查看已加载的module |
| find . -type f -name "\*.msg.db" -exec  rm -rf {} \\; | 删除maestro里面的大文件 |

# 仿真设置

仿真温度阶梯状增加

![图片展示的是Transient Options（on shns167）界面中的Misc选项卡。在ANNOATION PARAMETERS部分，有annotate、annotatedigits等设置项，其中annotate下的status选项被勾选。CAPTAB PARAMETERS部分有captab选项，未勾选。ADDITIONAL PARAMETERS部分，additionalParams输入框内显示了仿真参数，内容为param=temp param_vec=\[300u 25 470u 195\] param_step=1u。该图片与文档中仿真设置内容相关，展示了仿真参数设置界面。]()

param=temp param_vec=[300u 25 470u 195] param_step=1u