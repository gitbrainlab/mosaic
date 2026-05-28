/**
 * Ingest Research Output
 *
 * Takes the JSON produced by research-agent.ts and turns it into
 * proper Mosaic map data (manifest + entries) ready to commit.
 *
 * Usage:
 *   tsx scripts/ingest-research.ts data/research-runs/veal-parm-*.json --slug=veal-parm-capital-district
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const inputFile = args[0];
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];

if (!inputFile) {
  console.error('Usage: tsx scripts/ingest-research.ts <research-output.json> --slug=map-slug');
  process.exit(1);
}

const research = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const slug = slugArg || research.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const mapDir = path.join('public', 'data', 'maps', slug);
fs.mkdirSync(mapDir, { recursive: true });

const entries = research.entries;

const imagesDir = path.join(mapDir, 'images');
fs.mkdirSync(imagesDir, { recursive: true });

// Note: Actual image files must be manually downloaded and placed in images/ for now.
// The agent will provide excellent captions and suggested sources.

const manifest = {
  slug,
  title: research.topic,
  tagline: `Community-researched map of ${research.topic.toLowerCase()}`,
  version: '1.0.0',
  totalEntries: entries.length,
  lastUpdated: new Date().toISOString().split('T')[0],
  defaultCenter: [42.75, -73.8],
  defaultZoom: 10,
  filterFields: ['city', 'confidence'],
  chunks: ['entries.json'],
};

fs.writeFileSync(
  path.join(mapDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

fs.writeFileSync(
  path.join(mapDir, 'entries.json'),
  JSON.stringify(entries, null, 2)
);

// Generate actionable photo sourcing document
let photoDoc = `# Photos to Source — ${research.topic}\n\n`;
photoDoc += `Generated: ${new Date().toISOString()}\n\n`;
photoDoc += `**Rules (strict):**\n`;
photoDoc += `- Photos must be tightly cropped on the actual food/product.\n`;
photoDoc += `- Reject parking lots, building exteriors, or generic storefront shots.\n`;
photoDoc += `- Prioritize interesting variants and unique presentations.\n\n`;

entries.forEach((entry: any, i: number) => {
  photoDoc += `## ${i+1}. ${entry.name}\n\n`;
  photoDoc += `**Location**: ${entry.location.address}, ${entry.location.city}\n\n`;

  if (entry.photoBriefs && entry.photoBriefs.length > 0) {
    photoDoc += `**Photo Briefs from Agent:**\n\n`;
    entry.photoBriefs.forEach((brief: any, j: number) => {
      photoDoc += `**${j+1}.** ${brief.searchQuery}\n`;
      photoDoc += `- Expected visual: ${brief.expectedVisual}\n`;
      photoDoc += `- Priority: ${brief.priority}\n`;
      if (brief.suggestedSource) photoDoc += `- Suggested source: ${brief.suggestedSource}\n`;
      photoDoc += `\n`;
    });
  } else if (entry.photos && entry.photos.length > 0) {
    photoDoc += `**Existing photo suggestions:**\n`;
    entry.photos.forEach((p: any) => {
      photoDoc += `- Caption: ${p.caption}\n`;
    });
    photoDoc += `\n`;
  }

  photoDoc += `**Action**: Find 1-3 real product photos and place them in \`images/\` folder.\n`;
  photoDoc += `Recommended filename pattern: \`${entry.id}-01.jpg\`, \`${entry.id}-02.jpg\`\n\n`;
  photoDoc += `---\n\n`;
});

fs.writeFileSync(path.join(mapDir, 'photos-to-source.md'), photoDoc);

console.log(`✅ Ingested ${entries.length} entries into public/data/maps/${slug}/`);
console.log(`   - manifest.json`);
console.log(`   - entries.json`);
console.log(`   - images/ (create this folder and add real product photos)`);
console.log(`   - photos-to-source.md (actionable list of photos to find)`);
console.log(`\nNext: Update public/data/index.json if this is a new map.`);
