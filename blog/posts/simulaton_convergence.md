---
title: model 仿真不收敛 debug flow（Virtuoso）
date: 2026-03-15
tags: [analog, tools]
authors: Hawkeye
source: Tools
abstract: 本文介绍了常用的仿真不收敛 debug flow（Virtuoso）。
readtime: 6
---

# model 仿真不收敛 debug flow（Virtuoso）

## HiSIM-HV 收敛问题系统化 Debug 流程

> 背景：HiSIM 更真实物理建模 + 更强非线性 + 更强耦合 → 对电路与仿真更加敏感；BSIM4 更"工程化"，很多行为被平滑或简化了。

| 步骤 | 前置条件 | 排查项 | 具体操作 |
| --- | --- | --- | --- |
| 1 仿真环境排查 | 初始入口 | 仿真器版本 | spectre 版本 201/211/231 转换；IC 版本 617/618 转换 |
| 1 仿真环境排查 | 初始入口 | 输出设置 | print 电流、不 print 电流之类设置变化 |
| 1 仿真环境排查 | 初始入口 | 仿真步长 | 改变仿真步长 |
| 2 控制初始条件 | 还是不收敛 | 电源激励 | 电源是否直接 step？改为 ramp（0.5–1 µs） |
| 2 控制初始条件 | 还是不收敛 | skipdc | skipdc 是否开启？设为 skipdc=no |
| 3 仿真方法调整、数值参数优化 | 若还是不收敛 | 积分方法 | method = gear2only |
| 3 仿真方法调整、数值参数优化 | 若还是不收敛 | timestep 控制 | maxstep = switching period / 50~100 |
| 3 仿真方法调整、数值参数优化 | 若还是不收敛 | reltol | 1e-3 → 5e-4 ~ 3e-3 |
| 3 仿真方法调整、数值参数优化 | 若还是不收敛 | gmin / gmindc | 1e-12 → 1e-16 ~ 1e-10 |
| 4 检查电路结构 | 若还是不收敛 | 谐振回路 | 是否存在纯电感/纯电容形成的高 Q 谐振回路 |
| 4 检查电路结构 | 若还是不收敛 | 节点连接 | 是否存在 floating 节点或弱连接节点 |
| 4 检查电路结构 | 若还是不收敛 | 驱动方式 | 是否存在理想开关直接驱动强非线性器件 |
| 4 检查电路结构 | 若还是不收敛 | 阻尼路径 | 是否缺少必要的 RC 阻尼路径 |
| 4 检查电路结构 | 若还是不收敛 | Gate 阻尼 | gate 是否有阻尼？可尝试 Rg = 1–10 Ω |
| 4 检查电路结构 | 若还是不收敛 | 寄生电阻 | Drain/Source 是否有寄生电阻？可尝试 Rd/Rs = 10–50 mΩ |
| 4 检查电路结构 | 若还是不收敛 | Snubber | 是否需要 snubber？可尝试 Csnub = 10–100 pF、Rsnub = 1–5 Ω 起始评估 |
| 4 检查电路结构 | 若还是不收敛 | 并联器件 | 大规模并联器件适当分段，避免过强理想耦合 |
| 5 模型排查 | 还是不收敛 | 单器件验证 | 单个器件 testbench |
| 5 模型排查 | 还是不收敛 | 替换验证 | 替换器件验证 |
| 5 模型排查 | 还是不收敛 | 升级处理 | 联系 model support |

## table1（通用 HiSIM-HV 仿真不收敛解决步骤）

排查顺序：环境 → 电路 → 仿真方法 → 数值参数 → 模型

| 排查阶段 | 方法 | 推荐设置 | 主要作用 | 对精度影响 |
| --- | --- | --- | --- | --- |
| 1 仿真环境 | 仿真器版本 | spectre / IC 版本切换 | 避免 tool bug | 无 |
| 1 仿真环境 | 输出设置 | print 电流 / 不 print 电流 | 避免求导问题 | 无 |
| 2 电路合理性检查 | 单器件仿真 | 单独把器件 model 拿出来，在简单 testbench 下验证 | 判断是否为电路问题 | 无 |
| 2 电路合理性检查 | 更换器件 | 用其他器件替换 | 排除特定器件异常 | 无 |
| 3 初始条件控制 | 电源 ramp | VDD 0 → VDD，0.5–1 µs ramp | 避免初始 dv/dt 冲击 | 无 |
| 3 初始条件控制 | 初始条件控制 | skipdc=no / 初始稳态 | 减少 transient 初始冲击 | 无 |
| 4 仿真方法 | 积分方法 | method=gear2only | 提高刚性系统稳定性 | 极小 |
| 4 仿真方法 | timestep 控制 | maxstep = switching period / 50–100 | 防止跳过关键动态 | 无 |
| 5 数值稳定参数 | reltol 调整 | 1e-3 → 5e-4 ~ 3e-3 | 提高 Newton 收敛稳定性 | 很小 |
| 5 数值稳定参数 | gmin 调整 | 1e-12 → 1e-10 | 改善矩阵条件数 | 很小 |
| 6 模型问题 | 联系 model support | 特殊问题进一步分析 | 解决模型层问题 | 无 |

## table2（半桥仿真额外稳定措施）

HiSIM-HV 半桥仿真中，大部分收敛问题来自电路刚性（LC 振荡和 Cgd feedback）。排查时应优先检查电路阻尼，其次调整仿真方法和数值参数，避免直接通过放宽仿真精度掩盖问题。

| 排查阶段 | 方法 | 推荐设置 | 主要作用 | 对精度影响 |
| --- | --- | --- | --- | --- |
| 1 Gate 阻尼 | Gate 串联电阻 | Rg = 1–10 Ω | 抑制 Cgd feedback，降低 dv/dt gate 电流 | 几乎无 |
| 2 Drain/Source 阻尼 | Rd / Rs 小电阻 | 10–50 mΩ | 降低 LC Q factor，抑制振荡 | 极小 |
| 3 LC 检查 | 寄生检查 | 确认无理想 LC（L>0 时必须有 R） | 避免无限振荡，L=0、rtrace=0、Rg=0 会形成理想 LC | 极小 |
| 4 Snubber 网络 | Csnub | 10–100 pF | 抑制过冲和振荡 | 轻微 |
| 4 Snubber 网络 | Rsnub | 1–5 Ω | 消耗振荡能量 | 轻微 |
| 5 仿真方法 | 积分方法 | method=gear2only | 提高刚性系统稳定性 | 极小 |
| 6 timestep 控制 | maxstep | 最短动态的 1/50~1/100 | 捕捉开关瞬态 | 无 |
| 7 仿真精度 | errpreset | moderate / conservative | 提高数值稳定性 | 很小 |

## 不收敛类型速查

- DC 不收敛 → smoothing / Rs
- Tran 不收敛 → Cgd / self-heating
- 高压不收敛 → high-field
- 随机不收敛 → RC + mismatch
