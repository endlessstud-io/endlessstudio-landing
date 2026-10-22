import type { Image, Link, Nodes, Paragraph } from 'mdast';
import { cvBackgroundSections, cvProjectSections, renderCv } from './cv';

/** Read the CV's Markdown structure, keeping the landing's presentation separate. */
function text(node: Nodes): string {
  if (node.type === 'break') return '\n';
  if ('value' in node) return node.value;
  if ('children' in node) return node.children.map(text).join('');
  return '';
}

function imageIn(node: Nodes): Image | undefined {
  if (node.type === 'image') return node;
  if ('children' in node) return node.children.map(imageIn).find(Boolean);
}

function linkIn(node: Nodes): Link | undefined {
  if (node.type === 'link') return node;
  if ('children' in node) return node.children.map(linkIn).find(Boolean);
}

const lines = (node: Nodes) => text(node).split('\n').map((line) => line.trim()).filter(Boolean);

export async function readLandingCv() {
  const cv = await renderCv();
  const projects = cvProjectSections.flatMap((key) => {
    const nodes = cv.nodes(key);
    if (!nodes.length) return [];
    const heading = nodes.find((node) => node.type === 'heading');
    const paragraphs = nodes.filter((node): node is Paragraph => node.type === 'paragraph');
    const metadata = paragraphs[0];
    const [role = '', organization = '', dates = ''] = metadata ? lines(metadata) : [];
    const imageParagraph = paragraphs.find(imageIn);
    const image = imageParagraph && imageIn(imageParagraph);
    const imageLink = imageParagraph && linkIn(imageParagraph);
    const stack = paragraphs.find((node) => node.children.length === 1 && node.children[0].type === 'emphasis');
    const talkNode = nodes.find((node) => node.type === 'blockquote');
    const talkLink = talkNode && linkIn(talkNode);

    return [{
      key,
      title: heading ? text(heading) : key,
      role, organization, dates,
      paragraphs: paragraphs.filter((node) => node !== metadata && node !== imageParagraph && node !== stack).map(text),
      image: image?.url ?? '',
      imageAlt: image?.alt ?? '',
      href: imageLink?.url,
      stack: stack ? text(stack).split('·').map((item) => item.trim()).filter(Boolean) : [],
      talk: talkLink && talkNode ? {
        title: text(talkLink), href: talkLink.url, by: lines(talkNode).slice(1).join(' · '),
      } : undefined,
    }];
  });

  const background = cvBackgroundSections.flatMap((key) => {
    const nodes = cv.nodes(key);
    if (!nodes.length) return [];
    const heading = nodes.find((node) => node.type === 'heading');
    return [{
      key,
      title: heading ? text(heading) : key,
      cards: nodes.filter((node): node is Paragraph => node.type === 'paragraph').map((node) => {
        const [title = '', ...body] = lines(node);
        return { title, lines: body };
      }),
    }];
  });

  return {
    meta: cv.meta,
    profile: cv.nodes('Profile').filter((node) => node.type === 'paragraph').map(text),
    projects,
    background,
  };
}
