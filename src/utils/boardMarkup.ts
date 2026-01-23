/**
 * Board Markup Language Parser
 *
 * 语法规范：
 *
 * 内联标记：
 *   ==文字==       → 黄色高亮
 *   ^^文字^^       → 红色高亮
 *   **文字**       → 加粗标红
 *   __文字__       → 下划线
 *   $$公式$$       → 公式渲染
 *   ~~html~~       → HTML渲染
 *
 * 块级标记：
 *   :::step{n=1} 标题
 *   内容...
 *   :::
 *
 *   :::h2 标题
 *   :::
 *
 *   :::note{color=blue}
 *   提示内容
 *   :::
 *
 *   :::answer
 *   答案内容
 *   :::
 */

// ============ Types ============

export type InlineElementType =
  | 'text'
  | 'highlight_yellow'
  | 'highlight_red'
  | 'bold_red'
  | 'underline'
  | 'formula'
  | 'html';

export interface InlineElement {
  type: InlineElementType;
  content: string;
}

export type BlockType =
  | 'step'      // :::step{n=1} 标题 - 带数字的步骤标题
  | 'h2'        // :::h2 标题 - 带小圆点的二级标题
  | 'note'      // :::note{color=blue|yellow|green} - 提示块
  | 'answer'    // :::answer - 红框答案
  | 'paragraph'; // 普通段落

export interface BlockBase {
  type: BlockType;
}

export interface StepBlock extends BlockBase {
  type: 'step';
  number: number;
  title: string;
  children: Block[];
}

export interface H2Block extends BlockBase {
  type: 'h2';
  title: string;
  color?: string; // 圆点颜色
}

export interface NoteBlock extends BlockBase {
  type: 'note';
  color: 'blue' | 'yellow' | 'green';
  content: string;
}

export interface AnswerBlock extends BlockBase {
  type: 'answer';
  content: string;
}

export interface ParagraphBlock extends BlockBase {
  type: 'paragraph';
  content: string;
}

export type Block = StepBlock | H2Block | NoteBlock | AnswerBlock | ParagraphBlock;

export interface ParsedBoard {
  blocks: Block[];
}

// ============ Parser ============

/**
 * 解析块级属性 {n=1, color=blue}
 */
function parseProps(propsStr?: string): Record<string, string> {
  if (!propsStr) return {};
  const props: Record<string, string> = {};
  const regex = /(\w+)=(\w+)/g;
  let match;
  while ((match = regex.exec(propsStr)) !== null) {
    props[match[1]] = match[2];
  }
  return props;
}

/**
 * 解析板书 Markup 为结构化数据
 */
export function parseBoardMarkup(markup: string): ParsedBoard {
  const lines = markup.split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 空行跳过
    if (!line.trim()) {
      i++;
      continue;
    }

    // 块级标记 :::type{props} title
    const blockMatch = line.match(/^:::(\w+)(?:\{([^}]+)\})?\s*(.*)$/);
    if (blockMatch) {
      const [, blockType, propsStr, inlineContent] = blockMatch;
      const props = parseProps(propsStr);

      // 收集块内容直到 :::
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') {
        contentLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::

      const content = contentLines.join('\n').trim();

      switch (blockType) {
        case 'step': {
          // 递归解析 step 内部内容
          const childBlocks = content ? parseBoardMarkup(content).blocks : [];
          blocks.push({
            type: 'step',
            number: parseInt(props.n || '1', 10),
            title: inlineContent || '',
            children: childBlocks,
          });
          break;
        }
        case 'h2': {
          blocks.push({
            type: 'h2',
            title: inlineContent || content,
            color: props.color,
          });
          break;
        }
        case 'note': {
          blocks.push({
            type: 'note',
            color: (props.color as 'blue' | 'yellow' | 'green') || 'blue',
            content,
          });
          break;
        }
        case 'answer': {
          blocks.push({
            type: 'answer',
            content: inlineContent || content,
          });
          break;
        }
        default:
          // 未知块类型当作段落
          blocks.push({
            type: 'paragraph',
            content: line,
          });
      }
      continue;
    }

    // 普通段落
    blocks.push({
      type: 'paragraph',
      content: line,
    });
    i++;
  }

  return { blocks };
}

/**
 * 解析内联标记
 */
export function parseInlineMarkup(text: string): InlineElement[] {
  const elements: InlineElement[] = [];

  // 定义所有内联标记模式（按优先级排序）
  const patterns: { regex: RegExp; type: InlineElementType }[] = [
    { regex: /~~(.+?)~~/g, type: 'html' },           // ~~html~~ HTML渲染
    { regex: /\$\$(.+?)\$\$/g, type: 'formula' },    // $$公式$$ 公式
    { regex: /\*\*(.+?)\*\*/g, type: 'bold_red' },   // **加粗** 加粗标红
    { regex: /==(.+?)==/g, type: 'highlight_yellow' }, // ==高亮== 黄色高亮
    { regex: /\^\^(.+?)\^\^/g, type: 'highlight_red' }, // ^^高亮^^ 红色高亮
    { regex: /__(.+?)__/g, type: 'underline' },      // __下划线__ 下划线
  ];

  // 找出所有匹配项及其位置
  interface Match {
    start: number;
    end: number;
    type: InlineElementType;
    content: string;
  }

  const matches: Match[] = [];

  for (const { regex, type } of patterns) {
    let match;
    const regexCopy = new RegExp(regex.source, regex.flags);
    while ((match = regexCopy.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        content: match[1],
      });
    }
  }

  // 按起始位置排序
  matches.sort((a, b) => a.start - b.start);

  // 移除重叠的匹配（保留先出现的）
  const filteredMatches: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }

  // 构建元素数组
  let currentPos = 0;
  for (const m of filteredMatches) {
    // 添加前面的普通文本
    if (m.start > currentPos) {
      elements.push({
        type: 'text',
        content: text.slice(currentPos, m.start),
      });
    }
    // 添加标记元素
    elements.push({
      type: m.type,
      content: m.content,
    });
    currentPos = m.end;
  }

  // 添加剩余的普通文本
  if (currentPos < text.length) {
    elements.push({
      type: 'text',
      content: text.slice(currentPos),
    });
  }

  return elements;
}

// ============ 示例 ============

export const EXAMPLE_MARKUP = `
:::step{n=1} 审题 - 观察方程特点
已知方程：==x² - 6x + 9 = 0==

观察发现：这是一个__一元二次方程__，且系数有特殊规律

:::note{color=blue}
注意观察常数项 9 = 3²，一次项系数 6 = 2×3
:::
:::

:::step{n=2} 识别 - 完全平方公式
回忆公式：**(a-b)² = a² - 2ab + b²**

:::note{color=yellow}
对比：x² - 6x + 9 = x² - ^^2·3·x^^ + ^^3²^^
:::

✓ 符合公式形式，其中 **a = x, b = 3**
:::

:::step{n=3} 求解 - 得出答案
由 x - 3 = 0，解得：

:::answer
x = 3
:::

:::note{color=green}
本题为__重根__，x = 3 是二重根
:::
:::
`;
