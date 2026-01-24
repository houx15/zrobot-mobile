import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseInlineMarkup } from '../utils/boardMarkup';

interface MathRichTextBlockProps {
  text: string;
  textColor?: string;
  fontSize?: number;
  lineHeight?: number;
}

const escapeHtml = (raw: string) =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const inlineMarkupToHtml = (text: string) => {
  const elements = parseInlineMarkup(text);
  return elements
    .map((el) => {
      const content = escapeHtml(el.content).replace(/\n/g, '<br/>');
      switch (el.type) {
        case 'highlight_yellow':
          return `<span style="background:#FEF08A;padding:0 2px;">${content}</span>`;
        case 'highlight_red':
          return `<span style="background:#FECACA;padding:0 2px;">${content}</span>`;
        case 'bold_red':
          return `<span style="color:#DC2626;font-weight:700;">${content}</span>`;
        case 'underline':
          return `<span style="text-decoration:underline;text-decoration-color:#EF4444;">${content}</span>`;
        case 'formula':
          return `$$${content}$$`;
        case 'html':
          return content;
        case 'text':
        default:
          return content;
      }
    })
    .join('');
};

export const hasMathDelimiters = (text: string) =>
  /\$\$[^$]+\$\$|\$[^$]+\$|\\\(|\\\)|\\\[|\\\]/.test(text);

export const MathRichTextBlock = ({
  text,
  textColor = '#374151',
  fontSize = 16,
  lineHeight = 26,
}: MathRichTextBlockProps) => {
  const [height, setHeight] = useState(0);
  const [failed, setFailed] = useState(false);
  const estimatedHeight = Math.max(
    lineHeight * 2,
    Math.ceil((text?.length || 0) / 18) * lineHeight
  );
  const htmlBody = useMemo(() => inlineMarkupToHtml(text), [text]);
  const html = useMemo(
    () => `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
    <style>
      body { margin: 0; padding: 0; color: ${textColor}; font-size: ${fontSize}px; line-height: ${lineHeight}px; }
      .content { padding: 0; }
    </style>
  </head>
  <body>
    <div id="content" class="content">${htmlBody}</div>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js"></script>
    <script>
      const el = document.getElementById('content');
      renderMathInElement(el, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false},
          {left: "\\\\(", right: "\\\\)", display: false},
          {left: "\\\\[", right: "\\\\]", display: true}
        ]
      });
      const height = el.scrollHeight;
      window.ReactNativeWebView.postMessage(String(height));
    </script>
  </body>
</html>
`,
    [htmlBody, textColor, fontSize, lineHeight]
  );

  return (
    <View style={{ width: '100%' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{
          width: '100%',
          height: Math.max(1, height || estimatedHeight),
          backgroundColor: 'transparent',
        }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(event) => {
          const nextHeight = Number(event.nativeEvent.data);
          if (!Number.isNaN(nextHeight) && nextHeight > 0) {
            setHeight(nextHeight);
          }
        }}
        onError={(e) => {
          console.warn('[MathRichTextBlock] WebView error', e.nativeEvent);
          setFailed(true);
        }}
        onHttpError={(e) => {
          console.warn('[MathRichTextBlock] WebView HTTP error', e.nativeEvent);
          setFailed(true);
        }}
        onLoadEnd={() => {
          if (height === 0) {
            console.warn('[MathRichTextBlock] WebView loaded but height=0');
            setHeight(estimatedHeight);
          }
        }}
        injectedJavaScript={`
          (function() {
            try {
              const el = document.getElementById('content');
              const height = el ? el.scrollHeight : document.body.scrollHeight;
              window.ReactNativeWebView.postMessage(String(height || 0));
              setTimeout(function() {
                const el2 = document.getElementById('content');
                const height2 = el2 ? el2.scrollHeight : document.body.scrollHeight;
                window.ReactNativeWebView.postMessage(String(height2 || 0));
              }, 120);
            } catch (e) {
              window.ReactNativeWebView.postMessage("0");
            }
          })();
          true;
        `}
      />
      {(height === 0 || failed) && (
        <Text style={{ color: textColor, fontSize, lineHeight }}>
          {text}
        </Text>
      )}
    </View>
  );
};

export default MathRichTextBlock;
