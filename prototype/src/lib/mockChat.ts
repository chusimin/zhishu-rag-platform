// 脚本化的对话回复：模拟 Agent 工具调用、知识库引用与人工转接。

export interface Step { kind: 'kb' | 'tool' | 'think' | 'node' | 'handoff'; name: string; detail: string; ms: number }
export interface Citation { file: string; title: string; content: string; score: number }
export interface Reply { steps: Step[]; content: string; citations: Citation[]; handoff?: boolean }

const CITE_E07: Citation = { file: '智能储能柜 ES-200 用户手册 V3.2.pdf', title: '5 故障处理 > 5.1 常见故障代码', content: 'E07 BMS 通讯中断：检查 CAN 通讯线及终端电阻。', score: 0.94 };
const CITE_RETURN: Citation = { file: '售后服务政策 V2.1.docx', title: '第二章 退换货 > 第三条', content: '客户自签收之日起 7 日内，产品无人为损坏且包装完整的，可申请无理由退货。退货运费由客户承担，产品质量问题除外。', score: 0.91 };
const CITE_TRAVEL: Citation = { file: '差旅费用管理办法（2026 修订）.pdf', title: '第四章 住宿标准 > 第十二条', content: '一线城市（北京、上海、广州、深圳）住宿标准：经理级及以下 500 元/晚，总监级 700 元/晚。', score: 0.89 };

export function scriptedReply(appId: string, question: string): Reply {
  const q = question.toLowerCase();
  if (appId === 'app-service' || appId === 'app-sales') {
    if (/so\d{6,}|订单/.test(q)) {
      return {
        steps: [
          { kind: 'think', name: '规划', detail: '用户想查询订单进度，需要调用订单查询工具', ms: 420 },
          { kind: 'tool', name: '订单查询', detail: '{"order_no":"SO20261024017"} → 已发货，顺丰 SF1428893021，预计 10-28 送达', ms: 860 },
        ],
        content: '帮您查到了：订单 **SO20261024017**（ES-100 储能柜 ×1）已于 10 月 25 日发货。\n\n- 承运：顺丰速运，运单号 SF1428893021\n- 当前位置：杭州转运中心\n- 预计送达：10 月 28 日（周二）\n\n设备送达后，安装工程师会在 24 小时内联系您预约上门安装。还有其他可以帮您的吗？',
        citations: [],
      };
    }
    if (/比|便宜|竞品|价格/.test(q)) {
      return {
        steps: [
          { kind: 'kb', name: '知识库搜索', detail: '产品手册与 FAQ · 未找到相关度 ≥ 0.4 的内容', ms: 310 },
          { kind: 'handoff', name: '转人工', detail: '命中规则「竞品比价」，已转接售前顾问，排队 1 人', ms: 120 },
        ],
        content: '竞品比价涉及具体项目报价，我已为您转接售前顾问，预计 1 分钟内接入。您也可以留下联系方式，顾问会在工作时间内回电。',
        citations: [],
        handoff: true,
      };
    }
    if (/退|运费/.test(q)) {
      return {
        steps: [{ kind: 'kb', name: '知识库搜索', detail: '售后服务政策 · 召回 3 条，Rerank 后保留 1 条', ms: 380 }],
        content: '退货运费分两种情况：\n\n1. **7 天无理由退货**：签收 7 日内、产品无人为损坏且包装完整，可以退货，**运费由您承担**；\n2. **质量问题退货**：运费由我们承担。\n\n另外，签收 15 日内出现非人为性能故障选择换货的，往返运费也由我们承担。[1]',
        citations: [CITE_RETURN],
      };
    }
    return {
      steps: [
        { kind: 'think', name: '规划', detail: '故障代码类问题，使用混合检索查询产品手册', ms: 380 },
        { kind: 'kb', name: '知识库搜索', detail: '产品手册与 FAQ · 混合检索召回 6 条，Rerank 后保留 2 条', ms: 520 },
      ],
      content: '**E07 表示 BMS 通讯中断**，即电池管理系统与主控之间的 CAN 通讯断开。可以按以下步骤排查：[1]\n\n1. 检查 CAN 通讯线两端插头是否松动；\n2. 确认通讯线末端的 120 Ω 终端电阻已接入；\n3. 断电 5 分钟后重新上电，观察是否复现。\n\n如果仍然报警，我可以帮您**创建售后工单**，安排工程师上门检测。',
      citations: [CITE_E07],
    };
  }
  if (appId === 'app-policy') {
    return {
      steps: [{ kind: 'kb', name: '知识库搜索', detail: '公司制度库 · 召回 4 条，Rerank 后保留 1 条', ms: 340 }],
      content: '深圳属于一线城市，住宿标准为：[1]\n\n| 职级 | 标准 |\n|---|---|\n| 经理级及以下 | 500 元/晚 |\n| 总监级 | 700 元/晚 |\n\n超标部分需在差旅系统中填写说明，并由部门负责人审批。',
      citations: [CITE_TRAVEL],
    };
  }
  if (appId === 'app-marketing') {
    return {
      steps: [{ kind: 'kb', name: '知识库搜索', detail: '产品手册与 FAQ · 召回产品卖点 3 条', ms: 300 }],
      content: '**【公众号版】**\n标题：一台储能柜，让工厂电费降三成\nES-200 智能储能柜，215 kWh 大容量、1–8 台灵活并机……\n\n**【小红书版】**\n工厂老板都在问的「削峰填谷」到底是啥？⚡️ 我们实测了 3 个月……\n\n**【朋友圈版】**\n峰谷电价差拉大，储能回本周期缩短到 4 年以内。ES-200，现在咨询享免费测算。',
      citations: [],
    };
  }
  return {
    steps: [{ kind: 'think', name: '生成', detail: '直接调用模型生成', ms: 600 }],
    content: '已收到。这是根据你的输入生成的结果示例：\n\n1. 结论一：……\n2. 结论二：……\n3. 待办：……（负责人：张三，截止 10-31）',
    citations: [],
  };
}
