/* tools/fmea/data.js
   FMEA 失效模式库 + S/O/D 打分锚点
   数据声明：内容为参考 ISO 26262-5 附录 D 与 ISO 26262-11 风格整理的工程示例，
   失效分布百分比取常见文献量级，非标准原文引用；实际项目请以最新标准与实测数据为准。 */

/* 结构：FMEA_DATA[cat].items[i].subs[j] = { sub, zh, en, modes:[[中文, English, 分布], ...] } */
var FMEA_DATA = {
    analog: {
        name: '模拟',
        items: [
            {
                comp: '电阻',
                subs: [
                    {
                        sub: '贴片电阻（厚膜/薄膜）',
                        zh: '片式厚膜/薄膜电阻，用于偏置、分压与电流采样。',
                        en: 'Thick/thin-film SMD resistor for biasing, dividers and current sensing.',
                        modes: [
                            ['开路', 'Open circuit', '60%'],
                            ['阻值漂移（超出容差）', 'Resistance drift beyond tolerance', '30%'],
                            ['短路', 'Short circuit', '10%']
                        ]
                    },
                    {
                        sub: '精密电阻网络（匹配对）',
                        zh: '成比例使用的薄膜电阻阵列，关注比率匹配漂移。',
                        en: 'Thin-film resistor array used in ratios; ratio matching drift is the key concern.',
                        modes: [
                            ['开路', 'Open circuit', '50%'],
                            ['比率/匹配漂移', 'Ratio (matching) drift', '40%'],
                            ['短路', 'Short circuit', '10%']
                        ]
                    }
                ]
            },
            {
                comp: '电容',
                subs: [
                    {
                        sub: '陶瓷电容（MLCC）',
                        zh: '多层陶瓷电容，去耦/补偿常用；注意 DC bias 衰减与机械开裂。',
                        en: 'MLCC for decoupling/compensation; beware DC-bias loss and cracking.',
                        modes: [
                            ['短路（开裂/击穿）', 'Short (crack / breakdown)', '45%'],
                            ['容值漂移（DC bias/老化）', 'Capacitance drift (DC bias / aging)', '35%'],
                            ['开路', 'Open circuit', '20%']
                        ]
                    },
                    {
                        sub: '电解电容',
                        zh: '铝电解电容，大容量储能/滤波；寿命受温度影响显著。',
                        en: 'Aluminium electrolytic capacitor for bulk storage; lifetime strongly temperature-dependent.',
                        modes: [
                            ['容值下降 / ESR 上升', 'Capacitance loss / ESR increase', '50%'],
                            ['开路', 'Open circuit', '30%'],
                            ['短路', 'Short circuit', '20%']
                        ]
                    }
                ]
            },
            {
                comp: '二极管',
                subs: [
                    {
                        sub: '通用/整流二极管',
                        zh: 'PN 结二极管，用于整流、续流与钳位。',
                        en: 'PN junction diode for rectification, freewheeling and clamping.',
                        modes: [
                            ['短路', 'Short circuit', '45%'],
                            ['开路', 'Open circuit', '40%'],
                            ['反向漏电增大', 'Reverse leakage increase', '15%']
                        ]
                    },
                    {
                        sub: 'ESD 保护二极管',
                        zh: '端口 ESD 箝位器件，承受重复瞬态冲击。',
                        en: 'ESD clamp at I/O ports, subject to repeated transient stress.',
                        modes: [
                            ['短路', 'Short circuit', '50%'],
                            ['开路（保护失效）', 'Open (loss of protection)', '30%'],
                            ['漏电增大', 'Leakage increase', '20%']
                        ]
                    }
                ]
            },
            {
                comp: 'MOSFET',
                subs: [
                    {
                        sub: 'NMOS',
                        zh: 'NMOS 开关/放大管，关注栅氧完整性与沟道退化。',
                        en: 'NMOS switch/amplifying device; gate oxide integrity and channel degradation are key.',
                        modes: [
                            ['栅-源 / 栅-漏短路', 'Gate-source / gate-drain short', '25%'],
                            ['漏-源短路', 'Drain-source short', '25%'],
                            ['阈值 / 导通电阻漂移', 'Vth / Rds(on) drift', '25%'],
                            ['开路（任意端）', 'Open circuit (any terminal)', '15%'],
                            ['体二极管异常导通', 'Body diode abnormal conduction', '10%']
                        ]
                    },
                    {
                        sub: 'PMOS',
                        zh: 'PMOS 器件，常用于高边开关与电流镜负载。',
                        en: 'PMOS device, often used as high-side switch and current-mirror load.',
                        modes: [
                            ['栅-源 / 栅-漏短路', 'Gate-source / gate-drain short', '25%'],
                            ['漏-源短路', 'Drain-source short', '25%'],
                            ['阈值 / 导通电阻漂移', 'Vth / Rds(on) drift', '25%'],
                            ['开路（任意端）', 'Open circuit (any terminal)', '15%'],
                            ['体二极管异常导通', 'Body diode abnormal conduction', '10%']
                        ]
                    }
                ]
            },
            {
                comp: 'BJT',
                subs: [
                    {
                        sub: 'NPN',
                        zh: '双极型管，用于放大与带隙基准核心。',
                        en: 'Bipolar transistor for amplification and bandgap cores.',
                        modes: [
                            ['任意端开路', 'Open at any terminal', '30%'],
                            ['C-E 短路', 'Collector-emitter short', '25%'],
                            ['β / Vbe 漂移', 'β / Vbe drift', '25%'],
                            ['B-E 短路', 'Base-emitter short', '20%']
                        ]
                    },
                    {
                        sub: 'PNP（横向/衬底）',
                        zh: 'PNP 管（横向/衬底），β 与带宽较低。',
                        en: 'PNP (lateral/substrate) transistor, lower β and bandwidth.',
                        modes: [
                            ['任意端开路', 'Open at any terminal', '30%'],
                            ['C-E 短路', 'Collector-emitter short', '25%'],
                            ['β / Vbe 漂移', 'β / Vbe drift', '25%'],
                            ['B-E 短路', 'Base-emitter short', '20%']
                        ]
                    }
                ]
            },
            {
                comp: '运放',
                subs: [
                    {
                        sub: '通用运放',
                        zh: '两级/折叠式运放，闭环使用。',
                        en: 'Two-stage / folded-cascode op-amp in closed loop.',
                        modes: [
                            ['输出固定（卡电源轨）', 'Output stuck at rail', '30%'],
                            ['输入失调漂移', 'Input offset drift', '25%'],
                            ['开环增益下降', 'Open-loop gain degradation', '20%'],
                            ['CMRR / PSRR 退化', 'CMRR / PSRR degradation', '15%'],
                            ['输入级开路/短路', 'Input stage open / short', '10%']
                        ]
                    }
                ]
            },
            {
                comp: '比较器',
                subs: [
                    {
                        sub: '通用比较器',
                        zh: '带迟滞比较器，用于阈值检测与保护。',
                        en: 'Comparator with hysteresis for threshold detection and protection.',
                        modes: [
                            ['输出固定', 'Stuck output', '35%'],
                            ['阈值/迟滞漂移', 'Threshold / hysteresis drift', '30%'],
                            ['传输延迟增大', 'Propagation delay increase', '20%'],
                            ['输入对管失配漂移', 'Input pair mismatch drift', '15%']
                        ]
                    }
                ]
            },
            {
                comp: '带隙基准',
                subs: [
                    {
                        sub: '带隙基准（BGR）',
                        zh: 'CTAT 与 PTAT 相加产生温度稳定参考。',
                        en: 'Bandgap reference combining CTAT and PTAT for a temperature-stable output.',
                        modes: [
                            ['输出漂移超差', 'Output drift out of tolerance', '35%'],
                            ['启动失败', 'Start-up failure', '25%'],
                            ['输出固定', 'Output stuck', '20%'],
                            ['PSRR 退化', 'PSRR degradation', '20%']
                        ]
                    }
                ]
            },
            {
                comp: 'LDO',
                subs: [
                    {
                        sub: '低压差线性稳压器',
                        zh: 'PMOS 调整管 LDO，为敏感模拟电路供电。',
                        en: 'PMOS pass-device LDO supplying sensitive analog blocks.',
                        modes: [
                            ['输出欠压/掉压', 'Output undervoltage / dropout', '30%'],
                            ['输出过压', 'Output overvoltage', '25%'],
                            ['调整管短路', 'Pass device short', '15%'],
                            ['输出振荡', 'Output oscillation', '15%'],
                            ['静态电流异常', 'Quiescent current abnormal', '15%']
                        ]
                    }
                ]
            },
            {
                comp: 'ADC',
                subs: [
                    {
                        sub: 'SAR ADC',
                        zh: '逐次逼近 ADC，关注失码与参考完整性。',
                        en: 'SAR ADC; watch missing codes and reference integrity.',
                        modes: [
                            ['转换结果固定', 'Stuck conversion result', '25%'],
                            ['失码', 'Missing codes', '25%'],
                            ['偏移/增益漂移', 'Offset / gain drift', '25%'],
                            ['参考电压异常', 'Reference fault', '15%'],
                            ['转换超时', 'Conversion timeout', '10%']
                        ]
                    }
                ]
            },
            {
                comp: 'DAC',
                subs: [
                    {
                        sub: '电流舵 DAC',
                        zh: '电流舵 DAC，用于高精度模拟输出。',
                        en: 'Current-steering DAC for precision analog output.',
                        modes: [
                            ['输出固定', 'Stuck output', '30%'],
                            ['增益/偏移漂移', 'Gain / offset drift', '30%'],
                            ['单调性破坏', 'Loss of monotonicity', '20%'],
                            ['电流源开路/短路', 'Current cell open / short', '20%']
                        ]
                    }
                ]
            }
        ]
    },
    digital: {
        name: '数字',
        items: [
            {
                comp: '组合逻辑',
                subs: [
                    {
                        sub: '组合逻辑云',
                        zh: '与/或/非等组合门网络。',
                        en: 'Combinational gate cloud (AND/OR/INV ...).',
                        modes: [
                            ['输出固定 1', 'Stuck-at-1', '25%'],
                            ['输出固定 0', 'Stuck-at-0', '25%'],
                            ['桥接短路', 'Bridging short', '20%'],
                            ['开路', 'Open', '15%'],
                            ['延迟/转换故障', 'Transition (delay) fault', '15%']
                        ]
                    }
                ]
            },
            {
                comp: '触发器/寄存器',
                subs: [
                    {
                        sub: 'DFF 与寄存器组',
                        zh: '时序采样单元，含时钟与复位端。',
                        en: 'Flip-flops and register banks, sequential sampling elements.',
                        modes: [
                            ['固定 1/0', 'Stuck-at-1 / 0', '40%'],
                            ['单粒子翻转（SEU）', 'Single-event upset (bit flip)', '30%'],
                            ['时钟/复位异常', 'Clock / reset fault', '20%'],
                            ['建立/保持时间违规', 'Setup / hold violation', '10%']
                        ]
                    }
                ]
            },
            {
                comp: 'SRAM',
                subs: [
                    {
                        sub: '嵌入式 SRAM',
                        zh: 'SRAM 阵列与地址译码。',
                        en: 'Embedded SRAM array with address decoding.',
                        modes: [
                            ['位单元固定', 'Stuck-at cell', '40%'],
                            ['单粒子/多位翻转', 'SEU / multi-bit upset (MBU)', '30%'],
                            ['地址译码故障', 'Address decoder fault', '15%'],
                            ['耦合故障', 'Coupling fault', '15%']
                        ]
                    }
                ]
            },
            {
                comp: 'Flash',
                subs: [
                    {
                        sub: '嵌入式 Flash',
                        zh: '嵌入式 Flash 存储，含 ECC。',
                        en: 'Embedded Flash memory with ECC.',
                        modes: [
                            ['数据保持失效（电荷泄漏）', 'Data retention loss (charge leakage)', '35%'],
                            ['编程/擦除失败', 'Program / erase failure', '25%'],
                            ['位翻转', 'Bit flip', '20%'],
                            ['ECC 不可纠多位错', 'ECC-uncorrectable multi-bit error', '20%']
                        ]
                    }
                ]
            },
            {
                comp: 'MCU 内核',
                subs: [
                    {
                        sub: 'CPU 内核',
                        zh: '取指/译码/执行流水线。',
                        en: 'CPU core fetch / decode / execute pipeline.',
                        modes: [
                            ['指令执行错误', 'Wrong instruction execution', '30%'],
                            ['寄存器文件损坏', 'Register file corruption', '25%'],
                            ['ALU 计算错误', 'ALU miscalculation', '20%'],
                            ['取指/接口异常', 'Fetch / interface fault', '15%'],
                            ['中断控制器异常', 'Interrupt controller fault', '10%']
                        ]
                    }
                ]
            },
            {
                comp: 'PLL 时钟',
                subs: [
                    {
                        sub: 'PLL 时钟单元',
                        zh: 'PLL 倍频与时钟分配。',
                        en: 'PLL clock multiplication and distribution.',
                        modes: [
                            ['失锁', 'Loss of lock', '40%'],
                            ['输出频率漂移', 'Output frequency drift', '25%'],
                            ['抖动超标', 'Jitter out of spec', '20%'],
                            ['输出卡死（恒高/恒低）', 'Output stuck high / low', '15%']
                        ]
                    }
                ]
            },
            {
                comp: '复位监控',
                subs: [
                    {
                        sub: '上电复位/电压监控',
                        zh: '上电复位与电源监控单元。',
                        en: 'Power-on reset and supply supervision unit.',
                        modes: [
                            ['复位未触发', 'Failure to assert reset', '40%'],
                            ['误复位', 'Spurious reset', '30%'],
                            ['复位释放时序错误', 'Reset release timing fault', '20%'],
                            ['阈值漂移', 'Threshold drift', '10%']
                        ]
                    }
                ]
            },
            {
                comp: '总线接口',
                subs: [
                    {
                        sub: '片上总线/外设接口',
                        zh: '片上总线与外设接口逻辑。',
                        en: 'On-chip bus and peripheral interface logic.',
                        modes: [
                            ['数据/地址位固定', 'Stuck data / address bit', '30%'],
                            ['仲裁死锁', 'Arbitration deadlock', '25%'],
                            ['协议违规', 'Protocol violation', '25%'],
                            ['超时无响应', 'Timeout / no response', '20%']
                        ]
                    }
                ]
            }
        ]
    }
};

/* S/O/D 打分锚点（1–10）：[级别, 通用锚点, 汽车电子示例] */
var SOD_DATA = {
    S: {
        title: '严重度 S（Severity）',
        rows: [
            [10, '安全相关失效，无预警', '危及人身安全的失效，如制动/转向助力突然丧失且无任何警告'],
            [9, '安全相关失效，有预警', '潜在安全失效但有提前警告，如动力受限前点亮故障灯'],
            [8, '主要功能丧失', '车辆主要功能失效，如无法启动 / 行驶中动力中断'],
            [7, '主要功能降级', '主要功能性能显著下降，如跛行回家（limp-home）模式'],
            [6, '次要功能丧失', '舒适/便利功能失效，如空调、车窗失效'],
            [5, '次要功能降级', '便利功能性能下降，如仪表背光变暗'],
            [4, '明显感知的轻微缺陷', '多数用户可察觉的异响/外观问题'],
            [3, '轻微缺陷', '细心用户才可察觉的轻微瑕疵'],
            [2, '极轻微缺陷', '仅个别工况下偶发、几乎不可察觉'],
            [1, '无影响', '无可察觉的影响']
        ]
    },
    O: {
        title: '频度 O（Occurrence）',
        rows: [
            [10, '极高，几乎必然', '失效率 ≥ 1/10（每千件 ≥ 100）'],
            [9, '很高', '约 1/20'],
            [8, '高', '约 1/50'],
            [7, '中高', '约 1/100'],
            [6, '中等', '约 1/500'],
            [5, '中低', '约 1/2,000'],
            [4, '低', '约 1/10,000'],
            [3, '很低', '约 1/100,000'],
            [2, '极低', '约 1/1,000,000'],
            [1, '几乎不可能', '通过预防设计基本消除']
        ]
    },
    D: {
        title: '探测度 D（Detection）',
        rows: [
            [10, '几乎无法探测', '无现有探测手段或安全机制'],
            [9, '极难探测', '仅可能在售后市场暴露'],
            [8, '难探测', '仅破坏性试验可发现'],
            [7, '较难探测', '台架/耐久试验中可能发现'],
            [6, '中等', '下线检测（EOL）可发现'],
            [5, '中', '常规功能测试可发现'],
            [4, '较易探测', '在线自测（如 BIST）高概率发现'],
            [3, '易探测', '安全机制周期自检可发现'],
            [2, '很易探测', '上电自检（POST）即可发现'],
            [1, '几乎必然探测', '设计内建机制 100% 探测']
        ]
    }
};
