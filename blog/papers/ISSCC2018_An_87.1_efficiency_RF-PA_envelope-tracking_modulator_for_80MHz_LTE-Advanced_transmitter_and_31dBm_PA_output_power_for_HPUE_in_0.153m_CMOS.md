---
title: 80MHz LTE-Advanced 发射机 87.1% 效率 RF-PA 包络跟踪调制器（HPUE 31dBm）
date: 2026-10-11
tags: [power]
authors: Chen-Yen Ho, Shih-Mei Lin, Che-Hao Meng, Hao-Ping Hong, Sheng-Hong Yan, Ting-Hsun Kuo, Chia-Sheng Peng, Chieh-Hsun Hsiao, Hsin-Hung Chen, Da-Wei Sung, Chien-Wei Kuan
source: ISSCC 2018, Session 27.6, pp. 432–433（MediaTek，新竹）
abstract: LTE-A 载波聚合（CCA 最高 4×20=80MHz）与 HPUE Power Class 2 对 ET 调制器提出宽带与高功率双重需求。本文混合 AC 耦合架构：buck-boost + 双电源线（DPL）buck 两级开关变换器，配双模式高速 AC 前馈 Class-AB 线性放大器（HBM/HGM）。自补偿斜坡发生器（SCRG）整形 buck-boost 非线性、动态体偏置（DBB）与动态驱动开关（DDS）压缩功率路径电阻、自动检测选择（ADS）扩展 ET 动态范围至 13dB。20/40/60/80MHz 峰值效率 87/85.5/82.3/81.2%，4CCA E-ACLR −38.1dBc @26dBm，较 APT 省电 34.5%，0.153μm CMOS。
readtime: 6
---

> **原文**：*An 87.1% Efficiency RF-PA Envelope-Tracking Modulator for 80MHz LTE-Advanced Transmitter and 31dBm PA Output Power for HPUE in 0.153μm CMOS*, C.-Y. Ho 等（MediaTek）, ISSCC 2018.
> **TL;DR**：蜂窝 ETM 的两个商用硬指标——带宽（LTE-A 载波聚合最高 80 MHz）与功率（HPUE Power Class 2 要 PA 输出 31 dBm）——本文一次满足：**buck-boost 把电源压到 1.5 V**（中低功率省电 + 13 dB 动态范围），**DPL-buck 顶住高功率**，两者用同一电感路径按包络切换；Class-AB LA 用 core 器件 + cascode I/O + 直接 AC 前馈做到 >100 MHz 带宽。SCRG 用人工斜坡整形 buck-boost 的非线性传递，18 μs 步进 ±0.5 dB。

## 背景与动机

- LTE-A 高数据速率、高 PAPR 调制使 PA 效率恶化；ETM 按 RF 信号包络动态调整 PA 供电以兼顾效率与线性度。
- LTE-A intra-band 连续载波聚合（CCA）要求更宽带宽的 ETM 跟踪包络：2/3/4 CCA = 40/60/80 MHz。
- 混合 AC 耦合调制器 [1]–[6] 的效率优势明显（AC 包络调制信号直接耦合到输出），但系统效率与跟踪带宽仍受架构与电路设计限制：
  - [4] 用多电平 buck 替代 Class-AB 放大器避免其效率退化，但宽带 + 瓦级功率下 buck 开关损耗激增；
  - [5] 双 Class-AB 驱动放大器拓宽带宽，但面积翻倍，且带宽仍限 LTE-40MHz。
- 本文目标：蜂窝 LTE 应用已发表 ETM 中最宽带宽 [1]–[5]，同时覆盖 HPUE（High Power User Equipment）Power Class 2 的 TD-LTE band41（天线口 26 dBm + 5 dB 前端损耗 = PA 输出 31 dBm，再加 2 dB MPR）。

## 关键方法

### 1. 双开关变换器：buck-boost + DPL buck

- **为什么 buck-boost**：ET 的低功率端受"PA 最低供电"限制——把 $V_{BB}$ 压到最低 1.5 V，中档 PA 输出功率下 ET 模式即可胜过平均功率跟踪（APT），动态范围向低延伸；
- **为什么 DPL（dual-power-line）buck**：HPUE 高功率时 DC-DC 功率路径电阻成为效率关键，低电池电压限制性能与灵活性——DPL buck 按调制包络信号决定功率路径取 $V_{BAT}$ 或 $V_{BB}$；
- **DBB（动态体偏置）+ DDS（动态驱动开关）**（Fig. 27.6.3）：DBB 自动选择合适的体偏置电平获得最低导通电阻，DDS 始终保持最高电源电平确保驱动能力；
- **ODAS（输出相关辅助开关）**：监测输出电平决定功率开关类型（buck-boost 模式/直接路径），全程优化效率。

### 2. SCRG：自补偿斜坡发生器

buck-boost 的传递函数在 $V_{BAT}$/$V_{BB}$ 两种配置间切换且非线性，斜坡补偿不当会限制建立速度。SCRG 预测各 $V_{BAT}$ 下目标 $V_{COMP}$ 与 $V_{BB}$ 的关系，**生成人工斜坡**补偿 buck-boost 传递函数的非线性、把 $V_{COMP}$ 对 $V_{BB}$ 的比值整形为斜率 1，且无需对内部稳定性大电容充放电——因此 buck-boost 在 $V_{BB}$ 配置与内环功率控制（ILPC）的 3G/4G 切换中实现 18 μs 内 ±0.5 dB 的快速步进。

### 3. 双模式高速 AC 前馈 Class-AB LA（Fig. 27.6.2）

- **HGM（高增益模式）/HBM（高带宽模式）**按 TD-LTE/FDD-LTE 配置：FDD-LTE 的接收频段噪声（RXBN）关键 → 切到 HGM 高环路增益抑制 RXBN，主极点由 $g_{m1}/2$ 与 $V_{op1/on1}$（或 $V_{op2/on2}$）节点等效阻抗决定；intra-band CCA 带宽优先 → HBM 把带宽推到 2×，所有 >2CCA（40 MHz）应用用 HBM；
- 全部信号路径用 **core 器件**把主极点推向高频 → LA 3 dB 带宽 >100 MHz；高速直接 AC 前馈路径 $M_7$–$M_9$ 驱动 Class-AB 输出级，再增强带宽 30–40%；
- 所有放大级与 Class-AB 输出级用 **cascode I/O 器件**保护 core 器件免受过压应力；输出级用 core 器件 $M_{P2}/M_{N2}$ 高跨导驱动，保证 core 管 $M_{12}/M_{13}$ 的 $V_{ds}$ 始终在可靠区；
- **ADS（自动检测选择）**：cascode 结构下 Class-AB 输出级的 headroom 限制不可避免——当 $V_{BB}$ 低于阈值时 SW1/SW2 导通，$M_{10}/M_{11}$ 变成小电阻，headroom 要求降低、ET 动态范围扩展（$V_{BB}$ 最低 1.5 V），中档功率也能高效率。

## 实验结果与性能指标

测量：固定 4 Ω 负载；外部 4G-LTE 高频段 PA，LTE QPSK 信号；目标天线口 23 dBm（Class 3）/26 dBm（Class 2 HPUE），按 5 dB 前端损耗 + 2 dB MPR 推 PA 输出 31 dBm。

| 指标 | 数值 |
|---|---|
| ETM 峰值效率 20/40/60/80 MHz | **87 / 85.5 / 82.3 / 81.2%**（最高输出 4 W） |
| ET 动态范围（HPUE） | 13 dB（18–31 dBm PA 输出） |
| 相对 APT 省电 @31 dBm | **34.5%** |
| E-UTRA ACLR（40/60/80 MHz CCA @26 dBm） | −41.5 / −39.9 / **−38.1 dBc** |
| buck-boost 步进（ILPC） | 18 μs 内 ±0.5 dB |
| LA 3 dB 带宽 | >100 MHz |
| 工艺/封装 | 0.153 μm CMOS，5.133 mm²（2.95×1.74 mm），28-pin WLCSP |

## 个人思考与总结

- **产品化视角的问题分解**：与 academia 常见的"单点创新"不同，本文每个模块都对准一个具体系统痛点——ADS 对 headroom、DBB/DDS 对功率路径电阻、SCRG 对 buck-boost 非线性与建立速度、HBM/HGM 对 FDD RXBN 与 CCA 带宽的矛盾。读 ISSCC 的产业论文，价值在于看清"系统需求 → 电路模块"的映射链。
- **ET 动态范围的低端的物理本质**：ET 在深度 back-off 省电多少，取决于调制器能把 $V_{DD,PA}$ 压到多低而不崩溃——buck-boost + ADS 把这个下限推到 1.5 V，直接换来"中档功率 ET 优于 APT"。任何 ETSM 设计都应先回答：最低供电是多少？
- **AC 耦合混合架构系列的一环**：从站内 [SIDO 交叉调节 PED ETSM](ISSCC2017_2.3_A_single-inductor_dual-output_converter_with_linear-amplifier-driven_cross_regulation_for_prioritized_energy-distribution_control_of_envelope-tracking_supply_modulator.md)（2 MHz/2 W）到本文（80 MHz/4 W），AC 耦合混合架构的演进主线是"开关变换器怎么让位、LA 怎么补"——开关管住 DC 与慢包络、AC 耦合路径管住宽带尖峰，两条腿的分工比例随带宽需求不断再平衡。

> **可关联工具**：站内 [功率电子工具箱](../../tools/power-electronics/index.html) 覆盖 buck-boost 建模；ACLR/频谱可配合 [波形绘制](../../tools/wavedrom/index.html) 与 [滤波器设计](../../tools/filter-design/index.html) 理解。
