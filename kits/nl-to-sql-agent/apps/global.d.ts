declare module '*.css' {
  const content: any;
  export default content;
}

declare module 'react-syntax-highlighter' {
  import { ComponentType } from 'react';
  interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, any>;
    children?: string;
    showLineNumbers?: boolean;
    wrapLines?: boolean;
    [key: string]: any;
  }
  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>;
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  const styles: Record<string, Record<string, any>>;
  export const oneLight: Record<string, any>;
  export const prism: Record<string, any>;
  export default styles;
}
