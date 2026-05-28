#!/usr/bin/env tsx
/**
 * Photo Preparation Helper
 *
 * Takes a research output and generates:
 * - A clean, human-actionable photo sourcing task list
 * - Suggested folder structure
 * - Ready-to-use image filenames
 *
 * Usage:
 *   npx tsx scripts/prepare-photos.ts data/research-runs/veal-parm-*.json --slug=veal-parm-capital-district
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const inputFile = args[0];
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];

if (!inputFile) {
  console.error('Usage: npx tsx scripts/prepare-photos.ts <research.json> --slug=map-slug');
  process.exit(1);
}

const research = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const slug = slugArg || research.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const mapDir = path.join('public', 'data', 'maps', slug);
const imagesDir = path.join(mapDir, 'images');

console.log(`\n📸 Preparing photo sourcing tasks for: ${research.topic}`);
console.log(`Target folder: ${imagesDir}\n`);

let output = `# Photo Sourcing Tasks — ${research.topic}\n\n`;
output += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;
output += `## Instructions\n\n`;
output += `1. For each entry below, find 1–3 real, high-quality photos.\n`;
output += `2. Photos **must** be tightly cropped on the actual food/product.\n`;
output += `3. Reject any photo that is mostly building, parking lot, or generic storefront.\n`;
output += `4. Save images into \`${imagesDir}\` using the suggested filenames.\n`;
output += `5. Update the corresponding entry in \`entries.json\` with the real relative URLs.\n\n`;
output += `---\n\n`;

research.entries.forEach((entry: any, i: number) => {
  const safeId = entry.id || `item-${i+1}`;

  output += `## ${i+1}. ${entry.name} (${entry.location.city})\n\n`;
  output += `**Suggested filenames**:\n`;
  output += `- \`${safeId}-01.jpg\` (main product shot)\n`;
  output += `- \`${safeId}-02.jpg\` (interesting variant, if available)\n\n`;

  if (entry.photoBriefs && entry.photoBriefs.length > 0) {
    output += `**Agent Photo Briefs**:\n\n`;
    entry.photoBriefs.forEach((brief: any, j: number) => {
      output += `**${j+1}.** Search for: \`${brief.searchQuery}\`\n`;
      output += `   - What to look for: ${brief.expectedVisual}\n`;
      output += `   - Priority: ${brief.priority}\n`;
      if (brief.suggestedSource) output += `   - Good source to check: ${brief.suggestedSource}\n`;
      output += `\n`;
    });
  } else {
    output += `**Note**: No detailed photo briefs were generated for this entry. Use the description + location to find good product photos.\n\n`;
  }

  output += `**Suggested filenames**: \`${safeId}-01.jpg\` (main product), \`${safeId}-02.jpg\` (variant if available)\n`;
  output += `**Status**: [ ] Photos found & correctly named → [ ] Updated in entries.json → [ ] Images committed to repo\n\n`;
  output += `---\n\n`;
});

const outputPath = path.join(mapDir, 'PHOTO-SOURCING-TASKS.md');
fs.writeFileSync(outputPath, output);

console.log(`✅ Created: ${outputPath}`);
console.log(`\nNext steps:`);
console.log(`1. Open the file and start sourcing real product photos.`);
console.log(`2. Place images in ${imagesDir}`);
console.log(`3. Update the "photos" array in entries.json with correct relative paths.`);
console.log(`4. Re-ingest if you want to refresh the markdown.`);
