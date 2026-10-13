---
title: gm/ID 设计法思路分享：用一个数字管所有折中的晶体管尺寸设计流程
date: 2024-10-09
tags: [analog]
abstract: 深亚微米工艺下平方律公式早已失真，教科书"Vov 设计法"与实际仿真结果对不上。gm/ID 设计法把晶体管的所有折中——速度、增益、噪声、失配、摆幅——压缩到一个无量纲数字 gm/ID（跨导效率）上，再用仿真预生成的查找表（LUT）完成尺寸综合：规格→gm→选 gm/ID→查 ID/W 定 W→查 fT 与 gm/gds 验证。本文梳理其物理图像、四步流程、数值实例与常见误区，并附经典文献链接。
readtime: 12
---

> **TL;DR**：gm/ID = 跨导效率，回答"每微安电流能买到多少跨导"。强反型长沟道下 $g_m/I_D=2/V_{ov}$，弱反型极限 $1/(nV_T)\approx28\sim38$ S/A——这一个数字同时标记了管子的反型程度、速度（$f_T$ 随 gm/ID 降低而升高）、本征增益（$g_m/g_{ds}$ 随 gm/ID 升高而升高）、噪声与失配水平。设计流程因此反转：不再用公式解尺寸，而是**先用 gm/ID 选定工作点，再查表（LUT）读出尺寸**。查找表由 PDK 仿真一次性生成，方法因此与工艺节点、模型失真解耦。

## 1. 为什么教科书方法失效了

传统流程：平方律 $I_D=\frac{1}{2}\mu C_{ox}\frac{W}{L}V_{ov}^2$ → 由 $V_{ov}$ 算 W/L。问题在于深亚微米管子的 $I$-$V$ 曲线被速度饱和、DIBL、迁移率退化、纵向场效应等改写，平方律误差可达 50% 以上；不同工艺节点还得重新拟合"等效 $\mu C_{ox}$"。设计者实际依赖仿真器，但缺少把规格翻译成尺寸的**系统化桥梁**——gm/ID 方法就是这座桥：

- 不再信任任何解析 $I$-$V$ 方程，改用仿真数据本身；
- 把设计自由度从 $(W, L, V_{ov})$ 换成 $(g_m/I_D,\ L)$——前者与规格直接挂钩，后者查表即得。

## 2. gm/ID 的物理图像：一条曲线，两端极限

对固定 L 扫描 $V_{GS}$，画出 $g_m/I_D$ 对归一化电流密度 $I_D/W$ 的曲线：

| 区域 | $g_m/I_D$ | 机理 |
|---|---|---|
| 弱反型（WI） | $\dfrac{1}{nV_T}\approx28\sim38$ S/A | 扩散电流，指数 $I$-$V$，效率上限（BJT 为 $1/V_T=38.5$） |
| 中等反型（MI） | 10 ~ 25 | 过渡区，**模拟设计甜点** |
| 强反型（SI） | $\dfrac{2}{V_{ov}}$（$V_{ov}=0.2$V → 10） | 漂移电流，$V_{ov}$ 越大效率越低 |

三点直觉：

1. **gm/ID 是偏置效率的度量**：$g_m/I_D=20$ 意味着 50 µA 买 1 mS；=5 意味着要 200 µA。低功耗设计天然往大 gm/ID 走；
2. **gm/ID 是反型程度的标尺**：它单调对应 $V_{ov}$（或 $V_{GS}-V_T$），但不需要知道 $V_T$ 是多少——这在 $V_T$ 定义模糊的 MI 区尤其方便；
3. **gm/ID 与 W 无关（一阶）**：宽度缩放时 $g_m$、$I_D$、电容同比例变化，比值不变——所以一张表（以 gm/ID 为轴）服务所有 W，这是 LUT 方法可行的根本原因。

## 3. 一个数字串起所有折中

选定 gm/ID 的一瞬间，下列性能全部（近似）确定——这就是"用一个数字做设计"的含义：

| 性能 | 依赖关系 | 大 gm/ID（WI 侧） | 小 gm/ID（SI 侧） |
|---|---|---|---|
| 电流效率 | 定义本身 | 高（省电流） | 低 |
| 速度 $f_T=g_m/2\pi C_{gg}$ | WI 区 W 大 → $C_{gg}$ 大 | **低** | **高** |
| 本征增益 $g_m/g_{ds}$ | WI 区 $g_{ds}$ 小 | **高** | 低 |
| 热噪声（同 $g_m$） | $\overline{v_n^2}=4kT\gamma/g_m$，$\gamma$: WI≈$n/2$、SI≈2/3 | 略优 | 略差 |
| **电流失配** | $\sigma(\Delta I_D/I_D)\approx\sigma(\Delta V_T)\cdot g_m/I_D$ | **差**（失调被 gm/ID 放大） | 好 |
| 摆幅/线性 | $V_{ov}$ 大则线性范围大、余度大 | 差 | 好 |
| 面积 | 同 $I_D$ 下 WI 需要大 W | 大 | 小 |

两条最值得背下来的结论：

- **速度与效率不可兼得**：$f_T$ 随 gm/ID 单调下降（同 L）；要速度就得烧电流。缩 L 是同时提升 $f_T$ 与 $g_m/g_{ds}$…不，缩 L 提升 $f_T$（约 $\propto1/L^2$）但**牺牲** $g_m/g_{ds}$——L 是增益-速度旋钮，gm/ID 是效率-速度旋钮；
- **失配项里的 gm/ID 放大**：阈值失配 $\sigma(\Delta V_T)=A_{VT}/\sqrt{WL}$ 折算成电流失配要乘 gm/ID——gm/ID=30 的电流镜管，1 mV 失调就是 3% 电流失配。所以**电流镜/偏置管取小 gm/ID（5~10），增益管/噪声敏感管取大 gm/ID（15~20）**——这条经验法则几乎适用于所有电路。

## 4. LUT 设计流程：四步走

**第 0 步（一次性）**：用仿真器对每种管型（NMOS/PMOS）× 若干 L 扫描 $V_{GS}$（含 $V_{DS}$、$V_{SB}$ 维度），存下 $g_m$、$g_{ds}$、$C_{gg}$、$I_D$，整理成以 gm/ID 为自变量的查找表（$f_T$、$g_m/g_{ds}$、$I_D/W$ 均可由比值构造）。

**设计迭代（以单级 OTA 为例）**：

1. **规格 → gm**：如 GBW 与 $C_L$ 给 $g_{m1}=2\pi\cdot GBW\cdot C_L$；
2. **选 gm/ID**：按第 3 节的折中表选点——输入对要增益/噪声选 15~20，电流镜要匹配选 5~10，高速通路选 5~10；
3. **定电流与宽度**：$I_D=g_m/(g_m/I_D)$；查表得电流密度 $I_D/W$ → $W=I_D/(I_D/W)$；
4. **查表验证**：$f_T$ 是否 $>10\times$ GBW？$g_m/g_{ds}$ 是否满足增益？不满足则改 L 或改 gm/ID，回到第 2 步。

**数值例**：GBW = 100 MHz、$C_L$ = 1 pF → $g_{m1}\approx628$ µS。选 gm/ID = 15（MI 甜点）→ $I_D\approx42$ µA。0.18 µm NMOS、L=0.18 µm 的表上查得 $I_D/W\approx2$ µA/µm → W ≈ 21 µm；同表查得 $f_T\approx$ 数 GHz（余量充足）、$g_m/g_{ds}\approx20$ → 单级增益约 26 dB，不够就加 L=0.36 µm 重查（$g_m/g_{ds}$ 升到 ~40，$f_T$ 降到 1/4 仍有余量）。

## 5. 常见误区

1. **gm/ID 越大越好？** 否。同 $g_m$ 下大 gm/ID → W 大 → $C_{gg}$ 大：自身极点前移、驱动前级吃力、噪声积分电容增大。省下的电流常常不够付电容的代价；
2. **忽视 $V_{DS}$ 维度**：$g_m/g_{ds}$ 与 $V_{DS}$ 强相关（$V_{DS}$ 接近饱和边缘时 $g_{ds}$ 急升）——建表与查表都要在实际 $V_{DS}$ 附近；
3. **盲目信任弱反型区的模型**：BSIM 在 WI/MI 区的 $g_{ds}$ 建模误差最大，LUT 再忠实也只是模型的镜像——流片前对关键管做直流工作点复验；
4. **把 gm/ID 当全域优化器**：它是**单管综合**工具，电路级折中（极点配置、补偿、共模范围）仍需设计者完成——典型的配合用法见站内 [5 管 OTA 面试常见问题](five_transistor_ota_interview.md)；
5. **忘记失配维度的 W**：第 3 节失配公式里 $\sqrt{WL}$ 与 gm/ID 都可调——匹配主导的设计（电流镜、比较器输入对）应把面积预算和 gm/ID 一起迭代。

## 6. 经典文献与资源

1. **奠基论文**：F. Silveira, D. Flandre, P. G. A. Jespers, "A gm/ID Based Methodology for the Design of CMOS Analog Circuits and Its Application to the Synthesis of a Silicon-on-Insulator Micropower OTA," *IEEE J. Solid-State Circuits*, vol. 31, no. 9, pp. 1314–1319, Sep. 1996. [IEEE Xplore](https://ieeexplore.ieee.org/document/535416) —— 首次提出以 gm/ID 为轴的整套综合流程；
2. **方法论专著**：P. G. A. Jespers, *The gm/ID Methodology, a Sizing Tool for Low-Voltage Analog CMOS Circuits*, Springer, 2010. [Springer](https://link.springer.com/book/10.1007/978-0-387-47101-3) —— 半经验与紧凑模型两条路线的系统化；
3. **LUT 流派教材**：P. G. A. Jespers, B. Murmann, *Systematic Design of Analog CMOS Circuits: Using Pre-Computed Lookup Tables*, Cambridge University Press, 2017 —— 当前工业界主流做法的完整教材化；
4. **工具**：B. Murmann, *gm/ID Starter Kit*（Stanford 发布的 MATLAB 查找表脚本，GitHub 镜像与衍生工具见 [github.com/topics/gm-id](https://github.com/topics/gm-id)）；配套的斯坦福 EE315B 课程讲义是入门最佳路径；
5. **折中量化**：D. M. Binkley, *Tradeoffs and Optimization in Analog CMOS Design*, Wiley, 2008 —— 以反型系数 IC 为轴的等价表述，与 gm/ID 互为镜像。

## 7. 小结

- gm/ID = 跨导效率 = 反型程度标尺：WI 极限 $1/(nV_T)$，SI 下 $2/V_{ov}$，模拟甜点 10~20；
- 一个 gm/ID 锁定速度/增益/噪声/失配/摆幅的全部折中——**增益管取大、匹配管取小**；
- 流程反转：规格 → $g_m$ → 选 gm/ID → 查 $I_D/W$ 得 W → 查 $f_T$、$g_m/g_{ds}$ 验证；
- LUT 与解析模型解耦，方法跨工艺可移植；代价是信任边界 = PDK 模型的精度边界；
- 一句话：**别再用公式解尺寸，用 gm/ID 选工作点，让仿真数据告诉你尺寸。**

> **可关联工具**：热噪声 $\overline{v_n^2}=4kT\gamma/g_m$ 的数值代入可用站内 [噪声快速计算](../../tools/noise-calc/index.html)；$f_T$ 余量与 GBW 的关系可用 [Bode 绘图](../../tools/bode-plot/index.html) 直观核对；失配统计（$\sigma\propto1/\sqrt{WL}$）的产量换算见 [高斯/统计工具](../../tools/gaussian/index.html)；本方法在完整电路中的应用示例见站内 [5 管 OTA 面试常见问题](five_transistor_ota_interview.md)。
