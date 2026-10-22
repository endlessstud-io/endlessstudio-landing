import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import type { Root, RootContent } from 'mdast';
import source from '../content/cv.md?raw';

export { source as cvSource };
export const cvProjectSections = ['Global Fishing Watch', 'Tree Equity Score', 'Current exploration', 'Half-Earth', 'Trase', 'Climate Watch'];
export const cvBackgroundSections = ['Earlier experience', 'Toolkit', 'Academic background'];

export interface CvMetadata {
  name: string;
  role: string;
  specialism: string;
  edition: string;
  email: string;
  website: string;
  websiteLabel: string;
  github?: string;
  linkedin: string;
  linkedinLabel: string;
  practice: string;
}

/** Section names are layout slots; all reader-facing copy lives in the Markdown. */
export async function renderCv() {
  const { frontmatter, content } = parseFrontmatter(source);
  let renderedNodes: RootContent[] = [];
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    remarkPlugins: [() => (tree: Root) => { renderedNodes = tree.children; }],
  });
  const sections: Record<string, string> = {};
  const sectionNodes: Record<string, RootContent[]> = {};

  for (const match of content.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const key = match[1].trim();
    if (key in sections) throw new Error(`Duplicate CV section: ${key}`);
    sections[key] = (await processor.render(match[2].trim())).code;
    sectionNodes[key] = renderedNodes;
  }

  for (const key of ['name', 'role', 'specialism', 'edition', 'email', 'website', 'websiteLabel', 'linkedin', 'linkedinLabel', 'practice']) {
    if (typeof frontmatter[key] !== 'string' || !frontmatter[key].trim()) {
      throw new Error(`Missing CV metadata: ${key}`);
    }
  }

  const section = (key: string) => {
    if (!(key in sections)) throw new Error(`Missing CV section: ${key}. Keep the ## headings in src/content/cv.md.`);
    return sections[key];
  };

  return {
    meta: frontmatter as unknown as CvMetadata,
    section,
    optionalSection(key: string) {
      return sections[key] ?? '';
    },
    nodes(key: string) {
      return sectionNodes[key] ?? [];
    },
    line(key: string) {
      const html = section(key);
      if (!/^<p>[^\n]*<\/p>$/.test(html)) throw new Error(`CV heading "${key}" must be a single line of Markdown.`);
      return html.slice(3, -4);
    },
  };
}
