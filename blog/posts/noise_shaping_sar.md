---
title: Noise-Shaping SAR ADC：经典论文脉络、实现思路与前沿进展
date: 2026-07-16
tags: [analog, noise]
abstract: 系统梳理噪声整形 SAR（NS SAR）ADC 的两大结构主线（EF 误差反馈 / CIFF 前馈），按时间线精读 5 篇经典（Fredenburg 2012 开山、Chen 2015 全被动、Shu 2016 失配误差整形、Li 2018 NTF 零点优化），再按技术方向追踪前沿（动态放大器 FIA、高阶被动整形、kT/C 噪声消除、混合 CT-DT），每篇附原文链接与"学到什么"的提炼，并给出推荐阅读路线。
readtime: 14
---

> **TL;DR**：NS SAR 把 SAR 转换剩余的余量电压（residue）留在环路里滤波，让量化噪声、比较器噪声获得 ΔΣ 式的高通整形——兼得 SAR 的高能效内核与 ΔΣ 的带内噪声抑制。十年演进围绕三个矛盾展开：①被动整形的高能效 vs 整形深度不足；②采样 kT/C 在环路之外不被整形，是高精度的终极瓶颈；③residue 放大器的功耗与增益精度。经典脉络：Fredenburg 2012（开山 EF）→ Chen 2015（全被动）→ Shu 2016（失配误差整形 MES）→ Li 2018（二阶 + NTF 零点优化）；前沿焦点：动态放大器（FIA）、高阶被动、kT/C 消除、混合 CT-DT。

## 1. 为什么要把 SAR 和 ΔΣ 杂交

| | SAR | ΔΣ | NS SAR |
|---|---|---|---|
| 量化方式 | 逐位逼近，N 周期出 N bit | 1~few-bit 粗量化 + 环路滤波 | SAR 粗量化 + 余量整形 |
| 能效 | 极高（无运放） | 受 OTA 功耗限制 | 接近 SAR |
| 高精度瓶颈 | 比较器噪声、kT/C、DAC 失配 | OTA 功耗与稳定性 | 采样 kT/C（不被整形） |
| 过采样 | 不需要 | OSR 16~256 | OSR 4~16 即可 |

核心思想：SAR 逐位逼近结束后，比较器输入端天然留有**余量电压** $V_{res}=V_{in}-D\cdot V_{ref}$——它包含本次量化误差与比较器噪声。传统 SAR 把它扔掉；NS SAR 把它经环路滤波器处理后注入下一次转换，形成负反馈，使信号带内噪声被整形到带外：

$$\mathrm{NTF}(z)=(1-z^{-1})^L\ \Rightarrow\ \text{OSR 每加倍，带内噪声降 }(6L{+}3)\ \mathrm{dB}$$

一阶整形（L=1）+ OSR=8 理论改善 ~27 dB，相当于白捡 4.5 bit——这就是 NS SAR 诱人的原因。

## 2. 两大结构主线：EF 与 CIFF

**EF（Error-Feedback，误差反馈）**：residue 经滤波器 $H(z)$ 后**反馈叠加到下次转换的输入**上：

$$V_{in}'[n+1]=V_{in}[n+1]+H(z)\cdot V_{res}[n]\ \Rightarrow\ \mathrm{NTF}=1-H(z)$$

- 优点：结构最简，residue 在 CDAC 顶板天然存在，加法可由电容电荷共享完成；
- 缺点：residue 提取路径的增益误差**直接平移 NTF 零点**（零点深度决定带内抑制上限）；反馈量叠加在输入上会占用输入摆幅余量。

**CIFF（Cascade of Integrators Feed-Forward，前馈）**：环路滤波器输出**前馈到比较器**（多输入对加权求和），与输入信号在比较器处汇合：

$$\mathrm{NTF}=\frac{1}{1+L(z)}$$

- 优点：信号通路不串加法器；动态放大器容易嵌入；
- 缺点：比较器需多输入对（各对噪声/失调按权重贡献），前馈系数实现要精巧。

实际论文多为 EF、CIFF 或两者混合（EF-CIFF），选型本质是"加法放在输入侧还是比较器侧"的折中。

## 3. 经典论文脉络（2012–2018）

### 3.1 开山：Fredenburg & Flynn, JSSC 2012 —— SAR 的余量也能整形

- **做了什么**：首个 oversampling NS SAR。8-bit SAR + 一阶 EF（有源 gm-C 积分器把 residue 送回下次输入），90 MS/s、11 MHz 带宽、62 dB SNDR，用 8b DAC 实现 10b ENOB——**比较器噪声约束被整形松绑**，DAC 位数与最终精度解耦。
- **学到什么**：SAR 的 residue 就是 ΔΣ 里"被丢掉的量化误差"，拿来滤波即可整形；代价是有源积分器功耗成为主要开销——这直接催生了全被动路线。
- 原文：DOI [10.1109/JSSC.2012.2217874](https://doi.org/10.1109/JSSC.2012.2217874)（IEEE JSSC, vol. 47, Dec. 2012）；[IEEE Xplore](https://ieeexplore.ieee.org/document/6381486/)

### 3.2 全被动：Chen, Miyahara, Matsuzawa, VLSI 2015 —— 不要运放

- **做了什么**：opamp-free。用电容电荷共享（charge sharing）做无源"积分"：residue 电容与历史值电容并联均压，等效 $H(z)=a\cdot z^{-1}$，9.35 ENOB、**14.8 fJ/conv-step** 极致能效。
- **学到什么**：被动没有静态功耗，但电荷共享必有衰减 $a<1$ → NTF 零点移到 $z=a<1$ 处，整形深度打折；**"能效 vs 整形深度"成为此后十年的主线矛盾**。
- 原文：DOI [10.1109/VLSIC.2015.7231329](https://doi.org/10.1109/VLSIC.2015.7231329)（Symp. VLSI Circuits, 2015）；[作者方 PDF（东工大）](https://www.ssc.p.isct.ac.jp/private/publications/2015/20150616_VLSI_Circuits/VLSI2015-C-0008020150126a_paper.pdf)

### 3.3 失配也整形：Shu, Kuo, Lo, JSSC 2016 —— MES

- **做了什么**：Oversampling SAR + **DAC Mismatch Error Shaping（MES）**：逐次转换中让电容失配误差同样进入整形环被高通滤除，55 nm 下免校准做到 105 dB SFDR / 101 dB SNDR（1 kHz 带宽）。
- **学到什么**：NS SAR 的环路不只对付量化噪声——**凡是在环内产生的误差（量化、比较器噪声、DAC 失配）都可被整形**；低速高精度场景（传感、音频）可以彻底免去后台校准。
- 原文：DOI [10.1109/JSSC.2016.2592623](https://doi.org/10.1109/JSSC.2016.2592623)（IEEE JSSC, 2016）

### 3.4 被动积分器实用化：Guo & Sun, ESSCIRC 2016

- **做了什么**：无源积分器 + 12b ENOB、61 μW，证明被动路线也能到实用精度；被动衰减用桥电容/增益预放大补偿。
- **学到什么**：被动积分的衰减系数 $a$ 可由电容比精确设定（工艺稳健），配合适度 OSR，能效与精度可以兼得——为后续高阶被动奠基。
- 原文：[Semantic Scholar 页面（含 IEEE 链接）](https://www.semanticscholar.org/paper/A-12b-ENOB-61%C2%B5W-noise-shaping-SAR-ADC-with-a-Guo-Sun/129bb4d58916cd50e3acb8198d6c66c03a412e69)（ESSCIRC, 2016）

### 3.5 二阶 + NTF 零点优化：Li, Qiao, Gandara, Pan, Sun, JSSC 2018

- **做了什么**：二阶 EF，**NTF 零点不全部放在 $z=1$**，而是按 ΔΣ 经典手法优化摆放在单位圆内侧，带内噪声地板更平，13 ENOB。
- **学到什么**：NTF 是设计自由度而非固定 (1−z⁻¹)^L——零点优化等效多挤 3~4 dB；高阶时环路稳定性与系数精度成为新问题。
- 原文：IEEE JSSC, vol. 53, no. 12, Dec. 2018，[Semantic Scholar 页面（含 IEEE 链接）](https://www.semanticscholar.org/paper/A-13-ENOB-2nd-order-noise-shaping-SAR-ADC-realizing-Li-Qiao/6ae1d5ec5d2ecbb10d4b83d4a7855a31fe80fb62)

## 4. 前沿方向（2020–2024）

### 4.1 动态放大器：residue 放大的能效革命

- **X. Tang et al., "An Energy-Efficient Comparator With Dynamic Floating Inverter Amplifier (FIA)", JSSC 2020**：浮动反相器放大器——采样相位预充电、放大相位反相器对浮动放电，电流全部来自电荷重分配，能效与速度兼优；FIA 成为现代 NS SAR residue 放大的标配单元。DOI [10.1109/JSSC.2019.2960485](https://doi.org/10.1109/JSSC.2019.2960485)（JSSC, vol. 55, no. 4, pp. 1011–1022）。
- **X. Tang et al., "9.5 A 13.5b-ENOB Second-Order Noise-Shaping SAR with PVT-Robust Closed-Loop Dynamic Amplifier", ISSCC 2020**：动态放大器增益随 PVT 漂移 → 闭环结构在积分相位内锁增益，13.5 ENOB。学到：动态放大器要进 NS 环路，**增益精度必须闭环化**，否则 NTF 零点又跑了。

### 4.2 高阶被动整形

- **L. Jie, B. Zheng, H.-W. Chen, R. Wang, M. P. Flynn, "9.4 A 4th-Order Cascaded-Noise-Shaping SAR ADC with 88 dB SNDR Over 100 kHz Bandwidth", ISSCC 2020**：级联被动整形到四阶，88 dB SNDR。被动高阶的痛点是级间衰减累积，本篇用级联结构与增益单元补偿。
- **J. Liu, D. Li, Y. Zhong, X. Tang, N. Sun, "27.1 A 250 kHz-BW 93 dB-SNDR 4th-Order Noise-Shaping SAR Using Capacitor Stacking and Dynamic Buffering", ISSCC 2021**：**电容堆叠（capacitor stacking）**——同一组电容在采样相/积分相复用为不同拓扑，无额外电容即获高阶滤波；配合动态缓冲器，250 kHz 带宽 93 dB SNDR。学到：高阶被动不必堆电容面积，**时域复用是新的自由度**。
- **Z. Li et al., "A 16.5-μW Second-Order Fully Passive NS-SAR ADC with a Segmented Capacitor Array and Hybrid Switching", 2023**：分段电容阵列 + 混合开关时序继续压低功耗，[IEEE 链接](https://ieeexplore.ieee.org/iel7/6287639/6514899/10217817.pdf)。

### 4.3 kT/C 噪声消除：攻向最后的瓶颈

采样 kT/C 在环路**之外**，不被 NTF 整形——它是 NS SAR 迈向 16+ bit 的终极障碍。

- **J. Liu, X. Tang et al., "A 40-MS/s SAR ADC With kT/C Noise Cancellation", JSSC 2020**：采样噪声相关相消（两次采样共享同一噪声样本再相减），DOI [10.1109/JSSC.2020.3020194](https://doi.org/10.1109/JSSC.2020.3020194)。
- **T.-H. Wang, R. Wu, V. Gupta, X. Tang, S. Li, "A 13.8-ENOB Fully Dynamic Third-Order Noise-Shaping SAR ADC in a Single-Amplifier EF-CIFF Structure With Hardware-Reusing kT/C Noise Cancellation", JSSC 2021（ISSCC 2021 27.3 会议版）**：EF-CIFF 混合结构，**单个动态放大器时分复用**完成全部放大任务，kT/C 消除复用环路原生硬件，**输入电容仅 0.4 pF** 做到 13.8 ENOB——小电容高精度自此成立。IEEE JSSC, vol. 56, p. 3668, 2021。
- 学到：kT/C cancellation 的思想是"让同一个噪声样本出现两次并相减"，与相关双采样（CDS）同源，但要嵌进 SAR 转换时序里实现。

### 4.4 MES 与 NS 合体、混合 CT-DT、宽带化

- **H. Li et al., "A 7.3-μW 13-ENOB 98-dB SFDR Noise-Shaping SAR ADC With Duty-Cycled Amplifier and Mismatch Error Shaping", JSSC 2022**（TU Eindhoven）：占空比放大器 + 失配误差整形合体，[作者方 PDF](https://pure.tue.nl/ws/files/302806521/A_7.3-_W_13-ENOB_98-dB_SFDR_Noise-Shaping_SAR_ADC_With_Duty-Cycled_Amplifier_and_Mismatch_Error_Shaping.pdf)。
- **W. Shi et al., "A 3.7 mW 12.5 MHz 81 dB-SNDR 4th-Order Continuous-time Hybrid ΔΣ/NS-SAR", 2022**：连续时间前端 + 离散时间被动 NS 的混合环路，[IEEE 链接](https://ieeexplore.ieee.org/iel7/8782712/9530264/09913224.pdf)——宽带方向把 CT 的抗混叠与 NS SAR 的能效拼起来。
- **宽带被动方向**：22 nm FDSOI 单通道 70 dB SNDR / 100 MHz 带宽的四阶被动 NS SAR（Y. Zhang et al.）——工艺微缩 + 被动整形开始向通信带宽进军。
- **系统设计综述**：L. Jie et al., "An Overview of Noise-Shaping SAR ADC", IEEE TCAS-I 2021（[IEEE Xplore](https://ieeexplore.ieee.org/document/9569768)，入门首选）；Ismail et al., "On the System-Level Design of Noise-Shaping SAR ADCs", MDPI Electronics 2024（[开放获取](https://www.mdpi.com/2079-9292/13/20/4128)）。

## 5. 横向设计要点提炼

1. **NTF 零点位置 = 整形质量**：被动衰减、动态放大器增益误差、提取路径失配都会移动零点；零点深度直接决定带内噪声地板——调试 NS SAR 先看 FFT 带内地板平不平。
2. **residue 放大器三代演进**：gm-C 有源积分（功耗大）→ 动态放大器 FIA/闭环 DA（能效高、需增益稳定）→ 纯被动电荷共享 + 电容堆叠（零静态功耗、衰减换阶数）。
3. **环内误差皆可整形**（量化、比较器噪声、DAC 失配），**环外误差无法整形**（采样 kT/C、参考噪声、输入驱动）——预算时先画清楚环路边界。
4. **OSR 选择 4~16**：SAR 内核每转换要 N 个周期，速度预算紧，OSR 上不去；这正是"零点优化 + 高阶"比 ΔΣ 更重要的原因。
5. **与 pipeline-SAR 的合流**：residue 放大器既做级间增益又参与环路滤波（如 4.3 的单放大器复用），两条高能效 ADC 路线正在融合。

## 6. 推荐阅读路线

1. 综述入门：Jie et al., TCAS-I 2021 Overview（半小时建立全景）；
2. 开山：Fredenburg & Flynn 2012（理解 EF 与 residue 概念）；
3. 被动路线：Chen 2015（理解 $a<1$ 的代价）；
4. 系统化：Li 2018（二阶 + 零点优化，进入设计细节）；
5. 增益单元：Tang FIA JSSC 2020（动态放大器原理）；
6. 前沿封顶：Liu 2021（电容堆叠四阶）+ Wang 2021（kT/C 消除）。

> **可关联工具**：NTF 的零极点与带内噪声积分可用站内 [传递函数](../../tools/transfer-function/index.html) 与 [Bode 绘图](../../tools/bode-plot/index.html) 复现；kT/C 数值核算可用 [噪声快速计算](../../tools/noise-calc/index.html)；ADC 噪声预算方法见站内 [SAR ADC 噪声来源全景分析](sar_adc_noise.md)。
