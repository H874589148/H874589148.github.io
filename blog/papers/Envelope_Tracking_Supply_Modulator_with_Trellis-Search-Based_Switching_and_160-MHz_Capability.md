---
title: 基于 Trellis 搜索开关的包络跟踪电源调制器（160 MHz 能力）
date: 2026-10-11
tags: [power]
authors: Weiyu Leng, Asad A. Abidi, Sraavan R. Mundlapudi, Hooman Darabi, Debopriyo Chowdhury, Ali Afsahi, Sida Li
source: IEEE JSSC, vol. 57, no. 3, Mar. 2022, pp. 719–733（UCLA + Broadcom；CICC 2021 会议版扩展）
abstract: 混合放大器（buck 电流反馈主放大器 + Class-AB 运放校正）是 ET 电源调制器的主流架构，迟滞控制下 buck 电流必然滞后包络，运放被迫输出过大校正电流且开关次数无保证。本文不加无源储能元件，改用 Viterbi 式 trellis search（TS）DSP 为 buck 离线寻找最优开关序列：误差电流建模为 trellis 状态、1-norm 代价加开关罚 Ipen、N=16 状态窗口近似全局最优。20 MHz 信道运放电流降 27%，调制器效率 71.2%→74.2%；160 MHz 信道因 buck 开关损耗主导退回经典迟滞控制，完整 2.5 GHz TX 效率 +7.2% @ 22.3 dBm、EVM −32.7 dB。
readtime: 8
---

> **原文**：*Envelope Tracking Supply Modulator with Trellis-Search-Based Switching and 160-MHz Capability*, W. Leng, A. A. Abidi, S. R. Mundlapudi, H. Darabi, D. Chowdhury, A. Afsahi, S. Li（UCLA + Broadcom）, IEEE JSSC, 2022.
> **TL;DR**：混合放大器的效率瓶颈在"buck 电流跟不上包络 → 运放补误差"。与其加第二个电感/大电容（违背手机 RF 前端的集成度），不如用 DSP 把 buck 的开关序列离线算到最优——把误差电流 $i_e$ 的演化建成 trellis，用 Viterbi 算法找最小累计代价（$\lvert i_e\rvert$ + 开关罚 $I_{pen}$）的路径。代价是一块 DSP；收益是 20 MHz 模式运放电流 −27%、峰值效率 73→77%。160 MHz 模式因 buck 开关损耗随 $f_{sw}$ 8 倍增长反而吃亏，作者诚实地退回迟滞控制。

## 背景与动机

- ET 让 PA 电源跟踪包络、始终工作在饱和附近以提高平均效率；但 ETSM 自身的效率决定 ET 的实际收益。
- **混合放大器**：buck 变换器做电流反馈主放大器（供 DC 与低频大电流），Class-AB 运放做电压反馈校正放大器（供高频误差电流 $i_e$，理想为零均值小电流）。标准 buck 的输出滤波电容被校正放大器替换，输出波形不再受异步采样重构失真之害。
- **迟滞控制（HC）的根本缺陷**：$i_{sw}$ 以有限压摆率 $SR_{sw}=\left((V_{DD},0)-v_{load}\right)/L$ 追踪 $i_{load}$，必然滞后 → 运放 $i_e$ 大；且自激弛豫振荡无法保证"最少开关"——每次开关都是能量损失。
- 先前工作 [2]–[13] 靠增加无源储能元件（第二电感、大电容、开关电容阵列）提效，但能量存储量大导致无法集成，而 RF 前端模块中片外元件数量只减不增。
- 本文的设计公理：**晶体管密度随工艺比例增长，DSP 便宜**——只用一个片外电感，用 DSP 换效率，逼近 ETSM 中最耗电单元的理论效率上限。

## 关键方法

### 1. HC 的四种工作模式：为什么需要更聪明的控制

$buck$ 压摆率 $SR_{sw}$ 与负载压摆率 $SR_{load}$ 的竞争、迟滞窗口 $H$ 的取舍，划分出四种模式（Fig. 3）：

| 模式 | 条件 | 后果 |
|---|---|---|
| delay-limited | $H$ 大、$f_{sw}$ 低 | $i_{sw}$ 严重滞后，$i_e$ 大 |
| unreasonable | $H$ 过小 | $CV^2f$ 损耗反噬，buck 效率崩 |
| oversampling | $SR_{sw}\ge SR_{load}$ | 跟踪好但 $f_{sw}$ 过高 |
| slope-saturated | $L$ 过大 | buck 近似恒流源，运放供全部交流 |

理想效率曲线与 OFDM 包络概率密度的叠加（Fig. 2）说明：静态最优分摊比 $\alpha_0$ 只在最概然包络处最优，而 $\alpha(t)$ 时变——需要让 $\alpha_0(t)$ 以最小滞后动态跟随。Hsia 等 [16] 的 DSP lookahead 方案用固定前瞻深度 $k$，实验最优 $k$ 随摆幅变化（100% 摆幅 $k=5$、50% 摆幅 $k=1$），说明固定 $k$ 只是次优——需要逐样本全局优化。

### 2. Trellis search 的数学表述

核心观察：给定开关序列 $v_{sw}[i]$，误差电流**完全确定**（式 4）：

$$i_e[n]=\frac{T_s}{L}\sum_{i=0}^{n-1}\left(v_{sw}[i]-v_{load}[i]\right)-i_{load}[n]$$

PA 负载非线性用 2-D LUT 把 $i_{load}$ 映射到 $v_{load}$。$i_e$ 的可能取值等间距 $T_s/L\times(V_H-V_L)$，每步状态数 +1，构成 trellis；Viterbi 算法在每个状态保留唯一最小累计代价的 survivor path。

**代价函数**：开关损耗本质是电流平方（2-norm：$P_e=i_e\cdot v_{load}$ 或 $i_e\cdot(v_{load}-V_{DD})$），但需全精度乘法、无法硬件化。本文用 1-norm 近似：

$$\text{OBJ}=\sum_j\left(\lvert i_e[j]\rvert+\sigma_1[j]\right),\qquad \sigma_1=I_{pen}$$

$I_{pen}$ 是每次开关事件加的电流单位罚——硬件上就是常数累加，使算法自动少开关，替代了 $H$ 的角色。

**状态窗口**：无穷状态不可实现。每步丢弃窗口最顶/最底中离当前估计较远的一个（窗口移动 WD=0/1），保留 $N=16$ 个状态（每状态 10 bit）。$N=2$ 退化为 bang-bang，$N\to\infty$ 为全局最优——TS 是 bang-bang 与全局最优之间的可调谱系；$N$ 增大可并行、不限制时序。

### 3. 三块硬件

- **BMU**（branch metric unit）：预计算 $Sig_{H/L}[n]=V_{H/L}/L-v_{load}[n]+(T_s/L)(i_{load}[n]-i_{load}[n-1])$；bitwise inverse 求绝对值；Algorithm 1 调节窗口；
- **TMU**（trellis metric unit）：16-bit 累加器，ACS 三方向分支（窗口移动时分支方向 0/1 变化）；Renorm 防溢出——pipeline + clip（0x7FFF）稳定 renormalization 环；
- **TBU**（traceback unit）：survivor path 深度 50（$>3\times N$）保证路径合并、可从任意状态回溯；Algorithm 3 地址更新；反向读地址以 2× 速追逐 FIFO。

DSP 实现：Xilinx KC705 FPGA，200 MHz（时序约束 230 MHz，串行链路瓶颈）；1 时钟 = 1 TS 步 → TS 限 20 MHz 调制带宽。16/28 nm CMOS 综合：28 nm 漏电偏大但 <36 mW（远小于 TS 省下的运放功耗），16 nm DSP 功耗远小于模拟侧省电。

### 4. 系统效率模型

$$\eta_{ETSM}\approx\frac{P_{load}}{P_{buck}+P_{e,avg}+i_{sw,avg}^2R_L+V_{DD}I_{Q1}+P_{load}}$$

HC 的设计变量是 $(L,H)$，TS 的是 $(L,I_{pen})$——$I_{pen}$ 替代 $H$ 成为唯一的"迟滞宽度"旋钮，且逐样本优化。$(1+\gamma)R_{sw}C_{sw}\approx 70$ ps（40 nm HV IO）决定 $f_{sw}$ 上限与 $P_{buck}$ 的增长斜率。

### 5. buck 与运放设计

- **buck**：CMOS inverter 输出级、1.5 ns 非重叠预驱动（会议版 [14] 预驱动画错，本文 Fig. 22(a) 更正）、$C_d$ 下降沿绝热放电、可切单元宽度编程；推导出 $\eta_{max}$ 只依赖 $\alpha$ 与 $f_{sw}$，最优宽度使 $P_{sw}+P_{sw,pre}=P_{\Omega}$；
- **运放**：两级、$f_u=300$ MHz、$f_2\ge 2f_u$、$C_2=6$ pF、$g_{m2}\approx 500$ mS → $I_{Q2}\approx 17$ mA；1 V core + 2.5 V IO 堆叠耐压；Monticelli 浮动偏置 Class-AB；β≤1/3（输入栅压 <1.2 V 保护 core 管）；辅助运放降低共栅管 $R_g$ 感性阻抗（感性 $Z_s$ 会在 di/dt 尖峰时把 core 管推进 triode）；最大输出电流 350 mA、摆幅 1~3.4 V、160 MHz 模式 $v_{load}$ 斜率 1.8 V/ns；
- **DC 耦合可编程 HC**：两个缩放副本输出级镜像 $i_{sink}/i_{source}$ → HV IO 电流镜（M1–M4）→ M5/M6 编程阈值 $I_{thn}/I_{thp}$ → SR latch 迟滞窗口；延迟 <1 ns、零静态电流，缩放比与参考电流高度可编程以补偿 PVT 失配。

## 实验结果与性能指标

芯片 TSMC 40 nm CMOS；测量负载 5 Ω‖100 pF 模拟 PA 电源端（0201 封装的 1 μF 不算第二无源件）。公平对比设置：HC 模式的隔直电容短接（电流反馈防 DC 漂移）、TS 模式断开插入（TS 无直流反馈）；HC 阈值调到两模式 buck 供电电流相同。

**独立 ETSM 测量**：

| 指标 | HC | TS |
|---|---|---|
| 20 MHz 峰值效率（1 μH，$f_{sw}\approx 10$ MHz） | 73% | **77%**（+4%） |
| $f_{sw}\approx 10$ MHz 处运放损耗 $P_e$ | 100 mW | **60 mW**（−40%） |
| 0.8 W 输出运放供电电流 | — | **−10 mA** |

- 20 MHz、PAPR 6 dB、0.5 W（back-off 5.8 dB）：ETSM 效率 **71.2% → 74.2%**（+3%）；完全饱和输出 88%；波形误差 <−35 dB。

**160 MHz 模式为何退回 HC**：时间轴压缩 8× → $f_{sw}$ 8× → $P_{buck}$ 至少 2.8×（+120 mW），超过 $P_e$ 收益；且 slope-saturation 模式下运放供全部交流、TS 无益（仿真仅 70%→71%）。TS 收益上限受 buck HV IO 器件 $R_{sw}C_{sw}$ 限制——若开关器件更快（如 GaN）TS 可惠及宽带。

**完整 ET TX**（商用两级 Class-AB PA 模块、802.11ax MCS9、2.5 GHz 载波；PA 第一级 $V_{DD}$ 固定 3.4 V，ETSM 调制第二级，EVM 约束下限 20 MHz 1.2 V / 160 MHz 1.3 V）：

| 信道 | 模式 | 总效率增益（含调制器） | EVM |
|---|---|---|---|
| 20 MHz | **TS** | **+10.3%**（48.8%，相对恒压独立 PA） | −32 dB |
| 20 MHz | HC | +9.4% | −31 dB |
| 160 MHz | HC（保守 shaping） | +7.2% @ 22.3 dBm | −32.7 dB |

**诚实核算**：运放平均电流降 27%，但计入 buck 开关损耗与 PA 自身低效后，完整 TX 最终 **+1%**。时序分辨率需求：0.1 ns @ 160 MHz、1 ns @ 20 MHz。

## 个人思考与总结

- **"用 DSP 换无源件"是 RF 前端的正确方向**：本文把"优化开关序列"形式化为 Viterbi 问题——思路直接借自通信（卷积码译码），用在电源调制器上非常优雅。1-norm 代价 + 电流罚 $I_{pen}$ 的硬件化（bitwise inverse 求绝对值、常数累加、Renorm+clip）处处体现"算法设计为电路服务"。
- **诚实的数据呈现值得学习**：TS 收益在调制器级是 +3~4%，到完整 TX 只剩 +1%——buck 开关损耗与 PA 自身低效吃掉了大头。这种逐级核算既解释了为什么 160 MHz 退回 HC（TS 只在运放是瓶颈时有意义），也给读者留下准确的工程预期。
- **TS 收益的上限在器件**：$(1+\gamma)R_{sw}C_{sw}\approx 70$ ps 决定 $f_{sw}$ 上限与 $P_{buck}$ 增长斜率；作者明确指出更快开关器件（如 GaN）下 TS 可惠及宽带模式。这与站内 GaN 高频变换器的工作背景互为印证：[GaN 闭环 dv/dt 主动栅驱动](Bau 等 - 2020 - CMOS Active Gate Driver for Closed-Loop d v.md) 与 [10 MHz EMI 整定变换器](Chen 和 Ma - 2021 - A 10-MHz Closed-Loop EMI-Regulated GaN Switching P.md) 正是在把 GaN 的开关速度潜力转化为系统效率/EMI 收益。

> **可关联工具**：站内 [功率电子工具箱](../../tools/power-electronics/index.html) 覆盖变换器损耗建模；包络波形与开关序列可用 [波形绘制](../../tools/wavedrom/index.html) 图示。
