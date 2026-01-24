/**
 * Board Renderer - 渲染板书 Markup 内容
 *
 * 支持的元素：
 * - StepTitle: 带数字(1,2,3)的步骤标题
 * - H2Title: 带小圆点的二级标题
 * - Highlight: 黄色/红色高亮
 * - Underline: 下划线
 * - KeyPoint: 加粗标红
 * - NoteBox: 蓝色/黄色/绿色提示块
 * - AnswerBox: 红框答案
 * - Formula: 公式渲染
 * - HTML: HTML内容渲染
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Star } from 'lucide-react-native';
import {
  parseBoardMarkup,
  parseInlineMarkup,
  Block,
  InlineElement,
  ParsedBoard,
  normalizeLatexText,
} from '../utils/boardMarkup';
import { MathRichTextBlock, hasMathDelimiters } from './MathRichTextBlock';

// ============ 内联元素组件 ============

interface HighlightProps {
  children: React.ReactNode;
  color?: 'yellow' | 'red';
}

const Highlight = ({ children, color = 'yellow' }: HighlightProps) => {
  const bgColor = color === 'yellow' ? '#FEF08A' : '#FECACA';
  return (
    <Text style={{ backgroundColor: bgColor, paddingHorizontal: 2 }}>
      {children}
    </Text>
  );
};

const Underline = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      textDecorationLine: 'underline',
      textDecorationColor: '#EF4444',
      textDecorationStyle: 'solid',
    }}
  >
    {children}
  </Text>
);

const KeyPoint = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ color: '#DC2626', fontWeight: 'bold' }}>{children}</Text>
);

const Formula = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontFamily: 'monospace',
      backgroundColor: '#F3F4F6',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    }}
  >
    {children}
  </Text>
);

// ============ 块级元素组件 ============

interface StepTitleProps {
  num: number;
  children: React.ReactNode;
}

const StepTitle = ({ num, children }: StepTitleProps) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
    }}
  >
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
      }}
    >
      <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>
        {num}
      </Text>
    </View>
    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E40AF' }}>
      {children}
    </Text>
  </View>
);

interface H2TitleProps {
  children: React.ReactNode;
  color?: string;
}

const H2Title = ({ children, color = '#F59E0B' }: H2TitleProps) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 8,
    }}
  >
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        marginRight: 8,
      }}
    />
    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#374151' }}>
      {children}
    </Text>
  </View>
);

type NoteColor = 'blue' | 'yellow' | 'green';

interface NoteBoxProps {
  color: NoteColor;
  children: React.ReactNode;
}

const NOTE_STYLES: Record<
  NoteColor,
  { bg: string; border: string; text: string; icon: string }
> = {
  blue: {
    bg: '#DBEAFE',
    border: '#3B82F6',
    text: '#1E40AF',
    icon: '#3B82F6',
  },
  yellow: {
    bg: '#FEF3C7',
    border: '#F59E0B',
    text: '#92400E',
    icon: '#F59E0B',
  },
  green: {
    bg: '#DCFCE7',
    border: '#22C55E',
    text: '#166534',
    icon: '#22C55E',
  },
};

const NoteBox = ({ color, children }: NoteBoxProps) => {
  const styles = NOTE_STYLES[color];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: styles.bg,
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
        borderLeftWidth: 4,
        borderLeftColor: styles.border,
      }}
    >
      <Star
        size={16}
        color={styles.icon}
        style={{ marginRight: 8, marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
};

const AnswerBox = ({ children }: { children: React.ReactNode }) => (
  <View
    style={{
      borderWidth: 2,
      borderColor: '#DC2626',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginVertical: 8,
      alignSelf: 'flex-start',
      backgroundColor: '#FEF2F2',
    }}
  >
    <Text style={{ color: '#DC2626', fontWeight: 'bold', fontSize: 20 }}>
      {children}
    </Text>
  </View>
);

// ============ 内联渲染器 ============

interface InlineRendererProps {
  text: string;
  style?: any;
}

const InlineRenderer = ({ text, style }: InlineRendererProps) => {
  const elements = useMemo(() => parseInlineMarkup(text), [text]);

  return (
    <Text style={[{ fontSize: 16, color: '#374151', lineHeight: 26 }, style]}>
      {elements.map((el, i) => renderInlineElement(el, i))}
    </Text>
  );
};

function renderInlineElement(element: InlineElement, key: number): React.ReactNode {
  switch (element.type) {
    case 'text':
      return <Text key={key}>{normalizeLatexText(element.content)}</Text>;
    case 'highlight_yellow':
      return (
        <Highlight key={key} color="yellow">
          {normalizeLatexText(element.content)}
        </Highlight>
      );
    case 'highlight_red':
      return (
        <Highlight key={key} color="red">
          {normalizeLatexText(element.content)}
        </Highlight>
      );
    case 'bold_red':
      return <KeyPoint key={key}>{normalizeLatexText(element.content)}</KeyPoint>;
    case 'underline':
      return <Underline key={key}>{normalizeLatexText(element.content)}</Underline>;
    case 'formula':
      return <Formula key={key}>{normalizeLatexText(element.content)}</Formula>;
    case 'html':
      // 简单处理：直接显示文本，可以后续集成 WebView 或 react-native-render-html
      return <Text key={key}>{element.content}</Text>;
    default:
      return <Text key={key}>{element.content}</Text>;
  }
}

// ============ 块级渲染器 ============

interface BlockRendererProps {
  block: Block;
}

const BlockRenderer = ({ block }: BlockRendererProps) => {
  switch (block.type) {
    case 'step':
      return (
        <View>
          <StepTitle num={block.number}>{block.title}</StepTitle>
          {block.children.map((child, i) => (
            <BlockRenderer key={i} block={child} />
          ))}
        </View>
      );

    case 'h2':
      return <H2Title color={block.color}>{block.title}</H2Title>;

    case 'note':
      return (
        <NoteBox color={block.color}>
          {hasMathDelimiters(block.content) ? (
            <MathRichTextBlock
              text={block.content}
              textColor={NOTE_STYLES[block.color].text}
              fontSize={14}
              lineHeight={22}
            />
          ) : (
            <InlineRenderer
              text={block.content}
              style={{ color: NOTE_STYLES[block.color].text, fontSize: 14 }}
            />
          )}
        </NoteBox>
      );

    case 'answer':
      return (
        <AnswerBox>
          {hasMathDelimiters(block.content) ? (
            <MathRichTextBlock
              text={block.content}
              textColor="#DC2626"
              fontSize={20}
              lineHeight={28}
            />
          ) : (
            block.content
          )}
        </AnswerBox>
      );

    case 'paragraph':
      return (
        <View style={{ marginVertical: 4 }}>
          {hasMathDelimiters(block.content) ? (
            <MathRichTextBlock text={block.content} />
          ) : (
            <InlineRenderer text={block.content} />
          )}
        </View>
      );

    default:
      return null;
  }
};

// ============ 主渲染器 ============

interface BoardRendererProps {
  markup: string;
  title?: string;
}

export const BoardRenderer = ({ markup, title }: BoardRendererProps) => {
  const parsed = useMemo(() => parseBoardMarkup(markup), [markup]);

  return (
    <View>
      {title && (
        <View
          style={{
            borderBottomWidth: 2,
            borderBottomColor: '#F97316',
            paddingBottom: 8,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#C2410C' }}>
            {title}
          </Text>
        </View>
      )}

      {parsed.blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </View>
  );
};

// ============ 导出单独组件供直接使用 ============

export {
  Highlight,
  Underline,
  KeyPoint,
  Formula,
  StepTitle,
  H2Title,
  NoteBox,
  AnswerBox,
  InlineRenderer,
};

export default BoardRenderer;
