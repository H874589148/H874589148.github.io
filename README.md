# EE工具箱（电子工程师一站式工具网站）

---

![code size](https://img.shields.io/github/languages/code-size/h874589148/h874589148.github.io)
![spring boot](https://img.shields.io/badge/spring--boot-6DB33F?logo=springboot&logoColor=white)
![languages](https://img.shields.io/github/languages/top/h874589148/h874589148.github.io)
![last commit](https://img.shields.io/github/last-commit/h874589148/h874589148.github.io)
![author](https://img.shields.io/badge/author-hawkeye-blue)

## 项目简介

**EE工具箱** 是一个面向电子工程师与 IC 设计从业者的在线工具集合，覆盖模拟电路计算、版图设计、论文绘图、学术分享等日常科研场景。纯网页、免安装、打开即用，以「专注效率」为目标，帮助工程师把重复计算与绘图的时间省下来。

在线访问：<https://h874589148.github.io/>

## 作者

**hawkeye**

- GitHub: [https://github.com/H874589148/](Hawkeye)
- 知乎: [https://www.zhihu.com/people/h874589148/](猫与向日葵)
- B站: [https://space.bilibili.com/520240681](醉醉萌不萌)
- 微信公众号: [#]()
- 邮箱: [#]()

## 功能模块

### 计算工具

| 模块 | 功能说明 |
| --- | --- |
| Bandgap 计算集 | 带隙基准参数链 / Trim 位 / VBE(T) 设计计算 |
| 电流镜失配计算 | MOS 电流镜失配率与版图参数快速估算 |
| 噪声快速计算 | 热噪声、散粒噪声、闪烁噪声参数计算 |
| 零极点 Bode 图 | 输入零极点，实时绘制幅频 / 相频特性曲线 |
| 密勒补偿 Bode 图 | 两级运放极点分裂与相位裕度实时分析 |
| 滤波器设计 | 6 种架构最小面积 RC 求解，幅频 / 噪声实时分析 |
| NTF 绘制 | z 域系数输入，|NTF|² 频谱与带内积分噪声 |
| 最小二乘拟合 | x/y 数据拟合 y = ax + b，附 R² 与可调坐标范围 |
| 科学计算器 | 表达式解析，三角 / 对数 / 阶乘，DEG/RAD 切换 |

### 版图设计

| 模块 | 功能说明 |
| --- | --- |
| 版图失配计算 | 网格阵列 + 浓度梯度，实时评估组间失配与 INL/DNL |
| 版图寄生计算 | 走线段电阻与对衬底电容累加，支持逐段独立电流，IR 压降实时显示 |

### 常用工具

| 模块 | 功能说明 |
| --- | --- |
| 电路示意图编辑器 | 论文级原理图绘制：器件拖放、正交连线，SVG/PNG 导出 |
| 波形编辑器 | 纯图形化时序波形绘制：点击改电平、总线填字填色，SVG/PNG/PDF 导出 |
| FMEA 工作台 | 失效模式中英查询、S/O/D 打分参考与 FMEDA/ASIL 计算 |
| LaTeX 实时渲染 | 实时预览，SVG/PNG/JPG 导出，常用符号查找表 |
| 电力电子波形 | 不同拓扑与占空比下的工作波形实时绘制 |
| 进制转换 | 二 / 八 / 十 / 十六进制快速互转，支持小数与浮点数 |
| 反码补码转换 | 原码、反码、补码互转，支持自定义位宽 |
| 正态分布置信区间 | 拖动区间实时计算正态分布概率与阴影 |
| 随机数生成 | 范围随机数批量生成卡片，附摇骰子动画 |

### 学术分享

| 模块 | 功能说明 |
| --- | --- |
| 论文分享 | 精选论文阅读笔记与心得分享 |
| 资源导航 | IC 设计常用网站与友情链接 |

### 趣味游戏

| 模块 | 功能说明 |
| --- | --- |
| 小游戏合集 | 休息一下吧！本地 & 网页小游戏合集 |

## 如何引用

如果本工具箱对您的科研工作（论文、报告、设计文档等）有所帮助，欢迎引用。

### 论文 / 参考文献（GB/T 7714 格式）

```text
hawkeye. EE工具箱: 电子工程师一站式工具网站[EB/OL]. [引用日期]. https://h874589148.github.io/.
```

### LaTeX / BibTeX 格式

```bibtex
@misc{eetoolkit,
  author       = {hawkeye},
  title        = {{EE工具箱}: 电子工程师一站式工具网站},
  howpublished = {\url{https://h874589148.github.io/}},
  year         = {2026},
  note         = {Accessed: 引用日期}
}
```

### 文中引用示例

```latex
本文的噪声计算借助 EE工具箱~\cite{eetoolkit} 完成。
```
