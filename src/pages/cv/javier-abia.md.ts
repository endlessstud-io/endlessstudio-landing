import type { APIRoute } from 'astro';
import { cvSource } from '../../lib/cv';

export const GET: APIRoute = () => new Response(cvSource, {
  headers: {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': 'attachment; filename="javier-abia-cv.md"',
  },
});
