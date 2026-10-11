---
title: 连接 RF 与功率：包络跟踪系统与构建模块入门（ISSCC 教程笔记）
date: 2026-10-11
tags: [power]
authors: Ji-Seon Paek
source: IEEE ISSCC 2023 Tutorial T2, 93 slides（釜山大学；2011–2022 任职三星电子，Galaxy Note3/S10 5G ET 商用亲历者）
abstract: 从 3GPP 标准反推 SM-IC 指标的完整方法论：功率链路预算（P_ANT 27dBm+6dB PAPR → P_sat 33–37dBm → V_DD=5V、R_opt≈2.5Ω、I_SM,max 1.28A）与噪声链路预算（FDD RX 灵敏度约束 N_SM·PSRR_PA）。八大 RF 挑战逐条配 SM 技术：2G 4-slot PVT→迟滞 buck+bypass LDO；HPUE 升压→电压容限三电平 buck-boost（无 RHP 零点）；宽带信号→C_PA 隔离与 C_f 调谐（UGBW 30→120MHz）；反向电流→动态 buck 供电切换；TPC 快速过渡→pre-/background transition；中频噪声→RFT 谐振调谐；EN-DC→SIMO；mmWave→SPT 电容交换（90 ns/V）。ET-DPD 五步评估流程；模拟 ET 带宽/效率到顶，数字 ET（SCVD 电平选择，200MHz、93.6%）是下一代。
readtime: 12
---

> **原文**：*Bridging RF and Power: An Introduction to Envelope Tracking System and Building Blocks*, J.-S. Paek, IEEE ISSCC 2023 Tutorial T2.
> **TL;DR**：这份 93 页教程是站内十余篇 ET 论文笔记的"总纲"——作者是把 ET 从论文做成 Galaxy Note3（2013 首款商用 ET）与 Galaxy S10 5G（2019 首款 5G NR ET）的产品化操盘手。最有价值的是两条产业链视角：①SM 的每一条指标都能追溯到 3GPP 条款（TPC 70dB 动态、10μs 过渡掩码、FDD RX 灵敏度）；②学术 ISSCC 论文不会讲的量产现实——2G 与 ET 共存、legacy PA 寄生电容隔离、SIMO 省 BOM。教程结尾给出了方向判断：模拟 ET 的带宽与效率已到极限，数字 ET 用"离散电平 + DPD"换新空间。

## ET 动机与历史

- 高 PAPR → 高线性要求 → 大功率回退（PBO）→ 低效率。理想 Class-B：$\eta_{max}=78.5\%$，回退按 $\eta=\eta_{max}/2^n$ 指数衰减（6n dB PBO）；实际峰值仅 ~35%，6 dB PBO 时真实 PAE ~10%。Cellular DFT-s-OFDM PAPR≈5.8 dB、WiFi/CP-OFDM≈9 dB。
- **APT vs ET**：APT 按各功率档的 P_sat 给直流电压（更新 1 TTI=1 ms，过渡 4G 20 μs/5G 10 μs），仍留 6 dB PBO；ET 跟踪实时包络（V_ET,peak=V_APT,max），理论上全功率范围 78.5%。平均功率都由基站 TPC 控制（上行 0–27 dBm，动态 33 dB——纯线性 PA 低功率 PAE 1.8%）。
- 商用史：1952 Kahn EER → 2013 Galaxy Note3 首款商用 ET（LTE-A 20/40 MHz，SM-IC 集成 LDO/快速 buck/线性辅助混合）→ 2019 Galaxy S10 5G 首款 5G NR ET（100 MHz BW、2G/3G/4G 多标准、ET/APT 多模、PC2 HPUE、低 RX 带噪声）→ 2023 FR1 400 MHz APT&SPT、FR2 100 MHz ET&SPT。

## ET 系统架构与功率链路预算

- 链路：Modem→MIPI→RFIC（shaping function、timing alignment、CFR、DPD、CORDIC）→PAMiD（**SM-IC**+GaAs HBT PA+duplexer+FBRX）。SM-IC 电路块：ET/APT DAC、MIPI 接口、2 级 LA（Class-AB buffer）、开关放大器、给 LA 供电的 BB 变换器、APT 开关、2G LDO+bypass。
- **功率链路预算**（从天线反推）：P_ANT=27 dBm（6 dB PAPR）→ P_sat=33 dBm（前向损耗后 37 dBm）→ V_DD=5 V、R_opt=2.5 Ω、I_peak 到 4 A；ET 跟踪 P_sat 点（固定负载线）→ SM 指标直接导出：V_SM,max=V_DD@P_sat=5 V、V_SM,rms@P_out.avg=2.5 V、I_SM,max=1.28 A、I_SM,rms=0.64 A。
- 供电约束：V_BB≥V_SM,max−V_AC+V_ovP、V_AC=V_SM,min−V_LA,min、V_SM,min≥V_knee。**5 V 输出超出电池范围 → SM 内必须集成 buck-boost**；AC 耦合抬 LA 供电裕度；1.6 Ω 最优阻抗需要大阻抗变换 → FR1 GaAs HBT PA 用差分拓扑。
- **噪声链路预算**（FDD 特有）：SM 输出噪声经 PA 调制落在 RX 频带偏移处恶化灵敏度；$N_{PA,tot}=N_{RFIC}G_{PA}+N_{PA}+N_{SM}\cdot PSRR_{PA}$——SM 噪声以 PSRR 加权进入总账。

## 八大 RF 挑战与对应 SM 技术

| RF 挑战 | SM 技术 |
|---|---|
| 2G 4-slot PVT、35 dBm/2A、0.4→4.2 V <10 μs | 纹波迟滞 buck（宽带宽）+ **bypass LDO**（>2 A 只有 bypass 开关供得起；4.7 μF+快过渡触发 OCP 2.5A） |
| HPUE PC2 27 dBm 需升压+快 DVS | 电压容限**三电平 buck-boost**（连续输出电流、平均电感电流降 (1−D) 倍、全开关耐压 V_BATT 内、无 RHP 零点；96.8%、0.87 μs/V） |
| 宽带信号（1RB 180 kHz~100 MHz） | LA 固定 3 dB BW（$1/2\pi R_fC_f$）+ 大 UGBW；**C_PA 隔离 + C_f 调谐**（legacy PA 2.2 nF vs 隔离后 0.2 nF → UGBW 30→120 MHz） |
| 反向电流（窄 BW/低电池/升压/小电感） | **动态 buck 供电切换**：V_TX<V_BATT 时 V_SW 回电池，避免 LA 灌回、峰值削顶 |
| TPC 快速过渡（NR 1 symbol、0.4 V <2 μs） | **pre-transition（V_BB 预过渡、APT 开关断、LA 快过渡）+ background transition（SA 后台过渡 V_DD.LA）** |
| 中频段（50–100 MHz）开关噪声谐振 | **RFT 谐振调谐**：同相路径加电容降谐振频率、反相路径升——把 Z_ind 的谐振峰搬离敏感频段 |
| EN-DC 双连接多 TX | **SIMO DC-DC** 减电感/电容 BOM |
| mmWave 无法 ET（DPD>600 MHz、ps 级对齐） | **SPT 符号级功率跟踪**：SIDO buck+线性充电器预过渡、电容交换（90 ns/V） |
| WiFi RFIC 集成 CMOS PA 低效（6 dB PBO 6%） | 每路独立 APT：3 电平 interleaved BB+全集成电容分压+供电压选 MUX |

## ET 评估方法与联测结果

- **ET-DPD 五步流程**：①CW waterfall 曲线（效率/增益 vs V_CC）；②从恒增益跟踪曲线定 V_CC,ET,ave/max；③设包络 shaping（Detrough/多项式/线性）；④捕获 AM-AM/AM-PM、提取 DPD 系数；⑤生成预失真并验证。
- n77 PAM 联测（NR 100 MHz，SCS 30 kHz，22.8% 占空比）：SM 单测 3 Ω 负载峰值效率 84–86%；ET 高功率模式比 APT 省 950 mW。

| 模式 | P_out | ACLR | dc 功耗 | PAE | EVM |
|---|---|---|---|---|---|
| APT | 26 dBm | −38.27 dBc | 4.13 W | 19.2% | 1.27% |
| **ET** | 26 dBm | −38.4 dBc | 3.17 W | **25.1%** | 1.29% |
| APT | 23 dBm | −42.06 dBc | 2.54 W | 15.7% | 1.5% |
| **ET** | 23 dBm | −41.55 dBc | 1.92 W | **21.0%** | 1.22% |

（ACLR 持平、PAE +4.8~5.9 个百分点——ET 的账要这么算。）

## 模拟 ET 的极限与数字 ET

- 模拟 ET 接口上的寄生账单：C_AC、L_PCB/C_PCB、R_DAC/C_DAC、C_SM/R_SM、C_PA1/2、记忆 DPD——带宽与效率已触及极限。
- **数字 ET**：跟踪离散电平而非连续包络。优点：更大带宽、对延迟鲁棒、die 面积与 BoM 更小；代价：更复杂的多路 DPD、更大 RX 带噪声/频谱发射。实例（ISSCC 2022 [23]）：2-TX 数字 ET，**开关电容分压 SCVD + 6:1 电平选择开关** + interleaved BB + RxBN 滤波，200 MHz 信道、93.6% 效率。

## 个人思考与总结

- **"从标准反推指标"是系统工程师的逆向设计法**：SM 带宽、效率、噪声、过渡速度无一来自拍脑袋——TPC 动态范围来自覆盖算法、10 μs 掩码来自 3GPP 时隙结构、噪声指标来自 FDD 灵敏度公式。读站内 [87.1% HPUE 调制器](ISSCC2018_An_87.1_efficiency_RF-PA_envelope-tracking_modulator_for_80MHz_LTE-Advanced_transmitter_and_31dBm_PA_output_power_for_HPUE_in_0.153m_CMOS.md)时那些看似任意的规格（31 dBm、HPUE），在这份教程里都能找到条款出处。
- **教程补上了学术论文的"量产滤镜"**：legacy PA 的 2.2 nF 寄生电容把 UGBW 压到 30 MHz（所以要隔离开关）、2G 大电流只能 bypass LDO 扛、SIMO 是 BOM 倒逼——站内 [130 MHz 混合 SM](ISSCC2021_33.9_A_Hybrid_Switching_Supply_Modulator_Achieving_130MHz_Envelope-Tracking_Bandwidth_and_10W_Output_Power_for_2G_3G_LTE_NR_RF_Power_Amplifiers.md) 的 CPA.LMH 隔离、负载电容控制在这里得到了"为什么要做"的产业注脚。
- **数字 ET 与开关序列数字化的同构性**：数字 ET 把连续包络量化成电平选择、把精度责任转移给 DPD；站内 [trellis-search ETSM](Envelope_Tracking_Supply_Modulator_with_Trellis-Search-Based_Switching_and_160-MHz_Capability.md) 把连续占空比量化成开关序列搜索——**模拟环路逼近物理极限后，用数字自由度重开一维**是同一条路。

> **可关联工具**：链路预算与 PSRR 换算可用站内 [功率电子工具箱](../../tools/power-electronics/index.html) 与 [分贝换算](../../tools/calculator/index.html)；DVS 过渡时间 $\Delta t=C_L\Delta V/(I_S-I_L)$ 可用 [波形绘制](../../tools/wavedrom/index.html) 演示。
