---
title: Terminal命令整理
date: 2026-05-01
tags: [analog, noise]
authors: 示例作者 et al.
source: IEEE JSSC
abstract: 本文介绍了常用的gim命令。
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

# gvim

### 搜索替换

- /搜索

  - n下一个
  - Shift+n上一个

#### 删除电容

- 删后仿提参电容：

```Plain Text
:g/.*/s/c=.*/c=0/g
```

- 含有monitor的行删除电容：

```Plain Text
:g/monitor/s/c=.*/c=0/g
```

```Plain Text
:g/capacitor/s/c=.*/c=0/g
```

- 出现了换行也需要删除：

```Java
:g/monitor/exe 's/c=.*/c=0/g' | if getline('.') =~ '\\$' | exe line('.')+1 's/c=.*/c=0/g' | endif
:g/dac_array_in/exe 's/c=.*/c=0/g' | if getline('.') =~ '\\$' | exe line('.')+1 's/c=.*/c=0/g' | endif
```

![这张图片展示了gvim编辑器的命令行界面界面，上方是三行包含电容参数的文本内容，电容的数值分别为0.210797f、0.39075f、0.564008f。下方的gvim命令行中，输入了用于删除指定匹配内容的命令，核心是":g/monitor/exe's/c=.*/c=0/g'|if getline('.')=~'\\$'|exe line('.')+1's/c=.*/c=0/g'|endif"，该命令用于处理含有monitor的行及后续行中电容参数的操作，是文档中提及的处理对应电容删除操作的具体命令示例。]()

![这张gvim搜索替换相关的操作图片，展示了用于处理特定行及对应行内容的命令与步骤解析。图片中的核心命令为`:g/one/exe's/res/zs.*\\/90/g'|if getline('.')=~'\\\\$'|exe line('.')+1's/res/zs.*\\/90/g'|endif`，该命令可匹配含one的行，对该行的res相关内容做替换。下方步骤解析分为四点，分别为匹配含one的行、替换当前行res后内容为90、判断当前行是否以\\$结尾的换行符、对下一行执行相同替换，完整呈现了该操作命令的逻辑。]()

:g/AZ/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/SMPL/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/HOLD/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/vcm_amp/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/ADC_EN/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/vos/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/monitorC/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/monitor_vin/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/dac_array_in/exe 's/c=.\*/c=0/g' | if getline('.') =\~ '\\\\\$' | exe line('.')+1 's/c=.\*/c=0/g' | endif

:g/s1/s/c=.\*/c=0/g

:g/s2/s/c=.\*/c=0/g

:g/.\*/s/c=.\*/c=0/g

:g/s1.\*capacitor/s/c=.\*/c=0/g

:g/s2.\*capacitor/s/c=.\*/c=0/g

:g/latch_en/s/c=.\*/c=0/g

:g/lop.\*capacitor/s/c=.\*/c=0/g

:g/lon.\*capacitor/s/c=.\*/c=0/g



#### 删除WPE效应

![图片展示了在gvim中实现删除源漏电阻需求的命令及命令解析。命令为：`:%s/nrs=\\zs\\S\\+\\ze\\(\\s\\|$\\)/10m/g`，并对其进行了7点解析，如全局替换、四面固定前缀、重置匹配起点等。还给出了效果示例，如`one-123`变为`one-0`等。图片下方标注了特点，如精确匹配`one-`后的完整值段、保留`one-`前缀和后续空格分隔的内容等。该图片与上下文紧密相关，是对上文删除源漏电阻命令的详细说明。]()

```Plain Text
:%s/sca=\zs\S\+\ze\(\s\|$\)/0/g
```

:%s/sca=\zs\S\\+\ze\\(\s\\|\$\\)/0/g

:%s/scb=\zs\S\\+\ze\\(\s\\|\$\\)/0/g

:%s/scc=\zs\S\\+\ze\\(\s\\|\$\\)/0/g

#### 删除源漏电阻

```Plain Text
:%s/nrs=\zs\S\+\ze\(\s\|$\)/10m/g
```

:%s/nrs=\zs\S\\+\ze\\(\s\\|\$\\)/10m/g

:%s/nrd=\zs\S\\+\ze\\(\s\\|\$\\)/10m/g







### 快速编辑

ctrl+v可以纵向选择，shift+i可以纵向编辑，编辑完了按esc就自动插入了



gf进文件ctrl+o返回



![图片展示了集群调度器使用开源slurm的命令行使用方法。分为sinfo、scancel、squeue、srun、sbatch五个部分，分别介绍查询集群各节点状态、取消已提交任务、查询集群任务队列信息、以命令行方式提交集群任务、以命令行方式提交脚本到集群等操作，还列出了部分命令示例。该图片与文档中介绍集群调度器使用slurm的内容相关，是对slurm命令行使用方法的具体说明。]()





# 仿真设置

仿真温度阶梯状增加

![图片展示的是Transient Options（on shns167）界面中的Misc选项卡。在ANNOATION PARAMETERS部分，有annotate、annotatedigits等设置项，其中annotate下的status选项被勾选。CAPTAB PARAMETERS部分有captab选项，未勾选。ADDITIONAL PARAMETERS部分，additionalParams输入框内显示了仿真参数，内容为param=temp param_vec=\[300u 25 470u 195\] param_step=1u。该图片与文档中仿真设置内容相关，展示了仿真参数设置界面。]()

param=temp param_vec=[300u 25 470u 195] param_step=1u